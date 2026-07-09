import 'server-only'
import {
  ROS_CATEGORIES,
  type ROSCategory,
  scanMessageForROS,
  scanMessageForHPIFields,
  looksClinical,
  type HPIField,
} from '../rosDetector'
import { callModel, extractJson, extractJsonArray } from './llm'
import type { CaseData } from '../../trainer/_lib/types'
import type { RawUsage } from '../analytics'

/**
 * ROS / HPI unlock classification + chat-derived summaries, moved server-side.
 * Behavior mirrors the previous client implementation.
 */

export interface RosUnlockResult {
  category: ROSCategory
  derivedFinding: string
}

export interface AskClassification {
  rosUnlocks: RosUnlockResult[]
  hpiUnlocks: Partial<Record<HPIField, string>>
  usages: Array<{ type: 'ros_classifier' | 'ros_derived'; usage: RawUsage }>
}

/** Which ROS categories does this student message address? */
export async function classifyRosCategories(
  message: string,
  onUsage: (type: 'ros_classifier', usage: RawUsage) => void,
): Promise<ROSCategory[]> {
  const keywordMatches = scanMessageForROS(message)
  if (keywordMatches.length > 0) return keywordMatches
  if (!looksClinical(message)) return []

  try {
    const classifierPrompt = `You are a clinical NLP classifier for a medical training app.
Given the following student message from a patient interview, identify which Review of Systems (ROS) categories were addressed. Return ONLY a JSON array of matched categories from this list:
["Constitutional","HEENT","Cardiovascular","Respiratory","Gastrointestinal","Genitourinary","Musculoskeletal","Neurological","Psychiatric","Integumentary","Endocrine","Hematologic/Lymphatic","Allergic/Immunologic"]
Rules:
- Only include a category if the student ASKED about it
- If no ROS category was addressed, return []
- Return raw JSON only, no explanation, no markdown
Student message: "${message}"`
    const { text, usage } = await callModel('ros_classifier', {
      system: 'You are a JSON-only ROS classifier.',
      messages: [{ role: 'user', content: classifierPrompt }],
      maxTokens: 100,
    })
    onUsage('ros_classifier', usage)
    const aiMatches = extractJsonArray<string>(text.trim())
    return aiMatches.filter((c): c is ROSCategory =>
      (ROS_CATEGORIES as readonly string[]).includes(c))
  } catch {
    return [] // classifier failure is non-fatal
  }
}

/**
 * Derive a clinical summary of what the patient reported for one category.
 * When `previousSummary` is present (follow-up question about an already
 * reviewed system), the model produces an updated CUMULATIVE summary so the
 * record — and therefore the grader — sees everything elicited, not just the
 * first exchange.
 */
export async function deriveRosSummary(
  category: ROSCategory,
  studentMessage: string,
  patientReply: string,
  onUsage: (type: 'ros_derived', usage: RawUsage) => void,
  previousSummary?: string,
): Promise<string> {
  const summarySystem = `You are a clinical documentation assistant. Write a concise clinical sentence summarizing only what the patient actually reported about a specific body system, based on the interview excerpt provided.

Rules:
- Only include what the patient explicitly said or confirmed
- Do NOT include denials of things that were never asked about
- Do NOT add clinical language or findings not present in the conversation
- Do NOT infer or assume — only document what was stated
- If the patient only confirmed one symptom, document only that symptom
- Format: plain clinical prose, no quotes, no preamble
- Maximum ${previousSummary ? 3 : 2} sentences`
  const summaryPrompt = `Body system: ${category}
${previousSummary ? `Previously documented for this system (KEEP everything still accurate from this, and merge in anything new): ${previousSummary}
` : ''}Interview excerpt:
Student: ${studentMessage}
Patient: ${patientReply}

${previousSummary
    ? `Write the updated cumulative summary of everything the patient has reported about ${category} so far.`
    : `Summarize only what the patient reported about ${category}.`}`
  try {
    const { text, usage } = await callModel('derived_summary', {
      system: summarySystem,
      messages: [{ role: 'user', content: summaryPrompt }],
      maxTokens: 150,
    })
    onUsage('ros_derived', usage)
    return text.trim() || previousSummary || `${category}: finding recorded`
  } catch {
    return previousSummary || `${category}: Finding recorded — review after submission`
  }
}

/**
 * Batched variant: when one exchange addresses several ROS categories, derive
 * all summaries in a single call returning JSON keyed by category (previously
 * one call per category). Falls back to the single-call path for one category
 * and to safe placeholders when the batch reply is unusable.
 */
export async function deriveRosSummaries(
  items: Array<{ category: ROSCategory; previousSummary?: string }>,
  studentMessage: string,
  patientReply: string,
  onUsage: (type: 'ros_derived', usage: RawUsage) => void,
): Promise<Record<string, string>> {
  if (items.length === 0) return {}
  if (items.length === 1) {
    const { category, previousSummary } = items[0]
    return { [category]: await deriveRosSummary(category, studentMessage, patientReply, onUsage, previousSummary) }
  }

  const system = `You are a clinical documentation assistant. For EACH body system listed, write a concise clinical summary of only what the patient actually reported, based on the interview excerpt provided.

Rules:
- Only include what the patient explicitly said or confirmed
- Do NOT include denials of things that were never asked about
- Do NOT add clinical language or findings not present in the conversation
- Do NOT infer or assume — only document what was stated
- Where a previous summary is given, produce the updated CUMULATIVE summary (keep everything still accurate, merge in anything new)
- Maximum 2 sentences per system
- Return ONLY a valid JSON object mapping each listed system name (exactly as given) to its summary string. No markdown, no explanation.`
  const prompt = `Body systems to document:
${items.map(i => `- ${i.category}${i.previousSummary ? ` (previously documented: ${i.previousSummary})` : ''}`).join('\n')}

Interview excerpt:
Student: ${studentMessage}
Patient: ${patientReply}

Return the JSON object now.`

  try {
    const { text, usage } = await callModel('derived_summary', {
      system,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 150 * items.length,
    })
    onUsage('ros_derived', usage)
    const parsed = extractJson<Record<string, unknown>>(text)
    const out: Record<string, string> = {}
    for (const { category, previousSummary } of items) {
      const v = parsed[category]
      out[category] = (typeof v === 'string' && v.trim())
        ? v.trim()
        : previousSummary ?? `${category}: finding recorded`
    }
    return out
  } catch {
    const out: Record<string, string> = {}
    for (const { category, previousSummary } of items) {
      out[category] = previousSummary ?? `${category}: Finding recorded — review after submission`
    }
    return out
  }
}

/** HPI background fields addressed by this message, with their values resolved. */
export function resolveHpiUnlocks(
  message: string,
  caseData: CaseData,
): Partial<Record<HPIField, string>> {
  const fields = scanMessageForHPIFields(message)
  if (!fields.length) return {}
  const values: Record<HPIField, string | undefined> = {
    pmh_conditions: caseData.pastMedicalHistory?.conditions,
    pmh_surgeries: caseData.pastMedicalHistory?.surgeries,
    pmh_hospitalizations: caseData.pastMedicalHistory?.hospitalizations,
    med_medications: caseData.currentMedications?.medications,
    med_otc: caseData.currentMedications?.otc,
    soc_smoking: caseData.socialHistory?.smoking,
    soc_alcohol: caseData.socialHistory?.alcohol,
    soc_drugs: caseData.socialHistory?.drugs,
    soc_occupation: caseData.socialHistory?.occupation,
    soc_living: caseData.socialHistory?.living,
    soc_other: caseData.socialHistory?.other,
  }
  const out: Partial<Record<HPIField, string>> = {}
  for (const f of fields) out[f] = values[f] ?? 'None documented.'
  return out
}

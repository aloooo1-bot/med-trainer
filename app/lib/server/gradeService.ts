import 'server-only'
import type { GradingInput, GradingResult } from '../../grading/types'
import { GRADING_SYSTEM_PROMPT, buildRubricPrompt, buildOralPrompt } from '../../grading/rubric'
import { clampDimensions } from '../../grading/clamp'
import { GradingResultSchema } from '../../grading/schemas'
import { formatEvidenceSummary } from '../reasoning/differential'
import { stripStageDirections } from '../transcriptText'
import { resolveResult } from './orderService'
import { callModel } from './llm'
import { selectHpiForDifficulty } from './caseTiers'
import type { TrainerSessionRecord } from './sessionStore'
import type { ReplayedState } from './replay'
import type { CaseData } from '../../trainer/_lib/types'
import type { RawUsage } from '../analytics'

/**
 * Server-side grading. The grading input is assembled EXCLUSIVELY from the
 * server-side session event log plus the case's ground truth — the client
 * sends only its diagnosis text (and reasoning/presentation text). It can no
 * longer inflate the record of what it asked, examined, or ordered.
 */

export type GradingUsageCallback = (type: 'grading_main' | 'grading_oral', usage: RawUsage) => void

/**
 * The structured "information elicited" record (authoritative for grading).
 * Built from the event log: unlocked ROS categories with their chat-derived
 * findings, unlocked HPI fields, exam regions performed, and tests ordered.
 */
export function buildElicitedRecord(state: ReplayedState): string {
  const parts: string[] = []

  const rosEntries = Object.entries(state.ros)
  parts.push(
    rosEntries.length
      ? `ROS systems reviewed (${rosEntries.length}/13), with what the patient actually reported:\n` +
        rosEntries.map(([cat, v]) => `  - ${cat}: ${v?.derivedFinding ?? '(recorded)'}`).join('\n')
      : 'ROS systems reviewed: none',
  )

  const hpiEntries = Object.entries(state.hpi)
  parts.push(
    hpiEntries.length
      ? 'Background-history fields elicited:\n' +
        hpiEntries.map(([field, value]) => `  - ${field}: ${value}`).join('\n')
      : 'Background-history fields elicited: none',
  )

  parts.push(
    state.exams.length
      ? 'Exam regions performed (in order):\n' +
        state.exams.map(e => `  - ${e.region}: ${e.finding}`).join('\n')
      : 'Exam regions performed: none',
  )

  parts.push(
    state.orderedTests.length
      ? `Tests ordered (${state.orderedTests.length}): ${state.orderedTests.join(' | ')}`
      : 'Tests ordered: none',
  )

  return parts.join('\n')
}

// Formatting goes through the same resolver as /api/session/order (including
// fuzzy synonym matching), so a test the student saw a result for is never
// graded as "(no result available)".
function formatOrderedLabResults(orderedTests: string[], caseData: CaseData): string {
  return orderedTests
    .flatMap(t => {
      const res = resolveResult(t, caseData)
      if (res.kind === 'imaging' || res.kind === 'procedure') return []
      if (res.kind === 'pending') return [`${t}: (result still pending at submission — not available to the student)`]
      if (res.kind !== 'lab' || !res.labResult) {
        return [`${t}: (no result available for this case — plausible order with no modeled result; treat as NEUTRAL, never as low-value or wasted)`]
      }
      const r = res.labResult
      if (Array.isArray(r?.components) && r.components.length > 0) {
        return [`${t}:\n` + r.components.map(c => `  ${c.name}: ${c.value} ${c.unit} (ref: ${c.referenceRange}) [${c.status}]`).join('\n')]
      }
      const display = r?.value ? `${r.value} ${r.unit ?? ''}`.trim() : (r?.result ?? '')
      return [`${t}: ${display} (ref: ${r?.referenceRange ?? '—'}) [${r?.status ?? 'unknown'}]`]
    })
    .join('\n')
}

function formatOrderedImagingResults(orderedTests: string[], caseData: CaseData): string {
  return orderedTests
    .flatMap(t => {
      const res = resolveResult(t, caseData)
      if ((res.kind === 'imaging' || res.kind === 'procedure') && res.report !== undefined) {
        return [`${t}: ${res.report}`]
      }
      return []
    })
    .join('\n')
}

export function assembleGradingInput(
  session: TrainerSessionRecord,
  state: ReplayedState,
  submittedDiagnosis: string,
  reasoningText: string,
  timedOut: boolean,
): GradingInput {
  const caseData = session.caseData
  const caseDifficulty = session.difficulty

  // Roleplay gestures are stripped from the patient's side: they are theatre,
  // and the grader was reading "*touches chest*" as though it were reported
  // history. The physician's own words are left untouched.
  const chatSummary = state.chat
    .map(m => m.role === 'user'
      ? `Physician: ${m.content}`
      : `Patient: ${stripStageDirections(m.content)}`)
    .join('\n')

  // Pre-presented info — visible in the HPI panel from the start at Foundations;
  // gated (and therefore NOT pre-presented) at Clinical/Advanced.
  const prePresentedParts: string[] = []
  if (caseDifficulty === 'Foundations') {
    const pmh = caseData.pastMedicalHistory
    if (pmh?.conditions) prePresentedParts.push(`Past Medical History: ${pmh.conditions}`)
    if (pmh?.surgeries) prePresentedParts.push(`Surgeries: ${pmh.surgeries}`)
    if (pmh?.hospitalizations) prePresentedParts.push(`Hospitalizations: ${pmh.hospitalizations}`)
    const meds = caseData.currentMedications
    if (meds?.medications) prePresentedParts.push(`Medications: ${meds.medications}`)
    if (meds?.otc) prePresentedParts.push(`OTC/Supplements: ${meds.otc}`)
    const soc = caseData.socialHistory
    if (soc) {
      const socParts = [
        soc.smoking && `Smoking: ${soc.smoking}`,
        soc.alcohol && `Alcohol: ${soc.alcohol}`,
        soc.drugs && `Drugs: ${soc.drugs}`,
        soc.occupation && `Occupation: ${soc.occupation}`,
        soc.living && `Living: ${soc.living}`,
        soc.other && `Other: ${soc.other}`,
      ].filter(Boolean)
      if (socParts.length) prePresentedParts.push(`Social History: ${socParts.join('; ')}`)
    }
  }
  const prePresentedInfo = prePresentedParts.length ? prePresentedParts.join('\n') : undefined

  // Full background ground truth so the grader never flags real case facts as
  // fabricated (anti-fabrication rule) — unchanged from the previous assembly.
  const backgroundParts: string[] = []
  if (caseData.pastMedicalHistory) {
    const pmh = caseData.pastMedicalHistory
    if (pmh.conditions) backgroundParts.push(`Past Medical History: ${pmh.conditions}`)
    if (pmh.surgeries) backgroundParts.push(`Surgeries: ${pmh.surgeries}`)
    if (pmh.hospitalizations) backgroundParts.push(`Hospitalizations: ${pmh.hospitalizations}`)
  }
  if (caseData.currentMedications) {
    const meds = caseData.currentMedications
    if (meds.medications) backgroundParts.push(`Current Medications: ${meds.medications}`)
    if (meds.otc) backgroundParts.push(`OTC/Supplements: ${meds.otc}`)
  }
  if (caseData.socialHistory) {
    const soc = caseData.socialHistory
    const socParts = [
      soc.smoking && `Smoking: ${soc.smoking}`,
      soc.alcohol && `Alcohol: ${soc.alcohol}`,
      soc.drugs && `Drugs: ${soc.drugs}`,
      soc.occupation && `Occupation: ${soc.occupation}`,
      soc.living && `Living: ${soc.living}`,
      soc.other && `Other: ${soc.other}`,
    ].filter(Boolean)
    if (socParts.length) backgroundParts.push(`Social History: ${socParts.join('; ')}`)
  }
  if (caseData.hiddenHistory.familyHistory) backgroundParts.push(`Family History: ${caseData.hiddenHistory.familyHistory}`)
  if (caseData.hiddenHistory.socialHistory && !caseData.socialHistory) backgroundParts.push(`Social History (hidden): ${caseData.hiddenHistory.socialHistory}`)
  if (caseData.hiddenHistory.medications && !caseData.currentMedications?.medications) backgroundParts.push(`Medications (hidden): ${caseData.hiddenHistory.medications}`)
  if (caseData.hiddenHistory.hiddenSymptoms) backgroundParts.push(`Additional Symptoms (available if asked): ${caseData.hiddenHistory.hiddenSymptoms}`)
  if (caseData.hiddenHistory.allergies) backgroundParts.push(`Allergies: ${caseData.hiddenHistory.allergies}`)
  if (caseData.hiddenHistory.fullHistory) backgroundParts.push(`Full Background History: ${caseData.hiddenHistory.fullHistory}`)

  const v = caseData.vitals
  backgroundParts.push(`Vitals: BP ${v.bp}, HR ${v.hr}, RR ${v.rr}, Temp ${v.temp}°C, SpO2 ${v.spo2}%`)
  const examLines = Object.entries(caseData.physicalExam)
    .map(([region, finding]) => `${region}: ${finding}`)
    .join('\n')
  if (examLines) backgroundParts.push(`Physical Exam:\n${examLines}`)
  const backgroundHistory = backgroundParts.length ? backgroundParts.join('\n') : '(none recorded)'

  const expectedLabs = caseData.expectedLabs?.length ? caseData.expectedLabs : undefined
  const expectedImaging = caseData.expectedImaging?.length ? caseData.expectedImaging : undefined
  const coreLabs = new Set([...(expectedLabs ?? []), ...(expectedImaging ?? [])])
  const supplementaryTests = caseData.relevantTests
    ?.filter(t => !coreLabs.has(t.name))
    .map(t => t.name)

  const prediction = state.prediction

  return {
    patientInfo: `${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, CC: "${caseData.patientInfo.chiefComplaint}"`,
    hpi: selectHpiForDifficulty(caseData, caseDifficulty),
    backgroundHistory,
    difficulty: caseDifficulty,
    orderedLabResults: formatOrderedLabResults(state.orderedTests, caseData) || '(no labs ordered)',
    orderedImagingResults: formatOrderedImagingResults(state.orderedTests, caseData) || '(no imaging ordered)',
    chatSummary: chatSummary || '(physician did not interview the patient)',
    elicitedRecord: buildElicitedRecord(state),
    reasoningText,
    submittedDiagnosis,
    correctDiagnosis: caseData.diagnosis,
    keyQuestions: caseData.keyQuestions,
    teachingPoints: caseData.teachingPoints,
    differentials: caseData.differentials,
    prePresentedInfo,
    timedOut,
    revealedExamRegions: state.exams.map(e => e.region),
    relevantExamRegions: caseData.relevantExamRegions ?? [],
    ...(expectedLabs?.length ? { expectedLabs } : {}),
    ...(expectedImaging?.length ? { expectedImaging } : {}),
    ...(supplementaryTests?.length ? { supplementaryTests } : {}),
    ...((caseData.differentialPriors?.length ?? 0) > 0
      ? { differentialAnalysis: formatEvidenceSummary(caseData.differentialPriors!, caseData.testImpacts ?? {}, state.orderedTests) }
      : {}),
    ...(prediction && prediction.ranking[0]
      ? {
          studentPrediction: `Before ordering any tests, the student committed to a leading diagnosis of "${prediction.ranking[0]}"${prediction.confidence != null ? ` at ${Math.round(prediction.confidence * 100)}% confidence` : ''}.`,
        }
      : {}),
  }
}

/**
 * Extract the first balanced JSON object from a model reply. Unlike a greedy
 * `/\{[\s\S]*\}/`, this scans brace depth (respecting strings/escapes) so a
 * response with trailing prose — or one truncated mid-array after the object's
 * braces balanced — still yields parseable JSON. Throws only when the object
 * never closes (a genuine truncation).
 */
function parseGradingObject(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object in grading response')
  let depth = 0, inString = false, escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return JSON.parse(text.slice(start, i + 1))
    }
  }
  throw new Error('Grading JSON truncated before the object closed')
}

export async function gradeSession(
  input: GradingInput,
  onUsage?: GradingUsageCallback,
): Promise<GradingResult> {
  const prompt = buildRubricPrompt(input)

  // Grade with one retry: a verbose case can exceed the token budget and
  // truncate the JSON. Rather than 500 on a completed case, retry once with
  // more headroom before surfacing the failure.
  let parsed: unknown | null = null
  for (const maxTokens of [3000, 4096]) {
    const { text, usage } = await callModel('grading', {
      system: GRADING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      maxTokens,
    })
    onUsage?.('grading_main', usage)
    try {
      parsed = parseGradingObject(text)
      break
    } catch (e) {
      console.warn(`[grade] parse failed at maxTokens=${maxTokens}: ${(e as Error).message}`)
    }
  }
  if (parsed === null) throw new Error('Grading response could not be parsed after retry')

  const result = GradingResultSchema.parse(parsed) as GradingResult

  clampDimensions(result, input.difficulty)
  if (result.dimensions) {
    result.score = Object.values(result.dimensions).reduce(
      (sum, dim) => sum + (dim?.score ?? 0), 0,
    )
  }

  if (input.difficulty === 'Advanced' && input.reasoningText) {
    try {
      const oralPrompt = buildOralPrompt(
        input.patientInfo,
        input.correctDiagnosis,
        input.keyQuestions,
        input.reasoningText,
      )
      const { text: oText, usage: oUsage } = await callModel('grading_oral', {
        system: GRADING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: oralPrompt }],
        maxTokens: 600,
      })
      onUsage?.('grading_oral', oUsage)
      const oMatch = oText.match(/\{[\s\S]*\}/)
      if (oMatch) {
        const oData = JSON.parse(oMatch[0])
        result.presentation = {
          scores: oData.scores,
          presentationTotal: oData.presentationTotal,
          presentationFeedback: oData.presentationFeedback,
          criticalMisses: oData.criticalMisses,
        }
      }
    } catch {
      // oral grading failure is non-fatal
    }
  }

  return result
}

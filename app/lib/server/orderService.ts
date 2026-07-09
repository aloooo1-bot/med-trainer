import 'server-only'
import { findResultKey, isECGTest } from '../../trainer/_lib/testUtils'
import { isPendingTest, pendingHours } from '../../trainer/_lib/pendingTests'
import { getSpecialModality, type SpecialModality } from '../specialImageLookup'
import { fuzzyResolveTest } from '../testMatch'
import { callModel } from './llm'
import type { CaseData } from '../../trainer/_lib/types'
import type { RawUsage } from '../analytics'

const SPECIAL_FINDING_FIELDS: Record<SpecialModality, keyof CaseData> = {
  smear: 'hematologyFindings',
  biopsy: 'biopsyFindings',
  fundus: 'fundusFindings',
  derm: 'skinFindings',
  urine: 'urineFindings',
}

export type { OrderedTestResult } from '../../trainer/_lib/sessionTypes'
import type { OrderedTestResult } from '../../trainer/_lib/sessionTypes'

/** Resolve one ordered test against the case snapshot. */
export function resolveResult(test: string, caseData: CaseData): OrderedTestResult {
  const base: OrderedTestResult = { test, kind: 'none' }

  const modality = getSpecialModality(test)
  if (modality) {
    base.specialModality = modality
    const finding = caseData[SPECIAL_FINDING_FIELDS[modality]] as string | undefined
    if (finding) base.specialFindings = finding
  }

  const direct = resolveByKey(test, base, caseData)
  if (direct) return direct

  // Exact/alias/substring matching missed — fuzzy-match the free-typed order
  // against this case's result keys + MASTER_TEST_LIST synonyms (4.3) before
  // declaring no result. A clear winner auto-resolves; a contested match
  // returns suggestions so the student confirms the canonical name.
  const candidateKeys = [
    ...Object.keys(caseData.labResults ?? {}),
    ...Object.keys(caseData.imagingResults ?? {}),
    ...Object.keys(caseData.procedureResults ?? {}),
  ]
  const fuzzy = fuzzyResolveTest(test, candidateKeys)
  if (fuzzy.match) {
    const resolved = resolveByKey(fuzzy.match, base, caseData)
    if (resolved) return { ...resolved, test, resolvedFrom: fuzzy.match }
  }
  if (fuzzy.suggestions.length) {
    return { ...base, kind: 'ambiguous', suggestions: fuzzy.suggestions }
  }

  if (isPendingTest(test)) {
    return { ...base, kind: 'pending', pendingHours: pendingHours(test) }
  }
  return base
}

function resolveByKey(test: string, base: OrderedTestResult, caseData: CaseData): OrderedTestResult | null {
  const labKey = findResultKey(test, caseData.labResults)
  if (labKey) {
    return { ...base, kind: 'lab', labResult: caseData.labResults[labKey] }
  }
  const imgKey = findResultKey(test, caseData.imagingResults)
  if (imgKey) {
    const out: OrderedTestResult = { ...base, kind: 'imaging', report: caseData.imagingResults[imgKey] }
    if (isECGTest(base.test)) {
      out.isECG = true
      out.ecgFindings = caseData.ecgFindings
    }
    return out
  }
  const procKey = caseData.procedureResults ? findResultKey(test, caseData.procedureResults) : null
  if (procKey) {
    return { ...base, kind: 'procedure', report: caseData.procedureResults![procKey] }
  }
  return null
}

/** Synthesize a missing result and return an updated snapshot, or null. */
export async function generateOnDemand(
  testName: string,
  caseData: CaseData,
  onUsage: (usage: RawUsage) => void,
): Promise<{ caseData: CaseData } | null> {
  try {
    const isLikelyImaging = /\b(x.?ray|xray|mri|ct\b|ultrasound|echo|scan|radiograph|pet|mibg|dexa|bone scan|doppler|angiograph|spirometry|pfts|pulmonary function|ecg|ekg|holter|stress test|endoscopy|colonoscopy|bronchoscopy|biopsy|lumbar puncture|paracentesis|thoracentesis|arthrocentesis|nerve conduction|electromyography|emg\b|eeg\b|tilt table)\b/i.test(testName)
    const prompt = `Case context: ${caseData.patientInfo.age}yo ${caseData.patientInfo.gender}, diagnosis: "${caseData.diagnosis}", comorbidities: "${caseData.pastMedicalHistory?.conditions ?? 'none'}"

Generate a realistic result for the ordered test: "${testName}"
The result should be clinically appropriate for this patient's diagnosis and comorbidities.

Return ONLY valid JSON — no markdown, no explanation:
{
  "isImaging": ${isLikelyImaging},
  "labResult": {
    "components": [
      { "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }
    ]
  },
  "imagingResult": "<2-3 sentence radiology-style report — only include if isImaging is true>"
}`
    const { text, usage } = await callModel('on_demand_result', {
      system: 'You are a medical simulator. Generate realistic, clinically consistent test results. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
    })
    onUsage(usage)
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const data = JSON.parse(m[0]) as {
      isImaging?: boolean
      labResult?: CaseData['labResults'][string]
      imagingResult?: string
    }
    if (data.isImaging && data.imagingResult) {
      return { caseData: { ...caseData, imagingResults: { ...caseData.imagingResults, [testName]: data.imagingResult } } }
    }
    if (data.labResult) {
      return { caseData: { ...caseData, labResults: { ...caseData.labResults, [testName]: data.labResult } } }
    }
    return null
  } catch (e) {
    console.error(`[order] on-demand generation failed for "${testName}":`, e)
    return null
  }
}

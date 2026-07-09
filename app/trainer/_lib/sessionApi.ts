import type { CaseData } from './types'
import type { CasePresentation, CaseReveal, OrderedTestResult } from './sessionTypes'

/**
 * Client helpers for the /api/session/* routes: the fetch wrapper and the
 * pure functions that fold server payloads into the client's working
 * CaseData view (which only ever contains what the student has earned).
 */

export async function postSession<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim()
    throw new Error(`Server error (${res.status}) — unexpected non-JSON response: ${preview || '(empty)'}`)
  }
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data?.error ?? `API error ${res.status}`) as Error & { status?: number; data?: unknown }
    err.status = res.status
    err.data = data
    throw err
  }
  return data as T
}

/** Build the client's working CaseData view from a server presentation slice. */
export function presentationToClientCase(p: CasePresentation): CaseData {
  return {
    patientInfo: p.patientInfo,
    hpi: p.hpi,
    vitals: p.vitals,
    pastMedicalHistory: p.pastMedicalHistory,
    currentMedications: p.currentMedications,
    socialHistory: p.socialHistory,
    reviewOfSystems: p.reviewOfSystems ?? {},
    physicalExam: p.physicalExam ?? Object.fromEntries(p.examRegions.map(r => [r, ''])),
    availableLabs: p.availableLabs ?? [],
    availableImaging: p.availableImaging ?? [],
    labGroups: p.labGroups,
    labResults: {},
    imagingResults: {},
    procedureResults: {},
    hiddenHistory: { fullHistory: '', socialHistory: '', familyHistory: '', medications: '', hiddenSymptoms: '', allergies: '' },
    diagnosis: '',
    differentials: [],
    teachingPoints: [],
    keyQuestions: [],
    differentialPriors: p.differentialPriors,
    testImpacts: p.testImpacts,
  }
}

/** Merge one ordered-test result from the server into the client case view. */
export function mergeOrderResult(prev: CaseData, r: OrderedTestResult): CaseData {
  const next = { ...prev }
  if (r.kind === 'lab' && r.labResult) {
    next.labResults = { ...next.labResults, [r.test]: r.labResult }
  } else if (r.kind === 'imaging' && r.report !== undefined) {
    next.imagingResults = { ...next.imagingResults, [r.test]: r.report }
    if (r.ecgFindings) next.ecgFindings = r.ecgFindings
  } else if (r.kind === 'procedure' && r.report !== undefined) {
    next.procedureResults = { ...(next.procedureResults ?? {}), [r.test]: r.report }
  }
  if (r.specialFindings && r.specialModality) {
    const field = ({
      smear: 'hematologyFindings', biopsy: 'biopsyFindings', fundus: 'fundusFindings',
      derm: 'skinFindings', urine: 'urineFindings',
    } as const)[r.specialModality]
    next[field] = r.specialFindings
  }
  return next
}

/** Merge the post-grading reveal into the client case view. */
export function mergeReveal(prev: CaseData, reveal: CaseReveal): CaseData {
  return {
    ...prev,
    diagnosis: reveal.diagnosis,
    differentials: reveal.differentials,
    teachingPoints: reveal.teachingPoints,
    keyQuestions: reveal.keyQuestions,
    mechanism: reveal.mechanism,
    differentialPriors: reveal.differentialPriors ?? prev.differentialPriors,
    testImpacts: reveal.testImpacts ?? prev.testImpacts,
    reviewOfSystems: Object.keys(reveal.reviewOfSystems).length ? reveal.reviewOfSystems : prev.reviewOfSystems,
    expectedLabs: reveal.expectedLabs,
    expectedImaging: reveal.expectedImaging,
  }
}

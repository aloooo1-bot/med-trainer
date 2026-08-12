import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRubricPrompt, buildOralPrompt, GRADING_SYSTEM_PROMPT } from '../rubric'
import type { GradingInput } from '../types'

const baseInput: GradingInput = {
  patientInfo: '45yo male, CC: "chest pain"',
  hpi: 'Patient presents with crushing chest pain radiating to left arm for 2 hours.',
  backgroundHistory: 'Hypertension, Diabetes. Aspirin 81mg daily.',
  difficulty: 'Clinical',
  orderedLabResults: 'Troponin: 2.5 ng/mL (ref: 0-0.04) [critical]',
  orderedImagingResults: 'EKG: ST elevation in leads II, III, aVF',
  chatSummary: 'Physician: Any chest pain? Patient: Yes, crushing.',
  reasoningText: 'ST elevation + troponin rise consistent with inferior STEMI.',
  submittedDiagnosis: 'STEMI',
  correctDiagnosis: 'STEMI (inferior)',
  keyQuestions: ['Onset of chest pain', 'Radiation to arm or jaw'],
  teachingPoints: ['STEMI requires emergent PCI within 90 minutes'],
  differentials: ['NSTEMI', 'Aortic dissection', 'PE'],
  timedOut: false,
}

test('buildRubricPrompt includes patient info', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('45yo male'))
  assert.ok(prompt.includes('"chest pain"'))
})

// A grader justified recommending sputum AFB by calling a patient with no HIV,
// no steroids, no diabetes and no malignancy an "immunocompromised-risk
// patient" — inventing a risk factor because the rubric demands a specific
// concrete justification below 80% of max and never required it to be true.

test('the background history block is declared closed-world', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('COMPLETE and CLOSED'),
    'absence from Background History must read as evidence of absence, not missing data')
  assert.ok(prompt.includes('do not infer unlisted conditions'))
})

test('the concrete-deduction requirement forbids manufacturing one', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('never to manufacture one'),
    'the rule that demands a specific deduction must also forbid inventing it')
  assert.ok(prompt.includes('never attribute to the patient a risk factor'))
})

test('buildRubricPrompt omits the differential-consistency block when no analysis is provided', () => {
  const prompt = buildRubricPrompt(baseInput)
  // The actual injected ranking block (not the differentials-output instruction) is absent.
  assert.ok(!prompt.includes('computed from this case'))
  assert.ok(!prompt.includes("Student's pre-test commitment:"))
  assert.ok(!prompt.includes('PRE-TEST COMMITMENT:'))
})

test('buildRubricPrompt binds the differential discussion to the board model when provided', () => {
  const prompt = buildRubricPrompt({
    ...baseInput,
    differentialAnalysis: '1. STEMI (inferior) (100%) — confirmed by EKG\n2. PE (0%) — excluded by EKG',
    studentPrediction: 'Before ordering any tests, the student committed to a leading diagnosis of "STEMI" at 80% confidence.',
  })
  assert.ok(prompt.includes('computed from this case'))
  assert.ok(prompt.includes('confirmed by EKG'))
  assert.ok(prompt.includes("Student's pre-test commitment:"))
  assert.ok(prompt.includes('PRE-TEST COMMITMENT:'))
  assert.ok(prompt.includes('MUST be consistent with it'))
})

test('buildRubricPrompt includes submitted and correct diagnosis', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('"STEMI"'))
  assert.ok(prompt.includes('"STEMI (inferior)"'))
})

test('buildRubricPrompt includes teaching points as JSON', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('STEMI requires emergent PCI'))
})

test('buildRubricPrompt includes reasoning text when provided', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('ST elevation + troponin rise'))
})

test('buildRubricPrompt shows placeholder when no reasoning', () => {
  const prompt = buildRubricPrompt({ ...baseInput, reasoningText: '' })
  assert.ok(prompt.includes('(No clinical reasoning text provided)'))
})

test('buildRubricPrompt includes overtime note when timedOut=true', () => {
  const prompt = buildRubricPrompt({ ...baseInput, timedOut: true })
  assert.ok(prompt.includes('over the case time limit'))
})

test('buildRubricPrompt does NOT include overtime note when timedOut=false', () => {
  const prompt = buildRubricPrompt({ ...baseInput, timedOut: false })
  assert.ok(!prompt.includes('over the case time limit'))
})

test('buildRubricPrompt includes Advanced test ordering note for Advanced difficulty', () => {
  const prompt = buildRubricPrompt({ ...baseInput, difficulty: 'Advanced' })
  assert.ok(prompt.includes('free-text search'))
})

test('buildRubricPrompt does NOT include Advanced note for Clinical difficulty', () => {
  const prompt = buildRubricPrompt({ ...baseInput, difficulty: 'Clinical' })
  assert.ok(!prompt.includes('free-text search'))
})

test('GRADING_SYSTEM_PROMPT is non-empty and mentions medical education', () => {
  assert.ok(GRADING_SYSTEM_PROMPT.length > 50)
  assert.ok(GRADING_SYSTEM_PROMPT.includes('medical education'))
})

test('buildOralPrompt includes patient info and presentation text', () => {
  const prompt = buildOralPrompt(
    '45yo male, CC: "chest pain"',
    'STEMI (inferior)',
    ['Onset of chest pain'],
    'This is a 45-year-old male presenting with crushing chest pain.'
  )
  assert.ok(prompt.includes('45yo male'))
  assert.ok(prompt.includes('STEMI (inferior)'))
  assert.ok(prompt.includes('crushing chest pain'))
})

// ── Per-difficulty weight and structure tests ─────────────────────────────────

test('Foundations prompt: declares 4 categories summing to 100, no Clinical Reasoning', () => {
  const p = buildRubricPrompt({ ...baseInput, difficulty: 'Foundations' })
  assert.ok(p.includes('must sum to 100'))
  assert.ok(p.includes('History & Interview (historyInterview): 24 points'))
  assert.ok(p.includes('Test Ordering (testOrdering): 24 points'))
  assert.ok(p.includes('Diagnosis Accuracy (diagnosisAccuracy): 36 points'))
  assert.ok(p.includes('Diagnosis Completeness (diagnosisCompleteness): 16 points'))
  assert.ok(!p.includes('Clinical Reasoning (clinicalReasoning)'))
  assert.ok(!p.match(/CLINICAL REASONING \(\/[0-9]+\):/))
})

test('Foundations Return JSON template omits clinicalReasoning', () => {
  const p = buildRubricPrompt({ ...baseInput, difficulty: 'Foundations' })
  const returnBlock = p.split('Return:')[1]
  assert.ok(returnBlock, 'Return block must exist')
  assert.ok(!returnBlock.includes('"clinicalReasoning"'))
})

test('Clinical prompt: declares 5 categories summing to 100, includes Clinical Reasoning', () => {
  const p = buildRubricPrompt({ ...baseInput, difficulty: 'Clinical' })
  assert.ok(p.includes('must sum to 100'))
  assert.ok(p.includes('History & Interview (historyInterview): 20 points'))
  assert.ok(p.includes('Diagnosis Accuracy (diagnosisAccuracy): 30 points'))
  assert.ok(p.includes('Clinical Reasoning (clinicalReasoning): 15 points'))
  assert.ok(!p.includes('examinationFocus'))
  assert.ok(p.match(/CLINICAL REASONING \(\/15\):/))
})

test('Clinical Return JSON template includes clinicalReasoning', () => {
  const p = buildRubricPrompt({ ...baseInput, difficulty: 'Clinical' })
  const returnBlock = p.split('Return:')[1]
  assert.ok(returnBlock.includes('"clinicalReasoning"'))
})

test('Advanced prompt: same weights as Clinical', () => {
  const p = buildRubricPrompt({ ...baseInput, difficulty: 'Advanced' })
  assert.ok(p.includes('Clinical Reasoning (clinicalReasoning): 15 points'))
  assert.ok(p.match(/CLINICAL REASONING \(\/15\):/))
})

// ── Bug 1: added specificity rules ───────────────────────────────────────────

test('ADDED SPECIFICITY RULE present in prompt', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('ADDED SPECIFICITY RULE'))
  assert.ok(p.includes('clinically accurate and supported by the case'))
})

test('ABBREVIATION RULE present in prompt', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('ABBREVIATION RULE'))
  assert.ok(p.includes('parentheses'))
  assert.ok(p.includes('EDH'))
})

test('INCORRECT ADDED SPECIFICITY rule present in prompt', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('INCORRECT ADDED SPECIFICITY'))
  assert.ok(p.includes('clinically wrong'))
})

// ── Key-question ceiling scales with the misses ──────────────────────────────
//
// The rule used to cap historyInterview at 61% of max the instant a SECOND key
// question was missed, justified as "missed half or more". Every case in the
// library carries exactly 5 key questions, so it fired at 40% of the list and
// made the 2nd miss cost several times the 1st — a cliff, on a dimension whose
// own rubric says to reward targeted questioning over exhaustive checklists.

// Clinical historyInterview is /20 over a 5-question list: 60% of the dimension
// spread across 5 questions is 2.4 points per full-weight miss.
const fiveQuestions: GradingInput = {
  ...baseInput,
  keyQuestions: [
    'Recent dental work or procedures',
    'Injection drug use',
    'Prosthetic valve or prior valve disease',
    'Indwelling catheter or recent instrumentation',
    'Prior episode of endocarditis',
  ],
}

test('key-question ceiling declines one step at a time, with no cliff', () => {
  const p = buildRubricPrompt(fiveQuestions)
  assert.ok(p.includes('1 missed → historyInterview ≤ 18/20'))
  assert.ok(p.includes('2 missed → historyInterview ≤ 15/20'))
  assert.ok(p.includes('3 missed → historyInterview ≤ 13/20'))
  assert.ok(p.includes('4 missed → historyInterview ≤ 10/20'))
  assert.ok(p.includes('5 missed → historyInterview ≤ 8/20'))
  assert.ok(p.includes('NO fixed cliff'))
})

test('the second miss costs no more than the first', () => {
  const p = buildRubricPrompt(fiveQuestions)
  const ceilings = [...p.matchAll(/(\d) missed → historyInterview ≤ (\d+)\/20/g)]
    .map(m => Number(m[2]))
  assert.equal(ceilings.length, 5)
  const steps = ceilings.slice(1).map((c, i) => ceilings[i] - c)
  const first = 20 - ceilings[0]
  for (const step of steps) {
    assert.ok(step <= first + 1,
      `each successive miss must cost about as much as the first (${first}), got ${step}`)
  }
})

test('the old fixed 2-miss cap is gone from both the rule and the band list', () => {
  const p = buildRubricPrompt(fiveQuestions)
  assert.ok(!p.includes('If N_missed ≥ 2'),
    'the categorical 2-miss cap must not survive anywhere in the prompt')
  assert.ok(!p.includes('missed half or more'))
  assert.ok(!p.includes('Only drop to 12 if the student missed 2+ questions'),
    'the HISTORY & INTERVIEW band list must not re-impose its own fixed cap')
  assert.ok(p.includes('governed ENTIRELY by the KEY-QUESTION PROPORTIONAL FLOOR RULE'))
})

test('misses are weighted by whether they change management', () => {
  const p = buildRubricPrompt(fiveQuestions)
  assert.ok(p.includes('FULL (1.0)'))
  assert.ok(p.includes('HALF (0.5)'))
  assert.ok(p.includes('independently change management'),
    'a miss that changes nothing must not cost what a management-relevant one does')
  assert.ok(p.includes('never deduct for them twice'),
    'incidental surfacing is already half-credited upstream')
})

test('the ceiling table is derived from the case\'s own key-question count', () => {
  // Two questions, so one miss is half the list and costs proportionally more.
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('This case lists 2 key questions'))
  assert.ok(p.includes('1 missed → historyInterview ≤ 14/20'))
  assert.ok(p.includes('2 missed → historyInterview ≤ 8/20'))
  assert.ok(!p.includes('3 missed →'), 'the table stops at the number of questions that exist')
})

test('Foundations scales the same rule over its larger dimension', () => {
  const p = buildRubricPrompt({ ...fiveQuestions, difficulty: 'Foundations' })
  assert.ok(p.includes('1 missed → historyInterview ≤ 21/24'))
  assert.ok(p.includes('2 missed → historyInterview ≤ 18/24'))
})

test('the whole block is omitted when the case lists no key questions', () => {
  const p = buildRubricPrompt({ ...baseInput, keyQuestions: [] })
  assert.ok(!p.includes('KEY-QUESTION PROPORTIONAL FLOOR RULE'),
    'a case with no key questions has no checklist to cap against')
  assert.ok(!p.includes('missed → historyInterview'))
})

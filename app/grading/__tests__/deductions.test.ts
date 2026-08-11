import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampDimensions, reconcileDeductions } from '../clamp'
import { normalizeMissedQuestions, type GradingResult, type GradingInput } from '../types'
import { GradingResultSchema } from '../schemas'
import { buildRubricPrompt, getRubric } from '../rubric'

function makeResult(testOrdering: GradingResult['dimensions'] extends undefined ? never : { score: number; feedback: string; deductions?: Array<{ points: number; reason: string }> }): GradingResult {
  return {
    score: 0,
    correct: true,
    feedback: '',
    strengths: [],
    missedQuestions: [],
    teachingPoints: [],
    differentials: [],
    dimensions: {
      historyInterview:      { score: 20, feedback: '', deductions: [] },
      testOrdering,
      diagnosisAccuracy:     { score: 30, feedback: '', deductions: [] },
      diagnosisCompleteness: { score: 15, feedback: '', deductions: [] },
      clinicalReasoning:     { score: 15, feedback: '', deductions: [] },
    },
  }
}

// ── the core invariant ───────────────────────────────────────────────────────

test('deductions that explain the gap are left exactly as returned', () => {
  const r = makeResult({
    score: 15, feedback: '',
    deductions: [
      { points: 3, reason: 'did not order CBC' },
      { points: 1, reason: 'did not order TSH' },
      { points: 1, reason: 'no severity context' },
    ],
  })
  reconcileDeductions(r, 'Clinical')
  assert.equal(r.dimensions!.testOrdering.score, 15)
  assert.equal(r.dimensions!.testOrdering.deductions!.length, 3)
  const sum = r.dimensions!.testOrdering.deductions!.reduce((s, d) => s + d.points, 0)
  assert.equal(sum, 20 - 15)
})

test('a score above what its deductions allow is lowered to max − sum', () => {
  // score 15/20 with a 9-point deduction implies 11 — the model under-subtracted.
  const r = makeResult({
    score: 15, feedback: '',
    deductions: [{ points: 9, reason: 'did not order CBC' }],
  })
  reconcileDeductions(r, 'Clinical')
  assert.equal(r.dimensions!.testOrdering.score, 11, 'lowered to what the list justifies')
  assert.equal(r.dimensions!.testOrdering.deductions!.length, 1, 'items are kept')
})

test('full marks alongside deductions — the shipped contradiction — is corrected', () => {
  // The real-world case: clinicalReasoning 15/15 with three −5 deductions shown
  // to the student. Consistent score is 0/15, and the headline recomputes.
  const r = makeResult({ score: 20, feedback: '', deductions: [] })
  r.dimensions!.clinicalReasoning = {
    score: 15, feedback: 'anchoring bias',
    deductions: [
      { points: 5, reason: 'anchored on organism without cultures' },
      { points: 5, reason: 'missed pre-LP imaging with focal deficits' },
      { points: 5, reason: 'no differential articulated' },
    ],
  }
  reconcileDeductions(r, 'Clinical')
  assert.equal(r.dimensions!.clinicalReasoning!.score, 0)
  // gradeSession recomputes the headline from the rubric dimensions after this
  // pass — emulate it to prove the top line self-corrects (37 → 22 shape).
  const dims = r.dimensions!
  const headline = getRubric('Clinical').reduce((s, { key }) => s + (dims[key]?.score ?? 0), 0)
  assert.equal(headline, 85) // hi 20 + to 20 + da 30 + dc 15 + cr 0 — the inflated 15 no longer counts
})

test('a score LOWER than the list implies is never raised', () => {
  // 10/20 with a single 3-point item: the list under-explains the 10-point gap.
  const r = makeResult({
    score: 10, feedback: '',
    deductions: [{ points: 3, reason: 'did not order CBC' }],
  })
  reconcileDeductions(r, 'Clinical')
  assert.equal(r.dimensions!.testOrdering.score, 10, 'under-explained gap keeps the score')
})

test('the implied score floors at 0 when deductions exceed the max', () => {
  const r = makeResult({
    score: 18, feedback: '',
    deductions: [{ points: 15, reason: 'a' }, { points: 15, reason: 'b' }],
  })
  reconcileDeductions(r, 'Clinical')
  assert.equal(r.dimensions!.testOrdering.score, 0)
})

test('unusable deduction items are dropped', () => {
  const r = makeResult({
    score: 15, feedback: '',
    deductions: [
      { points: 5, reason: 'did not order CBC' },
      { points: 0, reason: 'explains nothing' },
      { points: -2, reason: 'negative' },
      { points: Number.NaN, reason: 'not a number' },
      { points: 3, reason: '   ' },
    ],
  })
  reconcileDeductions(r, 'Clinical')
  const kept = r.dimensions!.testOrdering.deductions!
  assert.equal(kept.length, 1)
  assert.equal(kept[0].reason, 'did not order CBC')
})

test('a full-marks dimension carries no deductions', () => {
  const r = makeResult({ score: 20, feedback: '', deductions: [] })
  reconcileDeductions(r, 'Clinical')
  assert.deepEqual(r.dimensions!.testOrdering.deductions, [])
})

test('reconciliation runs safely after clamping an illegal score', () => {
  const r = makeResult({ score: 99, feedback: '', deductions: [{ points: 2, reason: 'x' }] })
  clampDimensions(r, 'Clinical')
  reconcileDeductions(r, 'Clinical')
  // Clamped 99 → 20 first; then the 2-point item implies 18, and a clamped-to-max
  // score with a live deduction is exactly the inflated case — lowered to 18.
  assert.equal(r.dimensions!.testOrdering.score, 18)
  assert.equal(r.dimensions!.testOrdering.deductions!.length, 1)
})

// ── schema ───────────────────────────────────────────────────────────────────

test('the schema keeps deductions instead of stripping them', () => {
  // ScoreDimensionSchema is a plain z.object, which strips undeclared keys —
  // this is the regression that would make the whole feature silently vanish.
  const parsed = GradingResultSchema.parse({
    score: 15, correct: true, feedback: '', strengths: [],
    missedQuestions: [], teachingPoints: [], differentials: [],
    dimensions: {
      historyInterview:      { score: 20, feedback: '' },
      testOrdering:          { score: 15, feedback: '', deductions: [{ points: 5, reason: 'no CBC' }] },
      diagnosisAccuracy:     { score: 30, feedback: '' },
      diagnosisCompleteness: { score: 15, feedback: '' },
    },
  })
  assert.equal(parsed.dimensions!.testOrdering.deductions?.[0].reason, 'no CBC')
  assert.deepEqual(parsed.dimensions!.historyInterview.deductions, [], 'defaults to empty, never undefined')
})

// ── missed questions: backward compatibility ─────────────────────────────────

test('legacy string missedQuestions still validate and normalise', () => {
  const parsed = GradingResultSchema.parse({
    score: 50, correct: false, feedback: '', strengths: [],
    missedQuestions: ['Cobb angle progression', 'Cord compression symptoms'],
    teachingPoints: [], differentials: [],
  })
  const normalized = normalizeMissedQuestions(parsed.missedQuestions)
  assert.deepEqual(normalized, [
    { question: 'Cobb angle progression', youAsked: null },
    { question: 'Cord compression symptoms', youAsked: null },
  ])
})

test('cited missedQuestions pass through with their quote', () => {
  const normalized = normalizeMissedQuestions([
    { question: 'Cobb angle progression', youAsked: 'any back problems?' },
    { question: 'Cord compression symptoms' },
    'a legacy one',
  ])
  assert.equal(normalized[0].youAsked, 'any back problems?')
  assert.equal(normalized[1].youAsked, null, 'absent youAsked reads as never approached')
  assert.equal(normalized[2].question, 'a legacy one')
})

test('normalizeMissedQuestions tolerates junk without throwing', () => {
  assert.deepEqual(normalizeMissedQuestions(undefined), [])
  assert.deepEqual(normalizeMissedQuestions([]), [])
  assert.deepEqual(normalizeMissedQuestions(['', '   ']), [], 'blank entries are not rendered')
})

// ── prompt ───────────────────────────────────────────────────────────────────

const baseInput: GradingInput = {
  patientInfo: '67yo female', hpi: 'Dyspnea.', backgroundHistory: 'TB.',
  difficulty: 'Clinical', orderedLabResults: '', orderedImagingResults: '',
  chatSummary: '', reasoningText: '', submittedDiagnosis: 'x', correctDiagnosis: 'y',
  keyQuestions: [], teachingPoints: [], differentials: [], timedOut: false,
}

test('the prompt requires deductions to sum to the gap', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('ITEMISED DEDUCTIONS'))
  assert.ok(p.includes('sum to EXACTLY (max − score)'))
  assert.ok(p.includes('"deductions"'), 'the Return template must ask for the field')
})

test('the prompt forbids inventing line items to make the arithmetic work', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('do not'), 'anti-fabrication clause present')
  assert.ok(p.includes('you removed too many points'))
  assert.ok(p.includes('An invented line item is worse than a blunt score'))
})

test('the prompt requires the score to have its deductions already subtracted', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('score = max − (sum of that dimension\'s deductions)'))
  assert.ok(p.includes('self-contradictory'))
})

test('the prompt treats HPI-stated facts as pre-answered for missedQuestions and scoring', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('AND the case HPI at the top of this prompt'))
  assert.ok(p.includes('PRE-ANSWERED'))
  assert.ok(p.includes('or that is stated in the HPI counts as covered'))
})

test('the prompt asks for youAsked and forbids fabricating the quote', () => {
  const p = buildRubricPrompt(baseInput)
  assert.ok(p.includes('youAsked'))
  assert.ok(p.includes('Do NOT invent or reconstruct a quote'))
})

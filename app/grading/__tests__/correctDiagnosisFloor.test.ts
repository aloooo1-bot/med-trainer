import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enforceCorrectDiagnosisFloor } from '../clamp'
import { correctDiagnosisFloor, getRubric, type DimensionKey } from '../rubric'
import type { GradingResult, ScoreDimension } from '../types'

// The rubric promises a correct diagnosis a floor (82 Clinical/Advanced, 86
// Foundations) as a MUST with its own verify step — and a real Clinical
// endocarditis case still came back at 70/100 with the diagnosis, the organism
// and a coherent workup all correct. Five dimensions each deducted defensibly
// and nothing summed them. A prompt cannot enforce a threshold; this can.

type Dims = NonNullable<GradingResult['dimensions']>

function makeResult(scores: Record<string, number>, correct = true): GradingResult {
  const dimensions = Object.fromEntries(
    Object.entries(scores).map(([k, score]) => [k, { score, feedback: '', deductions: [] } as ScoreDimension]),
  ) as Dims
  return {
    score: 0, correct, feedback: '', strengths: [], dimensions,
    missedQuestions: [], teachingPoints: [], differentials: [],
  }
}

const total = (r: GradingResult, difficulty: string) =>
  getRubric(difficulty).reduce((s, { key }) => s + (r.dimensions![key]?.score ?? 0), 0)

// ── The case that motivated this ─────────────────────────────────────────────

test('the endocarditis grade that returned 70 with a correct diagnosis reaches the floor', () => {
  const r = makeResult({
    historyInterview: 12, testOrdering: 11, diagnosisAccuracy: 28,
    diagnosisCompleteness: 11, clinicalReasoning: 8,
  })
  assert.equal(total(r, 'Clinical'), 70, 'the recorded grade, before enforcement')

  enforceCorrectDiagnosisFloor(r, 'Clinical')

  assert.equal(total(r, 'Clinical'), 82)
  assert.equal(r.dimensions!.testOrdering.score, 20, 'testOrdering is restored first, to its max')
  assert.equal(r.dimensions!.historyInterview.score, 15, 'historyInterview absorbs the remainder')
  assert.equal(r.dimensions!.diagnosisAccuracy.score, 28, 'the diagnosis dimensions are left as graded')
  assert.equal(r.dimensions!.diagnosisCompleteness.score, 11)
  assert.equal(r.dimensions!.clinicalReasoning!.score, 8)
})

// ── When it must not fire ────────────────────────────────────────────────────

test('a wrong diagnosis is never floored', () => {
  const r = makeResult({
    historyInterview: 12, testOrdering: 11, diagnosisAccuracy: 8,
    diagnosisCompleteness: 4, clinicalReasoning: 5,
  }, false)
  enforceCorrectDiagnosisFloor(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 40, 'the wrong-diagnosis cap is a different rule and must stay reachable')
})

test('a grade already above the floor is untouched', () => {
  const r = makeResult({
    historyInterview: 18, testOrdering: 18, diagnosisAccuracy: 30,
    diagnosisCompleteness: 14, clinicalReasoning: 13,
  })
  enforceCorrectDiagnosisFloor(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 93)
  assert.equal(r.dimensions!.testOrdering.score, 18, 'no dimension is inflated once the floor is met')
})

test('a grade exactly at the floor is untouched', () => {
  const r = makeResult({
    historyInterview: 15, testOrdering: 15, diagnosisAccuracy: 28,
    diagnosisCompleteness: 12, clinicalReasoning: 12,
  })
  enforceCorrectDiagnosisFloor(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 82)
  assert.equal(r.dimensions!.testOrdering.score, 15)
})

test('Foundations uses its own higher floor', () => {
  const r = makeResult({
    historyInterview: 14, testOrdering: 14, diagnosisAccuracy: 30, diagnosisCompleteness: 12,
  })
  assert.equal(total(r, 'Foundations'), 70)
  enforceCorrectDiagnosisFloor(r, 'Foundations')
  assert.equal(total(r, 'Foundations'), correctDiagnosisFloor('Foundations'))
  assert.equal(total(r, 'Foundations'), 86)
})

test('clinicalReasoning is not counted at Foundations, where the rubric omits it', () => {
  const r = makeResult({
    historyInterview: 14, testOrdering: 14, diagnosisAccuracy: 30, diagnosisCompleteness: 12,
  })
  enforceCorrectDiagnosisFloor(r, 'Foundations')
  assert.equal(r.dimensions!.clinicalReasoning, undefined)
})

// ── Deductions stay honest ───────────────────────────────────────────────────

test('raising a score shrinks its deductions to match, keeping every reason', () => {
  const r = makeResult({
    historyInterview: 12, testOrdering: 11, diagnosisAccuracy: 28,
    diagnosisCompleteness: 11, clinicalReasoning: 8,
  })
  r.dimensions!.testOrdering.deductions = [
    { points: 5, reason: 'did not order echocardiography' },
    { points: 2, reason: 'did not order ESR or CRP' },
    { points: 2, reason: 'did not order urinalysis with microscopy' },
  ]
  r.dimensions!.historyInterview.deductions = [
    { points: 4, reason: 'did not ask about recent dental work' },
    { points: 4, reason: 'did not ask about known valve disease' },
  ]

  enforceCorrectDiagnosisFloor(r, 'Clinical')

  assert.equal(total(r, 'Clinical'), 82)

  // The echo was the pivotal confirmatory test. The floor may reduce what
  // skipping it costs; it may not refund it and delete the lesson.
  const to = r.dimensions!.testOrdering
  assert.ok(to.score < 20, 'testOrdering is not lifted to a clean max')
  assert.equal(to.score, 15, 'capped at max − its largest deduction (5, the echo)')
  assert.equal(to.deductions!.reduce((s, d) => s + d.points, 0), 5, 'points sum to the new gap')
  assert.equal(to.deductions!.length, 3, 'all three real gaps survive — only their cost shrinks')
  assert.ok(to.deductions!.some(d => d.reason.includes('echocardiography')))

  const hi = r.dimensions!.historyInterview
  assert.equal(hi.score, 16)
  assert.equal(hi.deductions!.reduce((s, d) => s + d.points, 0), 4)
  assert.equal(hi.deductions!.length, 2)
  assert.ok(hi.deductions!.some(d => d.reason.includes('dental work')))
  assert.ok(hi.deductions!.some(d => d.reason.includes('valve disease')))
})

test('every named gap still costs something after the floor is applied', () => {
  const r = makeResult({
    historyInterview: 12, testOrdering: 11, diagnosisAccuracy: 28,
    diagnosisCompleteness: 11, clinicalReasoning: 8,
  })
  for (const key of ['historyInterview', 'testOrdering', 'clinicalReasoning'] as DimensionKey[]) {
    r.dimensions![key]!.deductions = [{ points: 4, reason: `gap in ${key}` }]
  }
  enforceCorrectDiagnosisFloor(r, 'Clinical')

  assert.equal(total(r, 'Clinical'), 82)
  for (const key of ['historyInterview', 'testOrdering', 'clinicalReasoning'] as DimensionKey[]) {
    const dim = r.dimensions![key]!
    const spec = getRubric('Clinical').find(d => d.key === key)!
    if (dim.deductions!.length > 0) {
      assert.ok(dim.score < spec.max, `${key} kept a deduction but was raised to max`)
    }
  }
})

test('the floor still wins when preserving every gap would leave it unreachable', () => {
  // Each dimension carries a deduction larger than its shortfall, so the
  // gap-preserving pass alone cannot get there.
  const r = makeResult({
    historyInterview: 5, testOrdering: 5, diagnosisAccuracy: 20,
    diagnosisCompleteness: 5, clinicalReasoning: 5,
  })
  for (const { key, max } of getRubric('Clinical')) {
    r.dimensions![key]!.deductions = [{ points: max - 1, reason: `everything wrong in ${key}` }]
  }
  assert.equal(total(r, 'Clinical'), 40)

  enforceCorrectDiagnosisFloor(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 82, 'the floor is a guarantee, and outranks the courtesy')
})

test('deductions never outnumber the points left to explain', () => {
  const r = makeResult({
    historyInterview: 4, testOrdering: 20, diagnosisAccuracy: 30,
    diagnosisCompleteness: 15, clinicalReasoning: 15,
  })
  r.dimensions!.historyInterview.deductions = [
    { points: 6, reason: 'a' }, { points: 5, reason: 'b' },
    { points: 3, reason: 'c' }, { points: 2, reason: 'd' },
  ]
  enforceCorrectDiagnosisFloor(r, 'Clinical')

  const hi = r.dimensions!.historyInterview
  const gap = 20 - hi.score
  assert.equal(hi.deductions!.reduce((s, d) => s + d.points, 0), gap)
  assert.ok(hi.deductions!.length <= gap, 'a 1-point item cannot be halved, so the smallest are dropped')
  assert.ok(hi.deductions!.every(d => d.points >= 1), 'no zero-point line items')
})

test('the surviving deductions keep the order the grader listed them in', () => {
  const r = makeResult({
    historyInterview: 5, testOrdering: 20, diagnosisAccuracy: 30,
    diagnosisCompleteness: 15, clinicalReasoning: 15,
  })
  r.dimensions!.historyInterview.deductions = [
    { points: 2, reason: 'first' }, { points: 9, reason: 'second' }, { points: 4, reason: 'third' },
  ]
  enforceCorrectDiagnosisFloor(r, 'Clinical')

  const reasons = r.dimensions!.historyInterview.deductions!.map(d => d.reason)
  assert.deepEqual(reasons, [...reasons].sort((a, b) =>
    ['first', 'second', 'third'].indexOf(a) - ['first', 'second', 'third'].indexOf(b)))
})

// ── Edges ────────────────────────────────────────────────────────────────────

test('spills past the stated order when the process dimensions are already full', () => {
  const r = makeResult({
    historyInterview: 20, testOrdering: 20, diagnosisAccuracy: 15,
    diagnosisCompleteness: 5, clinicalReasoning: 5,
  })
  assert.equal(total(r, 'Clinical'), 65)
  enforceCorrectDiagnosisFloor(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 82, 'the floor is a guarantee, not a best effort')
})

test('no dimension is ever raised above its max', () => {
  const r = makeResult({
    historyInterview: 1, testOrdering: 1, diagnosisAccuracy: 1,
    diagnosisCompleteness: 1, clinicalReasoning: 1,
  })
  enforceCorrectDiagnosisFloor(r, 'Clinical')
  for (const { key, max } of getRubric('Clinical')) {
    assert.ok(r.dimensions![key]!.score <= max, `${key} exceeded its max`)
  }
})

test('a result with no dimensions is left alone', () => {
  const r: GradingResult = {
    score: 40, correct: true, feedback: '', strengths: [],
    missedQuestions: [], teachingPoints: [], differentials: [],
  }
  enforceCorrectDiagnosisFloor(r, 'Clinical')
  assert.equal(r.score, 40)
  assert.equal(r.dimensions, undefined)
})

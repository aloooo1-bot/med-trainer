import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enforceWrongDiagnosisCap, enforceCorrectDiagnosisFloor } from '../clamp'
import { getRubric, partialCreditBand, wrongDiagnosisCap, type DimensionKey } from '../rubric'
import type { GradingResult, ScoreDimension } from '../types'

// The mirror of the correct-diagnosis floor, unenforced for the same reason:
// stated to the grader as a MUST with a verify step, with nothing summing the
// dimensions afterwards. The damaging case is a thorough workup that reaches the
// wrong answer — every process dimension scores highly and the rubric's whole
// position is that naming the wrong entity cannot be a passing grade.

type Dims = NonNullable<GradingResult['dimensions']>

function makeResult(scores: Record<string, number>, correct = false): GradingResult {
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

// ── The 60 cap ───────────────────────────────────────────────────────────────

test('a thorough workup with the wrong diagnosis is capped at 60', () => {
  // Excellent process, wrong entity: diagnosisAccuracy below the partial band.
  const r = makeResult({
    historyInterview: 19, testOrdering: 19, diagnosisAccuracy: 6,
    diagnosisCompleteness: 5, clinicalReasoning: 13,
  })
  assert.equal(total(r, 'Clinical'), 62)

  enforceWrongDiagnosisCap(r, 'Clinical')

  assert.equal(total(r, 'Clinical'), 60)
  assert.equal(r.dimensions!.historyInterview.score, 17, 'historyInterview is reduced first')
  assert.equal(r.dimensions!.testOrdering.score, 19, 'testOrdering is untouched while history has room')
})

test('the reduction spills to testOrdering when history runs out', () => {
  const r = makeResult({
    historyInterview: 4, testOrdering: 20, diagnosisAccuracy: 10,
    diagnosisCompleteness: 15, clinicalReasoning: 15,
  })
  assert.equal(total(r, 'Clinical'), 64)

  enforceWrongDiagnosisCap(r, 'Clinical')

  assert.equal(total(r, 'Clinical'), 60)
  assert.equal(r.dimensions!.historyInterview.score, 0, 'history is exhausted first')
  assert.equal(r.dimensions!.testOrdering.score, 20, 'only 4 were needed, and history covered them')
})

// ── The 70 partial-credit cap ────────────────────────────────────────────────

test('right system, wrong process gets the softer 70 cap', () => {
  const band = partialCreditBand('Clinical')
  const r = makeResult({
    historyInterview: 18, testOrdering: 18, diagnosisAccuracy: band.min,
    diagnosisCompleteness: 10, clinicalReasoning: 14,
  })
  assert.ok(total(r, 'Clinical') > 70)

  enforceWrongDiagnosisCap(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 70)
})

test('the partial band is inclusive at both ends', () => {
  const band = partialCreditBand('Clinical')
  assert.equal(wrongDiagnosisCap('Clinical', band.min), 70)
  assert.equal(wrongDiagnosisCap('Clinical', band.max), 70)
  assert.equal(wrongDiagnosisCap('Clinical', band.min - 1), 60, 'below the band is a plain wrong answer')
  assert.equal(wrongDiagnosisCap('Clinical', band.max + 1), 60,
    'above the band means near-full accuracy, which correct=false contradicts — no leniency')
})

test('Foundations derives its own band from its larger diagnosisAccuracy max', () => {
  const clinical = partialCreditBand('Clinical')
  const foundations = partialCreditBand('Foundations')
  assert.ok(foundations.min > clinical.min, 'the /36 dimension has a higher band than the /30')
  const r = makeResult({
    historyInterview: 22, testOrdering: 22, diagnosisAccuracy: foundations.min, diagnosisCompleteness: 7,
  })
  enforceWrongDiagnosisCap(r, 'Foundations')
  assert.equal(total(r, 'Foundations'), 70)
})

// ── When it must not fire ────────────────────────────────────────────────────

test('a correct diagnosis is never capped', () => {
  const r = makeResult({
    historyInterview: 18, testOrdering: 18, diagnosisAccuracy: 30,
    diagnosisCompleteness: 14, clinicalReasoning: 13,
  }, true)
  enforceWrongDiagnosisCap(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 93, 'the floor and the cap must never both apply')
})

test('a wrong diagnosis already under the cap is untouched', () => {
  const r = makeResult({
    historyInterview: 10, testOrdering: 10, diagnosisAccuracy: 5,
    diagnosisCompleteness: 3, clinicalReasoning: 6,
  })
  enforceWrongDiagnosisCap(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 34)
  assert.deepEqual(r.dimensions!.historyInterview.deductions, [], 'no cap deduction is invented')
})

test('a wrong diagnosis exactly at the cap is untouched', () => {
  const r = makeResult({
    historyInterview: 15, testOrdering: 15, diagnosisAccuracy: 10,
    diagnosisCompleteness: 8, clinicalReasoning: 12,
  })
  assert.equal(total(r, 'Clinical'), 60)
  enforceWrongDiagnosisCap(r, 'Clinical')
  assert.equal(total(r, 'Clinical'), 60)
  assert.deepEqual(r.dimensions!.testOrdering.deductions, [])
})

// ── The student can see why ──────────────────────────────────────────────────

test('every point removed by the cap is named as the cap', () => {
  const r = makeResult({
    historyInterview: 19, testOrdering: 19, diagnosisAccuracy: 6,
    diagnosisCompleteness: 5, clinicalReasoning: 13,
  })
  r.dimensions!.historyInterview.deductions = [{ points: 1, reason: 'did not ask about travel' }]

  enforceWrongDiagnosisCap(r, 'Clinical')

  const hi = r.dimensions!.historyInterview
  assert.equal(hi.score, 17)
  assert.equal(hi.deductions!.length, 2, 'the original gap survives alongside the cap')
  assert.ok(hi.deductions!.some(d => d.reason.includes('did not ask about travel')))
  const capLine = hi.deductions!.find(d => d.reason.includes('capped at 60/100'))
  assert.ok(capLine, 'the cap must name itself rather than removing points silently')
  assert.equal(capLine!.points, 2, 'it accounts for exactly what the cap took')
})

test('the cap deduction quotes the partial-credit ceiling when that is the one applied', () => {
  const band = partialCreditBand('Clinical')
  const r = makeResult({
    historyInterview: 18, testOrdering: 18, diagnosisAccuracy: band.min,
    diagnosisCompleteness: 10, clinicalReasoning: 14,
  })
  enforceWrongDiagnosisCap(r, 'Clinical')
  const lines = Object.values(r.dimensions!).flatMap(d => d?.deductions ?? [])
  assert.ok(lines.some(d => d.reason.includes('capped at 70/100')))
  assert.ok(!lines.some(d => d.reason.includes('capped at 60/100')), 'never quote a ceiling that was not applied')
})

// ── Interaction with the floor ───────────────────────────────────────────────

test('floor and cap are mutually exclusive and safe to run in sequence', () => {
  for (const correct of [true, false]) {
    const r = makeResult({
      historyInterview: 19, testOrdering: 19, diagnosisAccuracy: 6,
      diagnosisCompleteness: 5, clinicalReasoning: 13,
    }, correct)
    enforceCorrectDiagnosisFloor(r, 'Clinical')
    enforceWrongDiagnosisCap(r, 'Clinical')
    const t = total(r, 'Clinical')
    if (correct) assert.equal(t, 82, 'correct=true takes the floor and the cap does nothing')
    else assert.equal(t, 60, 'correct=false takes the cap and the floor does nothing')
  }
})

test('no dimension is ever driven below zero', () => {
  const r = makeResult({
    historyInterview: 2, testOrdering: 2, diagnosisAccuracy: 28,
    diagnosisCompleteness: 15, clinicalReasoning: 15,
  })
  enforceWrongDiagnosisCap(r, 'Clinical')
  for (const key of getRubric('Clinical').map(d => d.key as DimensionKey)) {
    assert.ok(r.dimensions![key]!.score >= 0, `${key} went negative`)
  }
})

test('a result with no dimensions is left alone', () => {
  const r: GradingResult = {
    score: 95, correct: false, feedback: '', strengths: [],
    missedQuestions: [], teachingPoints: [], differentials: [],
  }
  enforceWrongDiagnosisCap(r, 'Clinical')
  assert.equal(r.score, 95)
})

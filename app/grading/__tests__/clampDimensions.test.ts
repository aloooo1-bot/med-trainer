import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampDimensions } from '../clamp'
import type { GradingResult } from '../types'

function makeResult(overrides: Partial<NonNullable<GradingResult['dimensions']>>): GradingResult {
  return {
    score: 0,
    correct: true,
    feedback: '',
    strengths: [],
    missedQuestions: [],
    teachingPoints: [],
    differentials: [],
    dimensions: {
      historyInterview:      { score: 18, feedback: '' },
      testOrdering:          { score: 18, feedback: '' },
      diagnosisAccuracy:     { score: 27, feedback: '' },
      diagnosisCompleteness: { score: 13, feedback: '' },
      clinicalReasoning:     { score: 12, feedback: '' },
      ...overrides,
    },
  }
}

test('clampDimensions: in-range scores are unchanged', () => {
  const result = makeResult({})
  clampDimensions(result, 'Clinical')
  assert.equal(result.dimensions!.clinicalReasoning!.score, 12)
  assert.equal(result.dimensions!.diagnosisAccuracy.score, 27)
})

test('clampDimensions: over-max score is clamped to max', () => {
  const result = makeResult({ clinicalReasoning: { score: 25, feedback: '' } })
  clampDimensions(result, 'Clinical')
  assert.equal(result.dimensions!.clinicalReasoning!.score, 15)
})

test('clampDimensions: negative score is clamped to 0', () => {
  const result = makeResult({ historyInterview: { score: -5, feedback: '' } })
  clampDimensions(result, 'Clinical')
  assert.equal(result.dimensions!.historyInterview.score, 0)
})

test('clampDimensions: does not corrupt total when used before reduce', () => {
  const result = makeResult({
    clinicalReasoning:     { score: 25, feedback: '' },
    historyInterview:      { score: 999, feedback: '' },
  })
  clampDimensions(result, 'Clinical')
  // After clamp: 20 + 18 + 27 + 13 + 15 = 93
  result.score = Object.values(result.dimensions!).reduce((s, d) => s + (d?.score ?? 0), 0)
  assert.ok(result.score <= 100, `score ${result.score} should be ≤ 100`)
})

test('clampDimensions: Foundations difficulty uses correct maxes', () => {
  const result: GradingResult = {
    score: 0,
    correct: true,
    feedback: '',
    strengths: [],
    missedQuestions: [],
    teachingPoints: [],
    differentials: [],
    dimensions: {
      historyInterview:      { score: 999, feedback: '' },
      testOrdering:          { score: 999, feedback: '' },
      diagnosisAccuracy:     { score: 999, feedback: '' },
      diagnosisCompleteness: { score: 999, feedback: '' },
    },
  }
  clampDimensions(result, 'Foundations')
  assert.equal(result.dimensions!.historyInterview.score, 24)
  assert.equal(result.dimensions!.testOrdering.score, 24)
  assert.equal(result.dimensions!.diagnosisAccuracy.score, 36)
  assert.equal(result.dimensions!.diagnosisCompleteness.score, 16)
})

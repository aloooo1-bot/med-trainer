import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scorePrediction, brierScore, calibrationSummary } from '../prediction'
import type { BeliefState } from '../types'

const beliefs = (order: string[]): BeliefState[] =>
  order.map((name, i) => ({ name, probability: (order.length - i) / order.length }))

test('a perfect ranking scores 100 and registers a top hit', () => {
  const engine = beliefs(['NSTEMI', 'Pericarditis', 'PE', 'GERD'])
  const r = scorePrediction(['NSTEMI', 'Pericarditis', 'PE', 'GERD'], engine)
  assert.equal(r.score, 100)
  assert.equal(r.topHit, true)
  assert.equal(r.comparedCount, 4)
})

test('a reversed ranking scores near 0', () => {
  const engine = beliefs(['NSTEMI', 'Pericarditis', 'PE', 'GERD'])
  const r = scorePrediction(['GERD', 'PE', 'Pericarditis', 'NSTEMI'], engine)
  assert.equal(r.topHit, false)
  assert.ok(r.score <= 5, `expected near-0, got ${r.score}`)
})

test('right top pick but mid-order shuffle scores high but not perfect', () => {
  const engine = beliefs(['NSTEMI', 'Pericarditis', 'PE', 'GERD'])
  const r = scorePrediction(['NSTEMI', 'PE', 'Pericarditis', 'GERD'], engine)
  assert.equal(r.topHit, true)
  assert.ok(r.score > 50 && r.score < 100)
})

test('only diagnoses present in both are compared', () => {
  const engine = beliefs(['NSTEMI', 'Pericarditis', 'PE'])
  const r = scorePrediction(['NSTEMI', 'Pericarditis', 'PE', 'Something Else'], engine)
  assert.equal(r.comparedCount, 3)
  assert.equal(r.topHit, true)
})

test('empty / disjoint input yields a zero score without throwing', () => {
  const engine = beliefs(['A', 'B'])
  const r = scorePrediction([], engine)
  assert.equal(r.score, 0)
  assert.equal(r.comparedCount, 0)
  assert.equal(r.engineTop, 'A')
})

test('brierScore: confident+correct ≈ 0, confident+wrong ≈ 1', () => {
  assert.ok(brierScore(0.9, true) < 0.02)
  assert.ok(brierScore(0.9, false) > 0.8)
  assert.equal(brierScore(0.5, true), 0.25)
  // out-of-range confidence is clamped
  assert.equal(brierScore(1.5, true), 0)
})

test('calibrationSummary flags overconfidence when stated >> actual', () => {
  const pairs = [
    { confidence: 0.9, correct: false },
    { confidence: 0.9, correct: false },
    { confidence: 0.9, correct: true },
  ]
  const s = calibrationSummary(pairs)!
  assert.equal(s.n, 3)
  assert.equal(s.avgConfidence, 90)
  assert.equal(s.actualAccuracy, 33)
  assert.equal(s.verdict, 'overconfident')
})

test('calibrationSummary flags underconfidence and well-calibrated', () => {
  const under = calibrationSummary([
    { confidence: 0.4, correct: true },
    { confidence: 0.4, correct: true },
  ])!
  assert.equal(under.verdict, 'underconfident')
  const ok = calibrationSummary([
    { confidence: 0.7, correct: true },
    { confidence: 0.7, correct: false },
    { confidence: 0.7, correct: true },
  ])!
  assert.equal(ok.verdict, 'well-calibrated')
  assert.equal(calibrationSummary([]), null)
})

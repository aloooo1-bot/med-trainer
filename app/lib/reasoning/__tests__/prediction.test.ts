import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scorePrediction } from '../prediction'
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

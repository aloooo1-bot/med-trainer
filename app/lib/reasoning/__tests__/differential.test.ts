import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePriors,
  applyTestResult,
  computeBeliefs,
  entropy,
  discriminatingValue,
  rankTestsByValue,
  bestNextTest,
  formatEvidenceSummary,
} from '../differential'
import type { DifferentialPrior, TestImpacts } from '../types'

const PRIORS: DifferentialPrior[] = [
  { name: 'NSTEMI', prior: 0.5, category: 'leading' },
  { name: 'Pericarditis', prior: 0.3, category: 'alternative' },
  { name: 'Aortic dissection', prior: 0.2, category: 'cant-miss' },
]

const TEST_IMPACTS: TestImpacts = {
  'Troponin (serial)': {
    NSTEMI: { effect: 'confirms', why: 'rising delta' },
    Pericarditis: { effect: 'argues-against', why: 'no kinetics' },
    'Aortic dissection': { effect: 'neutral', why: 'nonspecific' },
  },
  'CT aortogram': {
    NSTEMI: { effect: 'neutral', why: 'unrelated' },
    Pericarditis: { effect: 'neutral', why: 'unrelated' },
    'Aortic dissection': { effect: 'excludes', why: 'no dissection flap' },
  },
}

const approxSum = (probs: number[]) => probs.reduce((a, b) => a + b, 0)

test('normalizePriors produces a distribution summing to 1', () => {
  const beliefs = normalizePriors(PRIORS)
  assert.ok(Math.abs(approxSum(beliefs.map(b => b.probability)) - 1) < 1e-9)
  assert.equal(beliefs.length, 3)
})

test('normalizePriors falls back to uniform when all weights are zero', () => {
  const beliefs = normalizePriors([
    { name: 'A', prior: 0 },
    { name: 'B', prior: 0 },
  ])
  assert.equal(beliefs[0].probability, 0.5)
  assert.equal(beliefs[1].probability, 0.5)
})

test('applyTestResult: confirms raises the target, renormalized to 1', () => {
  const beliefs = normalizePriors(PRIORS)
  const after = applyTestResult(beliefs, TEST_IMPACTS['Troponin (serial)'])
  const nstemi = after.find(b => b.name === 'NSTEMI')!
  const peri = before(after, 'Pericarditis')
  assert.ok(nstemi.probability > 0.5, 'NSTEMI should rise above its prior')
  assert.ok(peri < 0.3, 'Pericarditis should fall below its prior')
  assert.ok(Math.abs(approxSum(after.map(b => b.probability)) - 1) < 1e-9)
})

test('applyTestResult: excludes drives a differential toward zero', () => {
  const beliefs = normalizePriors(PRIORS)
  const after = applyTestResult(beliefs, TEST_IMPACTS['CT aortogram'])
  const dissection = after.find(b => b.name === 'Aortic dissection')!
  assert.ok(dissection.probability < 0.01, 'excluded dx should be ~0')
})

test('computeBeliefs applies a sequence and returns sorted descending', () => {
  const beliefs = computeBeliefs(PRIORS, TEST_IMPACTS, ['Troponin (serial)', 'CT aortogram'])
  assert.equal(beliefs[0].name, 'NSTEMI')
  for (let i = 1; i < beliefs.length; i++) {
    assert.ok(beliefs[i - 1].probability >= beliefs[i].probability)
  }
})

test('entropy is maximal for uniform and ~0 for near-certain', () => {
  const uniform = normalizePriors([
    { name: 'A', prior: 1 },
    { name: 'B', prior: 1 },
  ])
  assert.ok(Math.abs(entropy(uniform) - 1) < 1e-9) // 1 bit for 2 equally-likely
  const certain = [
    { name: 'A', probability: 0.999 },
    { name: 'B', probability: 0.001 },
  ]
  assert.ok(entropy(certain) < 0.05)
})

test('discriminatingValue rewards a test that sharpens the differential', () => {
  const beliefs = normalizePriors(PRIORS)
  const v = discriminatingValue(beliefs, TEST_IMPACTS['Troponin (serial)'])
  assert.ok(v > 0, 'an informative test reduces entropy')
})

test('rankTestsByValue / bestNextTest surface the most informative unordered test', () => {
  const beliefs = normalizePriors(PRIORS)
  const ranked = rankTestsByValue(beliefs, TEST_IMPACTS, [])
  assert.equal(ranked.length, 2)
  assert.ok(ranked[0].value >= ranked[1].value)
  const best = bestNextTest(beliefs, TEST_IMPACTS, [])
  assert.ok(best !== null)
  // already-ordered tests are excluded
  const afterOrder = rankTestsByValue(beliefs, TEST_IMPACTS, ['Troponin (serial)'])
  assert.ok(!afterOrder.some(r => r.test === 'Troponin (serial)'))
})

test('formatEvidenceSummary ranks descending and notes confirm/exclude effects', () => {
  const summary = formatEvidenceSummary(PRIORS, TEST_IMPACTS, ['Troponin (serial)', 'CT aortogram'])
  const lines = summary.split('\n')
  assert.equal(lines[0].startsWith('1. NSTEMI'), true)
  assert.match(summary, /NSTEMI.*confirmed by Troponin \(serial\)/)
  assert.match(summary, /Aortic dissection.*excluded by CT aortogram/)
})

// helper: probability of a named differential in a belief array
function before(beliefs: { name: string; probability: number }[], name: string): number {
  return beliefs.find(b => b.name === name)!.probability
}

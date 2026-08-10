import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recommendNextCase, recommendedTier, urgencyOf } from '../nextCase'

test('urgencyOf boosts single-case systems', () => {
  assert.equal(urgencyOf({ name: 'Renal', score: 50, count: 3 }), 50)
  assert.equal(urgencyOf({ name: 'Renal', score: 50, count: 1 }), 60) // ×1.2
})

test('recommendedTier gates free accounts to Foundations at any score', () => {
  assert.equal(recommendedTier(95, false), 'Foundations')
  assert.equal(recommendedTier(45, true), 'Foundations')
  assert.equal(recommendedTier(70, true), 'Clinical')
  assert.equal(recommendedTier(85, true), 'Advanced')
})

test('recommendNextCase picks the most urgent system and honors skips', () => {
  const systems = [
    { name: 'Renal', score: 40, count: 3 },        // urgency 60 — weakest
    { name: 'Respiratory', score: 70, count: 2 },  // urgency 30
  ]
  const rec = recommendNextCase(systems, true)
  assert.equal(rec.system, 'Renal')
  assert.equal(rec.tier, 'Foundations') // score 40 < 60
  assert.equal(rec.fromData, true)

  // Skipping the weakest system promotes the next one.
  const skips = { Renal: { skippedAt: new Date().toISOString(), durationDays: 14 } }
  const rec2 = recommendNextCase(systems, true, skips)
  assert.equal(rec2.system, 'Respiratory')
  assert.equal(rec2.tier, 'Clinical') // score 70, pro

  // An expired skip no longer filters.
  const expired = { Renal: { skippedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), durationDays: 14 } }
  assert.equal(recommendNextCase(systems, true, expired).system, 'Renal')
})

test('recommendNextCase falls back to a starter default with no data', () => {
  const rec = recommendNextCase([], true)
  assert.equal(rec.system, 'Cardiovascular')
  assert.equal(rec.tier, 'Foundations')
  assert.equal(rec.fromData, false)
})

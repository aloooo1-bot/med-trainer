import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcEfficiency } from '../efficiency'

test('Foundations always returns score 0 with empty feedback', () => {
  assert.deepEqual(calcEfficiency('Foundations', 1200, false), { score: 0, feedback: '' })
  assert.deepEqual(calcEfficiency('Foundations', 0, true), { score: 0, feedback: '' })
})

test('timed out returns score 2 for Clinical', () => {
  const r = calcEfficiency('Clinical', 0, true)
  assert.equal(r.score, 2)
  assert.ok(r.feedback.length > 0)
})

test('timed out returns score 2 for Advanced', () => {
  const r = calcEfficiency('Advanced', 0, true)
  assert.equal(r.score, 2)
})

test('Clinical: > 540s remaining → score 10', () => {
  assert.equal(calcEfficiency('Clinical', 541, false).score, 10)
  assert.equal(calcEfficiency('Clinical', 600, false).score, 10)
})

test('Clinical: 300–540s remaining → score 8', () => {
  assert.equal(calcEfficiency('Clinical', 540, false).score, 8)
  assert.equal(calcEfficiency('Clinical', 300, false).score, 8)
})

test('Clinical: 120–299s remaining → score 6', () => {
  assert.equal(calcEfficiency('Clinical', 299, false).score, 6)
  assert.equal(calcEfficiency('Clinical', 120, false).score, 6)
})

test('Clinical: < 120s remaining → score 4', () => {
  assert.equal(calcEfficiency('Clinical', 119, false).score, 4)
  assert.equal(calcEfficiency('Clinical', 1, false).score, 4)
})

test('Advanced: > 360s remaining → score 10', () => {
  assert.equal(calcEfficiency('Advanced', 361, false).score, 10)
})

test('Advanced: 180–360s remaining → score 8', () => {
  assert.equal(calcEfficiency('Advanced', 360, false).score, 8)
  assert.equal(calcEfficiency('Advanced', 180, false).score, 8)
})

test('Advanced: 60–179s remaining → score 6', () => {
  assert.equal(calcEfficiency('Advanced', 179, false).score, 6)
  assert.equal(calcEfficiency('Advanced', 60, false).score, 6)
})

test('Advanced: < 60s remaining → score 4', () => {
  assert.equal(calcEfficiency('Advanced', 59, false).score, 4)
  assert.equal(calcEfficiency('Advanced', 0, false).score, 4)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchOrderSets, findUnknownOrderSetTests, COMMON_CORE_TESTS, ORDER_SETS } from '../orderSets'
import { MASTER_TEST_LIST } from '../testMasterList'

test('every order-set and common-core test name exists in MASTER_TEST_LIST', () => {
  const unknown = findUnknownOrderSetTests()
  assert.deepEqual(unknown, [], `unknown test names: ${unknown.join(' | ')}`)
})

test('common core is a reasonable size (not the full long tail)', () => {
  assert.ok(COMMON_CORE_TESTS.length >= 12 && COMMON_CORE_TESTS.length <= 20)
  assert.ok(COMMON_CORE_TESTS.length < MASTER_TEST_LIST.length / 5)
})

test('chest pain matches the chest-pain set first', () => {
  const sets = matchOrderSets('Crushing chest pain for 2 hours')
  assert.equal(sets[0]?.id, 'chest-pain')
})

test('chief-complaint hits outrank HPI-only hits', () => {
  // CC is fatigue; HPI mentions chest pain — fatigue set should rank first.
  const sets = matchOrderSets('Fatigue', 'Also reports mild chest pain on exertion')
  assert.equal(sets[0]?.id, 'fatigue')
  assert.ok(sets.some(s => s.id === 'chest-pain'))
})

test('unmatched complaint yields no sets (falls back to core + search)', () => {
  assert.deepEqual(matchOrderSets('Routine follow-up for medication refill'), [])
})

test('match is capped', () => {
  const sets = matchOrderSets('chest pain, shortness of breath, fever, cough, headache', '', 2)
  assert.ok(sets.length <= 2)
})

test('each set is a plausible workup (3-10 tests)', () => {
  for (const s of ORDER_SETS) {
    assert.ok(s.tests.length >= 3 && s.tests.length <= 10, `${s.id} has ${s.tests.length} tests`)
    assert.equal(new Set(s.tests).size, s.tests.length, `${s.id} has duplicate tests`)
  }
})

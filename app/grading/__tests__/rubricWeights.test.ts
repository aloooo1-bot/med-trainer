import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRubric, RUBRIC_TOTAL } from '../rubric'

for (const difficulty of ['Foundations', 'Clinical', 'Advanced']) {
  test(`${difficulty} rubric: weights sum to ${RUBRIC_TOTAL}`, () => {
    const r = getRubric(difficulty)
    const sum = r.reduce((a, d) => a + d.max, 0)
    assert.equal(sum, RUBRIC_TOTAL)
  })
}

test('Foundations rubric has no clinicalReasoning, exactly 4 categories', () => {
  const r = getRubric('Foundations')
  assert.ok(!r.find(d => d.key === 'clinicalReasoning'))
  assert.equal(r.length, 4)
})

test('Foundations rubric has correct weights: 24/24/36/16', () => {
  const r = getRubric('Foundations')
  assert.equal(r.find(d => d.key === 'historyInterview')!.max,      24)
  assert.equal(r.find(d => d.key === 'testOrdering')!.max,          24)
  assert.equal(r.find(d => d.key === 'diagnosisAccuracy')!.max,     36)
  assert.equal(r.find(d => d.key === 'diagnosisCompleteness')!.max, 16)
})

test('Clinical rubric has clinicalReasoning, exactly 5 categories', () => {
  const r = getRubric('Clinical')
  assert.ok(r.find(d => d.key === 'clinicalReasoning'))
  assert.ok(!r.find(d => d.key === 'examinationFocus'))
  assert.equal(r.length, 5)
})

test('Clinical rubric has correct weights: 20/20/30/15/15', () => {
  const r = getRubric('Clinical')
  assert.equal(r.find(d => d.key === 'historyInterview')!.max,      20)
  assert.equal(r.find(d => d.key === 'testOrdering')!.max,          20)
  assert.equal(r.find(d => d.key === 'diagnosisAccuracy')!.max,     30)
  assert.equal(r.find(d => d.key === 'diagnosisCompleteness')!.max, 15)
  assert.equal(r.find(d => d.key === 'clinicalReasoning')!.max,     15)
})

test('Advanced rubric is identical to Clinical', () => {
  const clinical  = getRubric('Clinical')
  const advanced  = getRubric('Advanced')
  assert.equal(clinical.length, advanced.length)
  for (let i = 0; i < clinical.length; i++) {
    assert.equal(clinical[i].key, advanced[i].key)
    assert.equal(clinical[i].max, advanced[i].max)
  }
})

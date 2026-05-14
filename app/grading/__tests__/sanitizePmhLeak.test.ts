import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizePmhLeak } from '../../lib/generators/shared'

function makeCase(diagnosis: string, conditions: string, surgeries = 'None.', hospitalizations = 'None.'): Record<string, unknown> {
  return {
    diagnosis,
    pastMedicalHistory: { conditions, surgeries, hospitalizations },
  }
}

function pmh(result: Record<string, unknown>) {
  return result.pastMedicalHistory as Record<string, string>
}

test('forces conditions to None. for negation-leak of diagnosis organ system', () => {
  const result = sanitizePmhLeak(
    makeCase('Graves Disease', 'No prior thyroid disease. Takes oral contraceptives for cycle regulation.')
  )
  assert.equal(pmh(result).conditions, 'None.')
})

test('forces surgeries to None. for negation-leak of diagnosis organ system', () => {
  const result = sanitizePmhLeak(
    makeCase('Acute MI', 'None.', 'Denies any cardiac surgeries', 'None.')
  )
  assert.equal(pmh(result).surgeries, 'None.')
})

test('forces hospitalizations to None. for negation-leak of diagnosis organ system', () => {
  const result = sanitizePmhLeak(
    makeCase('Acute Kidney Injury', 'None.', 'None.', 'No prior renal hospitalizations')
  )
  assert.equal(pmh(result).hospitalizations, 'None.')
})

test('does not alter real comorbidities unrelated to the diagnosis', () => {
  const result = sanitizePmhLeak(
    makeCase('Anterior STEMI', 'Hypertension, type 2 diabetes')
  )
  assert.equal(pmh(result).conditions, 'Hypertension, type 2 diabetes')
})

test('is idempotent when conditions is already None.', () => {
  const input = makeCase('Graves Disease', 'None.')
  const result = sanitizePmhLeak(input)
  assert.equal(result, input)
})

test('forces conditions to None. for medication-bleed with no real chronic diagnosis', () => {
  const result = sanitizePmhLeak(
    makeCase('Graves Disease', 'Oral contraceptive pills for cycle regulation.')
  )
  assert.equal(pmh(result).conditions, 'None.')
})

test('preserves comorbidity even when a medication is also mentioned alongside it', () => {
  const result = sanitizePmhLeak(
    makeCase('Anterior STEMI', 'Hypertension. Takes aspirin.')
  )
  assert.equal(pmh(result).conditions, 'Hypertension. Takes aspirin.')
})

test('handles "no history of thyroid disease" phrasing', () => {
  const result = sanitizePmhLeak(
    makeCase('Hashimoto Thyroiditis', 'No history of thyroid disease.')
  )
  assert.equal(pmh(result).conditions, 'None.')
})

test('handles "denies any renal hospitalizations" phrasing', () => {
  const result = sanitizePmhLeak(
    makeCase('Chronic Kidney Disease Stage 3', 'None.', 'None.', 'Denies any prior renal hospitalizations.')
  )
  assert.equal(pmh(result).hospitalizations, 'None.')
})

test('returns original object reference when nothing changed', () => {
  const input = makeCase('Pulmonary Embolism', 'Hypertension')
  const result = sanitizePmhLeak(input)
  assert.equal(result, input)
})

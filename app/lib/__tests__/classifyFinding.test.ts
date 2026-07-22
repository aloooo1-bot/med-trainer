import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyFinding } from '../rosDetector'

test('LLM-derived denial with comma list is negative (the acceptance #3 bug)', () => {
  assert.equal(classifyFinding('Patient denies joint pain, swelling, or stiffness.'), 'negative')
})

test('LLM-derived positive report is positive', () => {
  assert.equal(classifyFinding('Patient reports feeling warm and flushed with facial redness noted by family.'), 'positive')
})

test('"Patient reports no rash" is negative (subject + negation)', () => {
  assert.equal(classifyFinding('Patient reports no rash or lesions.'), 'negative')
})

test('mixed denial + affirmation ("denies X but reports Y") is positive', () => {
  assert.equal(classifyFinding('Denies fever but reports a productive cough.'), 'positive')
})

test('canonical positive-first format still positive', () => {
  assert.equal(classifyFinding('Fatigue present. Denies fever, chills, night sweats, weight loss.'), 'positive')
})

test('canonical all-denial format is negative', () => {
  assert.equal(classifyFinding('Denies chest pain, palpitations, or edema.'), 'negative')
})

test('the loading/placeholder fallback finding is negative', () => {
  assert.equal(classifyFinding('No findings documented for this system.'), 'negative')
})

test('empty is negative', () => {
  assert.equal(classifyFinding(''), 'negative')
})

test('single affirmed symptom is positive', () => {
  assert.equal(classifyFinding('Patient endorses shortness of breath on exertion.'), 'positive')
})

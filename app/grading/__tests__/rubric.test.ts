import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRubricPrompt, buildOralPrompt, GRADING_SYSTEM_PROMPT } from '../rubric'
import type { GradingInput } from '../types'

const baseInput: GradingInput = {
  patientInfo: '45yo male, CC: "chest pain"',
  hpi: 'Patient presents with crushing chest pain radiating to left arm for 2 hours.',
  backgroundHistory: 'Hypertension, Diabetes. Aspirin 81mg daily.',
  difficulty: 'Clinical',
  orderedLabResults: 'Troponin: 2.5 ng/mL (ref: 0-0.04) [critical]',
  orderedImagingResults: 'EKG: ST elevation in leads II, III, aVF',
  chatSummary: 'Physician: Any chest pain? Patient: Yes, crushing.',
  reasoningText: 'ST elevation + troponin rise consistent with inferior STEMI.',
  submittedDiagnosis: 'STEMI',
  correctDiagnosis: 'STEMI (inferior)',
  keyQuestions: ['Onset of chest pain', 'Radiation to arm or jaw'],
  teachingPoints: ['STEMI requires emergent PCI within 90 minutes'],
  differentials: ['NSTEMI', 'Aortic dissection', 'PE'],
  timedOut: false,
}

test('buildRubricPrompt includes patient info', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('45yo male'))
  assert.ok(prompt.includes('"chest pain"'))
})

test('buildRubricPrompt includes submitted and correct diagnosis', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('"STEMI"'))
  assert.ok(prompt.includes('"STEMI (inferior)"'))
})

test('buildRubricPrompt includes teaching points as JSON', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('STEMI requires emergent PCI'))
})

test('buildRubricPrompt includes reasoning text when provided', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('ST elevation + troponin rise'))
})

test('buildRubricPrompt shows placeholder when no reasoning', () => {
  const prompt = buildRubricPrompt({ ...baseInput, reasoningText: '' })
  assert.ok(prompt.includes('(No clinical reasoning text provided)'))
})

test('buildRubricPrompt includes timed-out note when timedOut=true', () => {
  const prompt = buildRubricPrompt({ ...baseInput, timedOut: true })
  assert.ok(prompt.includes('time expired'))
})

test('buildRubricPrompt does NOT include timed-out note when timedOut=false', () => {
  const prompt = buildRubricPrompt({ ...baseInput, timedOut: false })
  assert.ok(!prompt.includes('time expired'))
})

test('buildRubricPrompt includes Advanced test ordering note for Advanced difficulty', () => {
  const prompt = buildRubricPrompt({ ...baseInput, difficulty: 'Advanced' })
  assert.ok(prompt.includes('free-text search'))
})

test('buildRubricPrompt does NOT include Advanced note for Clinical difficulty', () => {
  const prompt = buildRubricPrompt({ ...baseInput, difficulty: 'Clinical' })
  assert.ok(!prompt.includes('free-text search'))
})

test('GRADING_SYSTEM_PROMPT is non-empty and mentions medical education', () => {
  assert.ok(GRADING_SYSTEM_PROMPT.length > 50)
  assert.ok(GRADING_SYSTEM_PROMPT.includes('medical education'))
})

test('buildOralPrompt includes patient info and presentation text', () => {
  const prompt = buildOralPrompt(
    '45yo male, CC: "chest pain"',
    'STEMI (inferior)',
    ['Onset of chest pain'],
    'This is a 45-year-old male presenting with crushing chest pain.'
  )
  assert.ok(prompt.includes('45yo male'))
  assert.ok(prompt.includes('STEMI (inferior)'))
  assert.ok(prompt.includes('crushing chest pain'))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GradingResultSchema } from '../schemas'
import { stripToBasic, type GradingResult } from '../types'
import { buildRubricPrompt, getRubric, RUBRIC_TOTAL } from '../rubric'
import type { GradingInput } from '../types'

/**
 * Patient communication is REPORTED, NEVER SCORED. A student who ignores every
 * worry the patient voices should see that named — and lose no points for it,
 * so that scores recorded before this existed remain comparable.
 */

const baseResult: GradingResult = {
  score: 89,
  correct: true,
  feedback: 'Strong performance.',
  strengths: ['Good ABG interpretation'],
  missedQuestions: [],
  teachingPoints: [],
  differentials: [],
  dimensions: {
    historyInterview:      { score: 15, feedback: '' },
    testOrdering:          { score: 15, feedback: '' },
    diagnosisAccuracy:     { score: 30, feedback: '' },
    diagnosisCompleteness: { score: 14, feedback: '' },
    clinicalReasoning:     { score: 15, feedback: '' },
  },
  communication: {
    summary: 'You acknowledged her fear about her heart but moved past the question about independence.',
    moments: [
      { concern: 'Is there something wrong with my heart?', acknowledged: true, note: 'You explained the echo findings in plain terms.' },
      { concern: 'Will I still be able to manage on my own?', acknowledged: false, note: 'A brief acknowledgement would have cost nothing.' },
    ],
  },
}

test('the scored dimensions still total 100 — adding communication moved no points', () => {
  const rubric = getRubric('Clinical')
  const total = rubric.reduce((sum, d) => sum + d.max, 0)
  assert.equal(total, RUBRIC_TOTAL)
  assert.equal(total, 100)
})

test('communication is not a dimension, so it cannot contribute to the score', () => {
  const dims = baseResult.dimensions!
  const sum = Object.values(dims).reduce((s, d) => s + (d?.score ?? 0), 0)
  assert.equal(sum, baseResult.score, 'the headline score is exactly the dimension sum')
  assert.equal('communication' in dims, false)
})

test('the schema accepts a full communication block', () => {
  const parsed = GradingResultSchema.parse(JSON.parse(JSON.stringify(baseResult)))
  assert.equal(parsed.communication?.moments.length, 2)
  assert.equal(parsed.communication?.moments[1].acknowledged, false)
})

test('a malformed communication block degrades instead of rejecting the grade', () => {
  // Rejecting would throw in gradeService and 500 a COMPLETED case, destroying
  // the student's work over an unscored extra.
  const partial = GradingResultSchema.parse({
    ...JSON.parse(JSON.stringify(baseResult)),
    communication: { moments: [{ concern: 'Am I going to be alright?' }] },
  })
  assert.equal(partial.communication?.summary, '')
  assert.equal(partial.communication?.moments[0].acknowledged, false)
  assert.equal(partial.communication?.moments[0].note, '')
})

test('an omitted communication block is valid — not every encounter has one', () => {
  const noComm = JSON.parse(JSON.stringify(baseResult))
  delete noComm.communication
  const parsed = GradingResultSchema.parse(noComm)
  assert.equal(parsed.communication, undefined)
  assert.equal(parsed.score, 89)
})

test('stripToBasic withholds communication from the free tier, like other feedback', () => {
  const basic = stripToBasic(baseResult)
  assert.equal(basic.communication, undefined)
  assert.equal(basic.score, 89, 'the score itself is still shown')
})

const baseInput: GradingInput = {
  patientInfo: '67yo female, CC: "shortness of breath"',
  hpi: 'Progressive dyspnea and back deformity.',
  backgroundHistory: 'Childhood tuberculosis.',
  difficulty: 'Clinical',
  orderedLabResults: '',
  orderedImagingResults: '',
  chatSummary: 'Patient: Is there something wrong with my heart?',
  reasoningText: '',
  submittedDiagnosis: 'Cor pulmonale',
  correctDiagnosis: 'Severe thoracic kyphoscoliosis',
  keyQuestions: [],
  teachingPoints: [],
  differentials: [],
  timedOut: false,
}

test('the prompt asks for communication and forbids it affecting the score', () => {
  const prompt = buildRubricPrompt(baseInput)
  assert.ok(prompt.includes('PATIENT COMMUNICATION (REPORTED, NOT SCORED)'))
  assert.ok(prompt.includes('contributes ZERO points'))
  assert.ok(prompt.includes('NOT let it raise or lower any dimension score'))
  // And it must not invent a concern to have something to say.
  assert.ok(prompt.includes('do not manufacture a concern'))
})

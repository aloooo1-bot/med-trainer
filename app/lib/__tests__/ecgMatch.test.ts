import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreEcgMatch } from '../ecgImageLookup'

test('scoreEcgMatch rewards shared lead territory and ECG vocabulary', () => {
  const findings = 'ST elevation in leads II, III, and aVF with reciprocal depression in I and aVL — inferior infarct'
  const inferior = 'inferior myocardial infarction, ST elevation II III aVF'
  const anterior = 'anterior myocardial infarction, ST elevation V1 V2 V3 V4'
  assert.ok(scoreEcgMatch(inferior, findings) > scoreEcgMatch(anterior, findings),
    'an inferior-territory report should outscore an anterior one for inferior findings')
})

test('scoreEcgMatch is 0 when either side is empty', () => {
  assert.equal(scoreEcgMatch('', 'ST elevation II III aVF'), 0)
  assert.equal(scoreEcgMatch('normal sinus rhythm', ''), 0)
})

test('scoreEcgMatch picks up rhythm vocabulary', () => {
  const findings = 'irregularly irregular rhythm, atrial fibrillation with rapid ventricular response'
  const afib = 'atrial fibrillation'
  const normal = 'normal sinus rhythm, no acute changes'
  assert.ok(scoreEcgMatch(afib, findings) > scoreEcgMatch(normal, findings))
})

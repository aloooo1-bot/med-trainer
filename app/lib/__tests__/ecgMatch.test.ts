import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreEcgMatch, contradictsFindings, getECGCategory, isInterpretableReport } from '../ecgImageLookup'

test('scoreEcgMatch rewards shared lead territory and ECG vocabulary', () => {
  const findings = 'ST elevation in leads II, III, and aVF with reciprocal depression in I and aVL — inferior infarct'
  const inferior = 'inferior myocardial infarction, ST elevation II III aVF'
  const anterior = 'anterior myocardial infarction, ST elevation V1 V2 V3 V4'
  assert.ok(scoreEcgMatch(inferior, findings) > scoreEcgMatch(anterior, findings),
    'an inferior-territory report should outscore an anterior one for inferior findings')
})

test('scoreEcgMatch ignores terms embedded inside unrelated words', () => {
  // "requested" contains "st"; the corpus placeholder must not look like a match.
  assert.equal(scoreEcgMatch('trace only requested.', 'Sinus tachycardia at 104 bpm. No ST changes.'), 0)
})

test('isInterpretableReport rejects corpus stubs and keeps real reports', () => {
  assert.equal(isInterpretableReport('trace only requested.'), false)
  assert.equal(isInterpretableReport('   '), false)
  assert.equal(isInterpretableReport('atrial fibrillation'), true)
  assert.equal(isInterpretableReport('sinusrhythmus normales ekg'), true, 'German reports are usable')
  assert.equal(isInterpretableReport('inferior myocardial infarction, ST elevation II III aVF'), true)
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

// ── contradiction guard ──────────────────────────────────────────────────────
// The regression that motivated this: a cor pulmonale case was shown an SVT
// tracing because both mentioned "tachycardia", even though the case's
// P pulmonale is a P wave and the tracing explicitly had none.

const KYPHO = 'Sinus tachycardia at 96 bpm. Right axis deviation, tall R in V1, P pulmonale.'
const SVT = 'rapid regular supraventricular tachycardia without evident p waves. non-specific st-t wave changes.'

test('contradictsFindings rejects an SVT tracing for a sinus-rhythm case', () => {
  assert.ok(scoreEcgMatch(SVT, KYPHO) > 0, 'precondition: the old scorer called this a match')
  assert.ok(contradictsFindings(SVT, KYPHO), 'P pulmonale cannot appear on a tracing with no P waves')
})

test('contradictsFindings catches a rate band that disagrees with the stated rate', () => {
  assert.ok(contradictsFindings('sinus bradycardia at 48 bpm', 'Sinus rhythm at 78 bpm, normal axis.'))
  assert.ok(contradictsFindings('sinus tachycardia, rate 120', 'Sinus rhythm at 96 bpm.'))
  assert.equal(contradictsFindings('sinus tachycardia, rate 120', 'Sinus tachycardia at 118 bpm.'), null)
})

test('contradictsFindings rejects an SVT tracing that never mentions P waves', () => {
  // The P-wave axis cannot see this one — the report only names the rhythm.
  const svtNoPMention = 'a rapid, regular supraventricular tachycardia is present. non-specific st-t wave changes.'
  assert.ok(contradictsFindings(svtNoPMention, 'Sinus tachycardia at 104 bpm. No ST changes.'))
})

test('contradictsFindings rejects a German non-sinus tracing for a sinus case', () => {
  assert.ok(contradictsFindings('av-tachykardie (dd:supraventr. tachykardie) linkstyp', 'Sinus tachycardia at 112 bpm.'))
})

test('contradictsFindings keeps a sinus tracing that also reports ectopy', () => {
  const sinusWithPacs = 'frequent premature atrial contraction(s). sinus tachycardia. otherwise no definite pathology.'
  assert.equal(contradictsFindings(sinusWithPacs, 'Sinus tachycardia at 112 bpm. Normal axis.'), null)
})

test('contradictsFindings honours features the case explicitly denies', () => {
  const hypothyroid = 'Sinus bradycardia at 54 bpm with low-amplitude QRS and flattened T-waves. No ST changes or conduction abnormalities.'
  const germanBlock = 'steiltyp wandernder schrittmacher av- block 1. grades intraventr. leitungsstoerung avl st- hebung v2'
  assert.ok(contradictsFindings(germanBlock, hypothyroid),
    'a strip with ST elevation and AV block cannot illustrate a case that denies both')
})

test('contradictsFindings does not fire when the case asserts the same feature', () => {
  const stemi = 'ST elevation in leads II, III and aVF with reciprocal depression.'
  assert.equal(contradictsFindings('inferior myocardial infarction, st elevation ii iii avf', stemi), null)
})

test('contradictsFindings allows a faithful tracing', () => {
  const findings = 'Atrial fibrillation, irregularly irregular, no discernible P waves.'
  assert.equal(contradictsFindings('atrial fibrillation', findings), null)
})

test('contradictsFindings is null when either side is empty', () => {
  assert.equal(contradictsFindings('', KYPHO), null)
  assert.equal(contradictsFindings(SVT, ''), null)
})

// ── category resolution ──────────────────────────────────────────────────────

test('a sinus case may reach the tachycardia pool, but every SVT tracing in it is rejected', () => {
  // The pool is shared because it also holds a faithful sinus-tach tracing;
  // correctness is enforced per-candidate rather than by excluding the pool.
  assert.equal(getECGCategory('Severe thoracic kyphoscoliosis', KYPHO), 'tachycardia')
  const svtReports = [
    'rapid regular supraventricular tachycardia without evident p waves. non-specific st-t wave changes.',
    'a rapid, regular supraventricular tachycardia is present. non-specific st-t wave changes.',
    'rapid, regular supraventricular tachycardia. no p wave found. widespread non-specific st-t wave changes.',
  ]
  for (const r of svtReports) {
    assert.ok(contradictsFindings(r, KYPHO), `should reject: ${r.slice(0, 40)}`)
  }
})

test('getECGCategory returns null rather than serving a normal tracing for an unrepresentable ECG', () => {
  // Isolated right-axis/RVH findings: the library has no such category, and the
  // old catch-all handed back a NORMAL tracing for an abnormal ECG.
  assert.equal(getECGCategory('Cor pulmonale', 'Right axis deviation with tall R in V1 and RV strain pattern.'), null)
})

test('getECGCategory still resolves the rhythms the library does cover', () => {
  assert.equal(getECGCategory('Atrial fibrillation with RVR', 'irregularly irregular, no p waves'), 'afib')
  assert.equal(getECGCategory('STEMI', 'ST elevation in II, III, aVF'), 'stemi')
  assert.equal(getECGCategory('Paroxysmal SVT', 'narrow complex tachycardia at 180'), 'tachycardia')
})

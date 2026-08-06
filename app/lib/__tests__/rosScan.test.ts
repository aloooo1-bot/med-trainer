import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanMessageForROSDetailed } from '../rosDetector'

/**
 * Reported from a played Addison's case. The student asked about skin darkening
 * AND salt craving in one message; the patient answered both, describing
 * "adding extra salt to pretty much everything". Only Integumentary was
 * recorded. The case's stored Endocrine finding is "Salt craving present." —
 * the cardinal feature of the diagnosis — and nothing captured it, so the
 * single best question in the case earned no credit.
 *
 * Cause: 'skin' is a decisive keyword, and a decisive hit short-circuited the
 * AI classifier for the WHOLE message, so the second half was never classified.
 */

const REPORTED = 'Have you noticed any darkening of your skin, and have you been craving salty foods at all?'

test('the reported question now reaches Endocrine', () => {
  const scan = scanMessageForROSDetailed(REPORTED)
  assert.ok(scan.categories.includes('Integumentary'), 'the skin half still works')
  assert.ok(scan.categories.includes('Endocrine'), 'the salt-craving half — this is the bug')
})

test('a second topic the keywords cannot see defers to the classifier', () => {
  // The same question phrased without any word the map knows. The keyword
  // additions above cannot save this one; only the deferral can.
  const scan = scanMessageForROSDetailed(
    'Have you noticed any darkening of your skin, and have you been adding extra salt to your food?',
  )
  assert.deepEqual(scan.categories, ['Integumentary'], 'keywords see only the skin')
  assert.ok(scan.uncovered.length > 0, 'but the second clause is unaccounted for')
  assert.equal(scan.needsClassifier, true)
})

test('a decisive single-topic question still skips the model call', () => {
  // The short-circuit is the whole point of the keyword scan. Losing it for the
  // common case would put a model call in front of every question asked.
  for (const q of [
    'Any chest pain?',
    'Have you had a cough?',
    'Any nausea or vomiting?',
    'Have you noticed a rash on your skin?',
  ]) {
    const scan = scanMessageForROSDetailed(q)
    assert.ok(scan.categories.length > 0, q)
    assert.equal(scan.needsClassifier, false, q)
    assert.deepEqual(scan.uncovered, [], q)
  }
})

test('a trailing fragment does not count as a second topic', () => {
  // "and does it radiate" leans on the clause before it — it has one content
  // word. Treating it as an unseen topic would defer on most questions asked.
  for (const q of [
    'Any chest pain, and does it radiate?',
    'Have you had a cough, and is it getting worse?',
    'Any nausea? How long has that been going on?',
  ]) {
    assert.equal(scanMessageForROSDetailed(q).needsClassifier, false, q)
  }
})

test('scaffolding-only clauses are not substantive', () => {
  for (const q of [
    'Any chest pain at all?',
    'Have you had a cough, anything else you have noticed?',
    'Can you tell me about the chest pain?',
  ]) {
    assert.deepEqual(scanMessageForROSDetailed(q).uncovered, [], q)
  }
})

test('an unseen topic asked alone still defers', () => {
  // No keyword anywhere. Previously this returned needsClassifier: false with
  // zero categories; rosService fell through to its looksClinical gate, which
  // is why the behaviour was already correct here — the flag now says so.
  const scan = scanMessageForROSDetailed('How have your energy levels been over the past few months?')
  assert.deepEqual(scan.categories, [])
  assert.equal(scan.needsClassifier, true)
})

test('the ambiguous-only rule is unchanged', () => {
  // A single ambiguous word decides nothing on its own and must be arbitrated.
  const scan = scanMessageForROSDetailed('How have you been sleeping?')
  assert.deepEqual(scan.categories, ['Psychiatric'])
  assert.deepEqual(scan.ambiguous, ['Psychiatric'])
  assert.equal(scan.needsClassifier, true)
})

test('salt craving is reachable however it is phrased', () => {
  for (const q of [
    'Have you had any salt craving recently?',
    'Have you been craving salt more than usual?',
    'Do you find yourself wanting salty snacks?',
  ]) {
    assert.ok(scanMessageForROSDetailed(q).categories.includes('Endocrine'), q)
  }
})

test('an empty message scans to nothing', () => {
  const scan = scanMessageForROSDetailed('')
  assert.deepEqual(scan.categories, [])
  assert.deepEqual(scan.uncovered, [])
  assert.equal(scan.needsClassifier, false)
})

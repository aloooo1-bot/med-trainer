import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanMessageForHPIFields, disclosedMedicationFields, medicationTerms } from '../rosDetector'

/**
 * Reported from a played stroke case. The student asked about blood thinners
 * and named aspirin; the patient answered truthfully that he takes a daily baby
 * aspirin on his own initiative. The medication panel then showed only
 * "Amlodipine 10mg oral daily" with OTC/SUPPLEMENTS blank — the chart
 * contradicting what the patient had just said, and the unlock record is what
 * grading treats as authoritative for whether the student elicited it.
 */

const ASKED = 'Are you on any blood thinners — like warfarin, Eliquis, or aspirin? And have you had any recent surgery, head injury, or bleeding problems?'

test('the reported question now unlocks the OTC medications too', () => {
  const fields = scanMessageForHPIFields(ASKED)
  assert.ok(fields.includes('med_medications'), 'prescription list')
  assert.ok(fields.includes('med_otc'), 'the aspirin lives here — this is the bug')
  assert.ok(fields.includes('pmh_surgeries'), 'the surgery half of the question still works')
})

test('naming a common OTC drug reaches the OTC field', () => {
  for (const q of [
    'Do you take any ibuprofen or other painkillers for that?',
    'Are you taking Tylenol or acetaminophen at home?',
    'Do you use any NSAIDs regularly for your knees?',
    'Do you take a daily multivitamin or any supplements?',
  ]) {
    assert.ok(scanMessageForHPIFields(q).includes('med_otc'), q)
  }
})

test('anticoagulants by name reach the prescription field', () => {
  for (const q of [
    'Have you ever been on warfarin or Coumadin for anything?',
    'Are you taking apixaban, rivaroxaban, or any anticoagulant?',
    'Has anyone put you on clopidogrel or Plavix before?',
  ]) {
    assert.ok(scanMessageForHPIFields(q).includes('med_medications'), q)
  }
})

test('a generic medication question still does not hand over the OTC list', () => {
  // Patients under-report over-the-counter drugs; probing for them separately
  // is the skill, so a bare "any medications?" must not reveal both.
  const fields = scanMessageForHPIFields('Do you take any medications that were prescribed for you?')
  assert.ok(fields.includes('med_medications'))
  assert.equal(fields.includes('med_otc'), false)
})

test('unrelated questions unlock no medication field', () => {
  const fields = scanMessageForHPIFields('When did the weakness in your arm first start this morning?')
  assert.equal(fields.includes('med_medications'), false)
  assert.equal(fields.includes('med_otc'), false)
})

// ── what the patient actually said ───────────────────────────────────────────

const STROKE_MEDS = {
  medications: 'Amlodipine 10mg oral daily',
  otc: 'Aspirin 81mg oral daily (self-initiated). Multivitamin once daily.',
}
const REPLY = "No warfarin or those other ones you mentioned. But I... I take a baby aspirin every day — been doing that for a few years on my own. My doctor never really said I needed it."

test('a drug the patient names out loud counts as elicited', () => {
  // Even if the question had missed the field entirely, the chart cannot show a
  // medication list that omits what the patient just described.
  assert.deepEqual(disclosedMedicationFields(REPLY, STROKE_MEDS), ['med_otc'])
})

test('a reply that names nothing unlocks nothing', () => {
  assert.deepEqual(
    disclosedMedicationFields('No, I am not on anything like that at all.', STROKE_MEDS),
    [],
  )
})

test('both fields unlock when the patient lists both', () => {
  const both = 'I take amlodipine for my pressure, and a baby aspirin on my own.'
  assert.deepEqual(disclosedMedicationFields(both, STROKE_MEDS).sort(), ['med_medications', 'med_otc'])
})

test('medicationTerms keeps drug names and drops the scaffolding', () => {
  const terms = medicationTerms(STROKE_MEDS.otc)
  assert.ok(terms.includes('aspirin'))
  assert.ok(terms.includes('multivitamin'))
  // Dosing and frequency words are shared by every medication string and would
  // unlock a field the patient never mentioned.
  for (const noise of ['daily', 'once', 'oral', 'initiated']) {
    assert.equal(terms.includes(noise), false, noise)
  }
})

test('disclosure matching tolerates missing inputs', () => {
  assert.deepEqual(disclosedMedicationFields(undefined, STROKE_MEDS), [])
  assert.deepEqual(disclosedMedicationFields(REPLY, undefined), [])
  assert.deepEqual(disclosedMedicationFields(REPLY, {}), [])
})

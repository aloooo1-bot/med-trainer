import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanMessageForHPIFields, disclosedHpiFields, fieldTerms } from '../rosDetector'

/** Field names only, for assertions that do not care what text was revealed. */
const fieldsOf = (reply: string | undefined, values: Parameters<typeof disclosedHpiFields>[1]) =>
  disclosedHpiFields(reply, values).map(d => d.field)

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

// Values shaped like the real library: some compound, some content-free.
const VALUES = {
  pmh_conditions: 'Hypertension (diagnosed approximately 12 years ago). Hyperlipidemia.',
  pmh_surgeries: 'Appendectomy at age 34. No other surgeries.',
  pmh_hospitalizations: 'None',
  med_medications: 'Amlodipine 10mg oral daily',
  med_otc: 'Aspirin 81mg oral daily (self-initiated). Multivitamin once daily.',
  soc_smoking: 'Never smoker',
  soc_alcohol: 'Denies alcohol use.',
  soc_occupation: 'Retired civil engineer',
  soc_living: 'Lives alone in an apartment',
}
const REPLY = "No warfarin or those other ones you mentioned. But I... I take a baby aspirin every day — been doing that for a few years on my own. My doctor never really said I needed it."

test('a drug the patient names out loud counts as elicited', () => {
  // Even though the question never used the words "over the counter", the chart
  // cannot show a medication list that omits what the patient just described.
  assert.ok(fieldsOf(REPLY, VALUES).includes('med_otc'))
})

test('the same rule now covers the other background fields', () => {
  assert.ok(fieldsOf('I worked as a civil engineer until I retired.', VALUES).includes('soc_occupation'))
  assert.ok(fieldsOf('I live alone in a small apartment downtown.', VALUES).includes('soc_living'))
  assert.ok(fieldsOf('They told me I had hypertension years back.', VALUES).includes('pmh_conditions'))
  assert.ok(fieldsOf('I had an appendectomy when I was younger.', VALUES).includes('pmh_surgeries'))
})

test('a content-free value still unlocks from an unambiguous topic word', () => {
  // "None" shares no term with any honest answer, so the topic signal is the
  // only one available.
  assert.ok(fieldsOf('No, I have never been hospitalized for anything.', VALUES).includes('pmh_hospitalizations'))
  assert.ok(fieldsOf('I do not drink alcohol at all.', VALUES).includes('soc_alcohol'))
  assert.ok(fieldsOf('I have never smoked cigarettes in my life.', VALUES).includes('soc_smoking'))
})

test('generic words do NOT hand over a field the patient never discussed', () => {
  // The over-unlock this rule is designed to avoid: mentioning "home" is not a
  // living situation, and being "at work" is not an occupational history.
  const atHome = fieldsOf('I was at home having breakfast when it happened.', VALUES)
  assert.equal(atHome.includes('soc_living'), false)
  const atWork = fieldsOf('The pain started while I was at work that morning.', VALUES)
  assert.equal(atWork.includes('soc_occupation'), false)
})

test('"never" alone does not disclose a smoking history', () => {
  // 'never' appears in "Never smoker" but also in half of all denials.
  const fields = fieldsOf('No, I never had any problems like that before.', VALUES)
  assert.equal(fields.includes('soc_smoking'), false)
})

// ── partial disclosure reveals only what was said ────────────────────────────

test('naming one problem does not disclose the rest of the problem list', () => {
  // Observed live: the patient said "warfarin, for my atrial fibrillation" and
  // the panel handed over the diabetes, hypertension and hyperlipidemia listed
  // beside it. Each field is one line, so revealing it whole on one shared word
  // gives away everything recorded next to the thing actually said.
  const said = 'Yes, I take warfarin. I am on it for my heart rhythm problem — atrial fibrillation.'
  const d = disclosedHpiFields(said, SUBDURAL).find(x => x.field === 'pmh_conditions')
  assert.ok(d, 'the disclosed problem is still credited')
  assert.match(d!.text!, /atrial fibrillation/i)
  for (const hidden of ['Diabetes', 'Hypertension', 'Hyperlipidemia']) {
    assert.equal(d!.text!.includes(hidden), false, `${hidden} was never mentioned`)
  }
})

test('naming a disease does not disclose an admission for it', () => {
  // The admission clause is mostly words the patient never said, so the shared
  // disease name is not enough to give away that they were hospitalised.
  const said = 'I have atrial fibrillation, that is why I am on the warfarin.'
  const fields = fieldsOf(said, {
    pmh_hospitalizations: 'Hospitalized once for paroxysmal atrial fibrillation with rapid ventricular response (2019)',
  })
  assert.equal(fields.includes('pmh_hospitalizations'), false)
})

test('a fully disclosed field is revealed whole, with no redaction', () => {
  const d = disclosedHpiFields('I take amlodipine every day.', VALUES).find(x => x.field === 'med_medications')
  assert.ok(d)
  assert.equal(d!.text, undefined, 'nothing withheld means nothing to trim')
})

// Both of these were observed live before the stopword list was widened.
const FALL_REPLY = "Well, about six weeks ago I tripped on a rug at home and hit my head on the kitchen counter. It was on the right side. I got a bit of a spinning sensation for a few minutes. I have had a couple of other falls over the past year or so, but those didn't involve my head."
const SUBDURAL = {
  pmh_conditions: 'Atrial fibrillation (on anticoagulation), Type 2 Diabetes Mellitus, Hypertension, Hyperlipidemia. Falls: two in the past year.',
  pmh_surgeries: 'Right knee arthroscopy (2009), Appendectomy (1978)',
}

test('describing which side you hit does not disclose a surgical history', () => {
  // "It was on the right side" matched "Right knee arthroscopy" and handed over
  // the whole surgical history of a patient who had only described a fall.
  assert.equal(fieldsOf(FALL_REPLY, SUBDURAL).includes('pmh_surgeries'), false)
})

test('describing a fall does not disclose the whole problem list', () => {
  // The worst version of this: 'falls' matched a problem list whose first entry
  // was atrial fibrillation, giving away the answer to a subdural case from a
  // question about tripping on a rug.
  assert.equal(fieldsOf(FALL_REPLY, SUBDURAL).includes('pmh_conditions'), false)
})

test('a reply that discloses nothing unlocks nothing', () => {
  assert.deepEqual(fieldsOf('I am not sure what you mean by that.', VALUES), [])
})

test('fieldTerms keeps identifying words and drops the scaffolding', () => {
  const terms = fieldTerms(VALUES.med_otc)
  assert.ok(terms.includes('aspirin'))
  assert.ok(terms.includes('multivitamin'))
  for (const noise of ['daily', 'once', 'oral', 'initiated']) {
    assert.equal(terms.includes(noise), false, noise)
  }
  // The words shared by every history string carry no signal.
  assert.deepEqual(fieldTerms('None'), [])
  assert.equal(fieldTerms('Denies alcohol use.').includes('denies'), false)
})

test('disclosure matching tolerates missing inputs', () => {
  assert.deepEqual(fieldsOf(undefined, VALUES), [])
  assert.deepEqual(fieldsOf('   ', VALUES), [])
  assert.deepEqual(fieldsOf('I am not sure what you mean.', {}), [])
})

test('a case with no stored value still records the topic as addressed', () => {
  // The term signal cannot fire without a value, but the patient did talk about
  // their medications — the field is marked reviewed and renders as documented
  // absence rather than staying blank as though it had never come up.
  assert.deepEqual(fieldsOf(REPLY, {}).sort(), ['med_medications', 'med_otc'])
})

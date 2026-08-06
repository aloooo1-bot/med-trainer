import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkCaseConsistency, consistencyErrors, bmiIsValid, type CheckableCase } from '../caseConsistency'
import { stripStageDirections, isOnlyStageDirections } from '../transcriptText'
import { scanMessageForROSDetailed } from '../rosDetector'

const codes = (c: Parameters<typeof checkCaseConsistency>[0]) =>
  checkCaseConsistency(c).map(i => i.code)

// ── vitals ↔ prose ───────────────────────────────────────────────────────────
// The defect that started this: "Tachycardic, regular rhythm" at HR 96.

test('flags an exam that asserts tachycardia at a non-tachycardic rate', () => {
  const issues = consistencyErrors({
    vitals: { hr: 96 },
    physicalExam: { Cardiovascular: 'Tachycardic, regular rhythm. Loud P2. No murmurs.' },
  })
  assert.equal(issues.length, 1)
  assert.equal(issues[0].code, 'vitals/tachycardia-claim')
  assert.match(issues[0].message, /96/)
})

test('accepts the same wording once the rate supports it', () => {
  assert.deepEqual(codes({
    vitals: { hr: 112 },
    physicalExam: { Cardiovascular: 'Tachycardic, regular rhythm.' },
  }), [])
})

test('does not read "afebrile" as a fever claim', () => {
  assert.deepEqual(codes({ vitals: { temp: 98.4 }, physicalExam: { General: 'Afebrile, well appearing.' } }), [])
})

test('catches an afebrile claim contradicted by the temperature', () => {
  assert.deepEqual(codes({ vitals: { temp: 101.6 }, physicalExam: { General: 'Afebrile.' } }),
    ['vitals/afebrile-claim'])
})

// ── pronouns ─────────────────────────────────────────────────────────────────

test('flags a masculine pronoun for a female patient', () => {
  const issues = consistencyErrors({
    patientInfo: { gender: 'Female' },
    reviewOfSystems: { Constitutional: 'Reports fatigue. Some days he can barely keep his eyes open.' },
  })
  assert.equal(issues.length, 1)
  assert.equal(issues[0].code, 'prose/pronoun-mismatch')
})

test('does not flag a collateral historian using their own pronouns', () => {
  // "His wife reports he became confused" — both pronouns are correct here.
  assert.deepEqual(codes({
    patientInfo: { gender: 'Male' },
    hpi: 'His wife reports her husband became increasingly confused overnight.',
  }), [])
})

// ── medications ──────────────────────────────────────────────────────────────

test('flags an OTC analgesic filed under prescription medications', () => {
  assert.deepEqual(codes({ currentMedications: { medications: 'Acetaminophen 500 mg PO PRN back pain' } }),
    ['meds/otc-listed-as-prescription'])
})

test('leaves genuine prescriptions alone', () => {
  assert.deepEqual(codes({ currentMedications: { medications: 'Carvedilol 6.25 mg BID; lisinopril 10 mg daily' } }), [])
})

test('does not flag physician-directed low-dose aspirin', () => {
  // Bought over the counter, but taken on a cardiologist's instruction.
  assert.deepEqual(codes({ currentMedications: { medications: 'Aspirin 81 mg daily; atorvastatin 40 mg nightly' } }), [])
})

test('does not flag normal saturation in cellular hypoxia', () => {
  // Cyanide poisoning presents with tissue hypoxia and a NORMAL SpO2 — the
  // dissociation is the teaching point, not a defect.
  assert.deepEqual(codes({
    diagnosis: 'Cyanide Poisoning',
    vitals: { spo2: 97 },
    physicalExam: { General: 'Profoundly hypoxic at the tissue level despite normal pulse oximetry.' },
  }), [])
})

// ── radiology setting ────────────────────────────────────────────────────────

test('flags inpatient hardware in the film of an ambulatory case', () => {
  assert.deepEqual(codes({
    hpi: '67-year-old woman presents to clinic with 3 months of progressive dyspnea.',
    imagingResults: { 'Chest X-Ray': 'Severe thoracic kyphosis. Multiple external monitoring leads and support equipment are projected over the field.' },
  }), ['imaging/setting-mismatch'])
})

test('allows the same hardware when the vignette is an inpatient', () => {
  assert.deepEqual(codes({
    hpi: 'Intubated in the ICU following resuscitation.',
    imagingResults: { 'Chest X-Ray': 'Endotracheal tube in good position. Multiple monitoring leads overlie the field.' },
  }), [])
})

// ── required exam elements ───────────────────────────────────────────────────

test('flags a right-heart-failure case whose neck exam omits the JVP', () => {
  assert.deepEqual(codes({
    diagnosis: 'Severe thoracic kyphoscoliosis with cor pulmonale',
    physicalExam: { Neck: 'Trachea midline at sternal notch. No lymphadenopathy.' },
  }).filter(c => c === 'exam/missing-jvp'), ['exam/missing-jvp'])
})

test('satisfied once the JVP is documented', () => {
  assert.equal(codes({
    diagnosis: 'Cor pulmonale',
    physicalExam: { Neck: 'JVP elevated to 12 cm with prominent v waves. Trachea midline.' },
  }).includes('exam/missing-jvp'), false)
})

// ── BMI validity ─────────────────────────────────────────────────────────────

test('BMI is not interpretable when height is distorted', () => {
  assert.equal(bmiIsValid({ diagnosis: 'Severe thoracic kyphoscoliosis' }), false)
  assert.equal(bmiIsValid({ diagnosis: 'Community-Acquired Pneumonia' }), true)
  // Kyphoscoliosis also trips the JVP rule (it causes cor pulmonale), so assert
  // membership rather than an exact set.
  assert.ok(codes({
    diagnosis: 'Severe thoracic kyphoscoliosis',
    patientInfo: { height: `4'9"` },
  }).includes('vitals/bmi-invalid-for-habitus'))
})

// ── stage directions ─────────────────────────────────────────────────────────

test('stripStageDirections removes roleplay gestures and tidies the seam', () => {
  assert.equal(
    stripStageDirections('*shakes head* No, I never smoked. *pauses* Not in Nigeria, not here.'),
    'No, I never smoked. Not in Nigeria, not here.',
  )
  // The gesture that became a documented physical finding.
  assert.equal(stripStageDirections('It hurts *touches chest* right here.'), 'It hurts right here.')
})

test('stripStageDirections leaves ordinary prose untouched', () => {
  const plain = 'I get short of breath walking up the stairs.'
  assert.equal(stripStageDirections(plain), plain)
})

test('a reply that is only a gesture carries no clinical content', () => {
  assert.equal(isOnlyStageDirections('*nods*'), true)
  assert.equal(isOnlyStageDirections('*nods* Yes.'), false)
})

// ── ROS routing ──────────────────────────────────────────────────────────────

test('an ambiguous-only keyword hit defers to the classifier', () => {
  // "sleep" alone used to route straight to Psychiatric and stop there.
  const scan = scanMessageForROSDetailed('Do you feel sleepy during the day, and do you get headaches in the morning?')
  assert.equal(scan.needsClassifier, true, 'sleep/headache are too ambiguous to decide routing alone')
})

test('a decisive keyword still skips the classifier', () => {
  const scan = scanMessageForROSDetailed('Any nausea, vomiting, or change in bowel habits?')
  assert.equal(scan.needsClassifier, false)
  assert.ok(scan.categories.includes('Gastrointestinal'))
})

// ── authoring notes in student-facing prose ──────────────────────────────────

/** The four real instances the library sweep found, verbatim. */
const REAL_NOTES: Array<[string, Partial<CheckableCase>]> = [
  ['pastMedicalHistory.conditions', {
    pastMedicalHistory: { conditions: 'Vitiligo (diagnosed age 30, not volunteered initially). Chronic low back pain.' },
  }],
  ['socialHistory.drugs', {
    socialHistory: { drugs: 'Denies recreational drug use. History of appetite suppressant use (fenfluramine-based, obtained abroad) — not volunteered spontaneously.' },
  }],
  ['currentMedications.otc', {
    currentMedications: { otc: 'Aspirin 81 mg daily (self-discontinued 2 months ago due to GI upset — not disclosed initially).' },
  }],
  ['hpi', {
    hpi: 'He notes dysuria that began approximately 1 week ago, which he had not volunteered initially.',
  }],
]

test('a stage direction printed in the chart is an error', () => {
  for (const [field, c] of REAL_NOTES) {
    const issues = checkCaseConsistency(c as CheckableCase)
      .filter(i => i.code === 'content/authoring-note')
    assert.equal(issues.length, 1, field)
    assert.equal(issues[0].field, field)
    assert.equal(issues[0].severity, 'error')
  }
})

test('imperative stage directions are caught too', () => {
  // Not seen in the library yet, but the phrasing a generation is likely to
  // produce once it stops using the past tense.
  for (const text of [
    'Chest pain. Do not volunteer the cocaine use.',
    'Prior IV drug use — reveal only if asked directly.',
    'Recent travel to Brazil, disclose unless asked about the rash first.',
  ]) {
    const issues = checkCaseConsistency({ pastMedicalHistory: { conditions: text } })
      .filter(i => i.code === 'content/authoring-note')
    assert.equal(issues.length, 1, text)
  }
})

test('clinical prose that merely sounds like a note is left alone', () => {
  // 'withhold' is the trap: withholding treatment is real medicine, and an
  // undocumented history is a legitimate thing for a chart to say.
  for (const text of [
    'Metastatic pancreatic cancer; the family elected to withhold resuscitation.',
    'Decision made to withhold dialysis after goals-of-care discussion.',
    'Smoking status not documented at the time of the index admission.',
    'Vitiligo (diagnosed age 30). Chronic low back pain.',
    'Hypertension, initially treated with amlodipine and later uncontrolled.',
    'Patient did not report chest pain during the episode.',
  ]) {
    const issues = checkCaseConsistency({ pastMedicalHistory: { conditions: text } })
      .filter(i => i.code === 'content/authoring-note')
    assert.deepEqual(issues, [], text)
  }
})

test('a case with no prose at all raises nothing', () => {
  assert.deepEqual(
    checkCaseConsistency({}).filter(i => i.code === 'content/authoring-note'),
    [],
  )
})

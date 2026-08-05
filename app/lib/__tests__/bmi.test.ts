import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBmi, readBmi, caseBmiIsInterpretable, heightIsMeasurable } from '../bmi'

// The audited patient: 67F, 4'9" (57 in), 106 lb, severe thoracic kyphoscoliosis.
// The UI showed "BMI 22.9 (Normal)" in green. Arithmetically right, clinically
// misleading — measured height is not her true height.
const HEIGHT_IN = 57

test('computeBmi handles both weight-string forms the app produces', () => {
  assert.equal(computeBmi(HEIGHT_IN, '106 lbs'), 22.9)
  assert.equal(computeBmi(HEIGHT_IN, '106'), 22.9)
  assert.equal(computeBmi(HEIGHT_IN, 106), 22.9)
  assert.equal(computeBmi(HEIGHT_IN, 'Wt 106 lb'), 22.9)
})

test('computeBmi returns null rather than a bogus number on missing input', () => {
  assert.equal(computeBmi(undefined, '106'), null)
  assert.equal(computeBmi(HEIGHT_IN, ''), null)
  assert.equal(computeBmi(0, '106'), null)
  assert.equal(computeBmi(HEIGHT_IN, 'unknown'), null)
})

test('band boundaries keep the pre-existing < semantics', () => {
  // 18.5 is Normal, not Underweight. Locked so a refactor cannot silently
  // reclassify patients while a display bug is being fixed.
  const cat = (bmi: number) => {
    // Solve for a weight that yields the target BMI at a fixed height.
    const lb = (bmi * HEIGHT_IN * HEIGHT_IN) / 703
    return readBmi(HEIGHT_IN, lb)?.category
  }
  assert.equal(cat(18.4), 'Underweight')
  assert.equal(cat(18.5), 'Normal')
  assert.equal(cat(24.9), 'Normal')
  assert.equal(cat(25), 'Overweight')
  assert.equal(cat(29.9), 'Overweight')
  assert.equal(cat(30), 'Obese')
  assert.equal(cat(41), 'Obese')
})

test('an interpretable reading carries its category and band colour', () => {
  const r = readBmi(HEIGHT_IN, '106 lbs', true)
  assert.equal(r?.value, 22.9)
  assert.equal(r?.category, 'Normal')
  assert.equal(r?.colorClass, 'text-confirmed')
  assert.equal(r?.note, null)
})

test('REGRESSION: an uninterpretable reading withholds the reassuring category', () => {
  const r = readBmi(HEIGHT_IN, '106 lbs', false)
  assert.equal(r?.value, 22.9, 'the number is kept — height and weight are on screen beside it')
  assert.notEqual(r?.category, 'Normal')
  assert.equal(r?.category, null)
  assert.notEqual(r?.colorClass, 'text-confirmed', 'must not be green')
  assert.equal(r?.colorClass, 'text-ink-tertiary')
  assert.match(r?.note ?? '', /arm span/)
})

test('caseBmiIsInterpretable reads diagnosis, either HPI, and past medical history', () => {
  assert.equal(caseBmiIsInterpretable({ diagnosis: 'Severe thoracic kyphoscoliosis' }), false)
  assert.equal(caseBmiIsInterpretable({ clinicalHpi: 'Longstanding kyphoscoliosis with dyspnea.' }), false)
  assert.equal(caseBmiIsInterpretable({ advancedHpi: 'Elderly woman, spinal deformity.' }), true, 'vague wording alone does not invalidate')
  // The deformity is not always the diagnosis.
  assert.equal(caseBmiIsInterpretable({
    diagnosis: 'Reactivation Pulmonary Tuberculosis',
    pastMedicalHistory: { conditions: 'Childhood Pott disease with residual kyphoscoliosis' },
  }), false)
  assert.equal(caseBmiIsInterpretable({ diagnosis: 'Community-Acquired Pneumonia' }), true)
  assert.equal(caseBmiIsInterpretable({}), true)
})

test('below-knee amputation and achondroplasia invalidate measured height', () => {
  assert.equal(caseBmiIsInterpretable({ diagnosis: 'Below-knee amputation, diabetic' }), false)
  assert.equal(caseBmiIsInterpretable({ diagnosis: 'Achondroplasia' }), false)
})

test('the narrowed patterns do not fire on conditions that spare standing height', () => {
  // Dupuytren's is a hand contracture; Paget's of the breast is not skeletal.
  assert.equal(heightIsMeasurable("Dupuytren's contracture of the right hand"), true)
  assert.equal(heightIsMeasurable('Paget disease of the nipple'), true)
  // …but the skeletal forms still do.
  assert.equal(heightIsMeasurable('Bilateral hip flexion contracture'), false)
  assert.equal(heightIsMeasurable('Paget disease of bone'), false)
  assert.equal(heightIsMeasurable('Osteitis deformans'), false)
})

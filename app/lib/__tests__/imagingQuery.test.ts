import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildImagingQuery } from '../imagingSearch'

// Open-i is searched by keyword, and the keyword came from the case DIAGNOSIS
// plus the ordered study's body part. That breaks whenever a study images a
// COMPLICATION rather than the primary disease. On the infective endocarditis
// case, the lumbar spine MRI looks for embolic discitis and the brain MRI for
// septic emboli — neither is "endocarditis". Worse, the modality fallback chain
// reached past the missing mri entry to the xray one, so a lumbar spine MRI was
// searched as "endocarditis chest".

const q = (orderedTest: string, caseDiagnosis: string, imagingCategory?: string) =>
  buildImagingQuery({ orderedTest, caseDiagnosis, imagingCategory })!.query.toLowerCase()

// ── The bug ──────────────────────────────────────────────────────────────────

test('a lumbar spine MRI is never searched as a chest study', () => {
  const query = q('MRI Lumbar Spine with and without Contrast', 'Infective Endocarditis')
  assert.ok(!query.includes('chest'), `leaked the xray query's anatomy: "${query}"`)
})

test('the spine MRI searches for the complication it is ordered to find', () => {
  const query = q('MRI Lumbar Spine with and without Contrast', 'Infective Endocarditis')
  assert.ok(query.includes('discitis'))
  assert.ok(query.includes('vertebral osteomyelitis'))
})

test('the brain MRI on the same case searches for septic emboli, not discitis', () => {
  const query = q('MRI Brain with DWI (Diffusion-Weighted Imaging)', 'Infective Endocarditis')
  assert.ok(query.includes('septic emboli'))
  assert.ok(!query.includes('discitis'),
    'one modality, two anatomies, two different questions — a single query cannot serve both')
})

test('the echo still gets the valve query it always had', () => {
  const query = q('Echocardiogram (Transthoracic)', 'Infective Endocarditis')
  assert.ok(query.includes('vegetation'))
  assert.ok(!query.includes('discitis'))
})

// ── Cross-modality fallback: kept where safe, blocked where not ──────────────

test('a compatible cross-modality fallback still applies', () => {
  // CHF defines xray and us queries but no ct; a chest CT may borrow the chest
  // xray query because both describe the same anatomy.
  const query = q('CT Chest with Contrast', 'Congestive Heart Failure')
  assert.ok(query.includes('pulmonary edema') || query.includes('cardiomegaly'),
    `expected the borrowed chest query, got "${query}"`)
})

test('a borrowed query does not carry the source modality vocabulary', () => {
  // The head CT borrows the brain MRI query: right anatomy, right pathology,
  // but it must not send "diffusion weighted MRI" into a CT collection.
  const query = q('CT Head without Contrast', 'Infective Endocarditis')
  assert.ok(query.includes('septic emboli'), `lost the pathology: "${query}"`)
  assert.ok(!query.includes('mri'), `carried the source modality: "${query}"`)
  assert.ok(!query.includes('diffusion'), `carried an MRI-only technique: "${query}"`)
})

test('an exact-modality query keeps its own vocabulary', () => {
  const query = q('MRI Brain with DWI (Diffusion-Weighted Imaging)', 'Infective Endocarditis')
  assert.ok(query.includes('diffusion weighted'), 'authored queries are left as written')
})

test('a fallback naming no body part is never blocked', () => {
  const query = q('CT Abdomen and Pelvis with Contrast', 'Congestive Heart Failure')
  assert.ok(query.length > 0)
})

test('parts within one region may share a query', () => {
  // 'thoracic spine' and 'lumbar' are both spine — the discitis query serves both.
  const query = q('MRI Thoracic Spine', 'Infective Endocarditis')
  assert.ok(query.includes('discitis'))
})

// ── Anatomy fallback for cases with no map entry ─────────────────────────────

test('an unmapped diagnosis falls back to the anatomy, not to diagnosis words', () => {
  const query = q('MRI Lumbar Spine with and without Contrast', 'Zebra Fever Of Unknown Origin')
  assert.ok(query.includes('lumbar spine'), `expected anatomy, got "${query}"`)
  assert.ok(query.includes('mri'))
  assert.ok(!query.includes('zebra'), 'the diagnosis words produced unsearchable queries')
})

test('spine parts are phrased as anatomy rather than bare adjectives', () => {
  for (const [test_, part] of [
    ['MRI Cervical Spine', 'cervical spine'],
    ['MRI Thoracic Spine', 'thoracic spine'],
  ] as const) {
    const query = q(test_, 'Zebra Fever Of Unknown Origin')
    assert.ok(query.includes(part), `"${test_}" → "${query}"`)
  }
})

test('the anatomy fallback names the modality', () => {
  assert.ok(q('Abdominal Ultrasound', 'Zebra Fever Of Unknown Origin').includes('ultrasound'))
  assert.ok(q('CT Head without Contrast', 'Zebra Fever Of Unknown Origin').includes('ct'))
})

test('a renal study resolves to an organ rather than to nothing', () => {
  // 'Renal Ultrasound' matched no body-part term at all, so it could neither
  // benefit from the anatomy fallback nor be protected from a cross-anatomy one.
  const built = buildImagingQuery({
    orderedTest: 'Renal Ultrasound',
    caseDiagnosis: 'Zebra Fever Of Unknown Origin',
  })!
  assert.equal(built.bodyPart, 'kidney')
  assert.ok(built.query.toLowerCase().includes('kidney'))
  assert.ok(built.query.toLowerCase().includes('ultrasound'))
})

// ── Shape ────────────────────────────────────────────────────────────────────

test('imagingCategory is still appended', () => {
  assert.ok(q('MRI Lumbar Spine with and without Contrast', 'Infective Endocarditis', 'osteomyelitis')
    .endsWith('osteomyelitis'))
})

test('a non-imaging order resolves to nothing', () => {
  assert.equal(buildImagingQuery({ orderedTest: 'Complete Blood Count (CBC)', caseDiagnosis: 'Anemia' }), null)
})

test('body part and modality params travel with the query', () => {
  const built = buildImagingQuery({
    orderedTest: 'MRI Lumbar Spine with and without Contrast',
    caseDiagnosis: 'Infective Endocarditis',
  })!
  assert.equal(built.bodyPart, 'lumbar')
  assert.equal(built.testParams.modality, 'mri')
})

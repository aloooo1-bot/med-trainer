import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewItems, addReviewItems, isRecallWorthy, type CaseLike } from '../store'

const T0 = 1_700_000_000_000

const CASE: CaseLike = {
  diagnosis: 'IgA Nephropathy',
  mechanism: 'Galactose-deficient IgA1 immune complexes deposit in the mesangium, triggering complement activation and mesangial proliferation.',
  teachingPoints: [
    'IgA nephropathy classically presents with synpharyngitic hematuria.',
    'Complement is typically normal, distinguishing it from PSGN.',
    'Initiate ACE inhibitor or ARB for proteinuria >1 g/day and target BP <130/80.',
  ],
  testImpacts: {
    'Renal Biopsy': {
      'IgA Nephropathy': { effect: 'confirms', why: 'dominant mesangial IgA deposits on immunofluorescence' },
      PSGN: { effect: 'excludes', why: 'no subepithelial humps' },
    },
  },
}

test('buildReviewItems extracts mechanism, management, and discriminator cards', () => {
  const items = buildReviewItems(CASE, 'Renal', T0)
  const tags = items.map(i => i.tag).sort()
  assert.deepEqual(tags, ['discriminator', 'management', 'mechanism'])
  // stable, slugged ids per (diagnosis, tag)
  assert.ok(items.some(i => i.id === 'iga-nephropathy::mechanism'))
  // management card picks the pearl containing a dose/threshold, not the generic ones
  const mgmt = items.find(i => i.tag === 'management')!
  assert.match(mgmt.answer, /ACE inhibitor|130\/80|>1 g\/day/)
  // discriminator points at the confirming test
  const disc = items.find(i => i.tag === 'discriminator')!
  assert.match(disc.answer, /Renal Biopsy/)
  // all start due immediately
  for (const i of items) assert.equal(i.dueAt, T0)
})

test('buildReviewItems is resilient to a sparse case', () => {
  const items = buildReviewItems({ diagnosis: 'Acute Cystitis' }, 'Renal', T0)
  assert.equal(items.length, 0)
})

test('management card prefers the last teaching point (the schema-mandated pearl slot)', () => {
  // A screening pearl with a ≥ threshold precedes the true management pearl —
  // the old first-match scan grabbed it and produced a wrong-answer card.
  const c: CaseLike = {
    diagnosis: 'Primary Hyperaldosteronism',
    teachingPoints: [
      'Suspect in resistant hypertension uncontrolled on ≥3 agents with an ARR >30.',
      'Confirm with saline suppression testing before subtype evaluation.',
      'Initiate spironolactone 12.5–25 mg daily for bilateral disease; adrenalectomy for unilateral adenoma.',
    ],
  }
  const mgmt = buildReviewItems(c, 'Endocrine / Metabolic', T0).find(i => i.tag === 'management')!
  assert.match(mgmt.answer, /spironolactone/)
  assert.doesNotMatch(mgmt.answer, /ARR/)
})

test('management card falls back to first regex match when the last pearl is not management-shaped', () => {
  const c: CaseLike = {
    diagnosis: 'Cellulitis',
    teachingPoints: [
      'First-line treatment is cephalexin 500 mg four times daily for 5 days.',
      'Bilateral "cellulitis" is almost always stasis dermatitis.',
    ],
  }
  const mgmt = buildReviewItems(c, 'Infectious', T0).find(i => i.tag === 'management')!
  assert.match(mgmt.answer, /cephalexin/)
})

test('recallCards answers take precedence over derived answers, and stand alone', () => {
  const c: CaseLike = {
    ...CASE,
    recallCards: {
      mechanism: 'Mesangial deposition of galactose-deficient IgA1 immune complexes.',
      management: 'ACE inhibitor or ARB; add immunosuppression only for persistent proteinuria.',
      discriminator: 'Renal biopsy — dominant mesangial IgA on immunofluorescence.',
    },
  }
  const items = buildReviewItems(c, 'Renal', T0)
  assert.equal(items.find(i => i.tag === 'mechanism')!.answer, c.recallCards!.mechanism)
  assert.equal(items.find(i => i.tag === 'management')!.answer, c.recallCards!.management)
  assert.equal(items.find(i => i.tag === 'discriminator')!.answer, c.recallCards!.discriminator)

  // recallCards alone (no mechanism/teachingPoints/testImpacts) still yields all 3 cards
  const sparse: CaseLike = { diagnosis: 'IgA Nephropathy', recallCards: c.recallCards }
  assert.equal(buildReviewItems(sparse, 'Renal', T0).length, 3)
})

test('buildReviewItems returns nothing without a diagnosis', () => {
  assert.equal(buildReviewItems({ diagnosis: '' }, 'Renal', T0).length, 0)
})

test('incidental-finding diagnoses yield no cards; real diagnoses pass the gate', () => {
  for (const junk of [
    'Surgical clip in right lung, otherwise unremarkable chest',
    'Normal chest radiograph',
    'Incidental pulmonary nodule, no acute disease',
  ]) {
    assert.equal(isRecallWorthy(junk), false, junk)
    assert.equal(
      buildReviewItems({ diagnosis: junk, recallCards: { mechanism: 'x', management: 'y', discriminator: 'z' } }, 'Respiratory', T0).length,
      0,
      junk,
    )
  }
  // Anchored phrasing: diagnoses containing "normal" as a disease name still pass.
  assert.equal(isRecallWorthy('Normal Pressure Hydrocephalus'), true)
  assert.equal(isRecallWorthy('IgA Nephropathy'), true)
})

test('addReviewItems refreshes text on existing ids but preserves SM-2 state', () => {
  // Minimal localStorage stub so the store helpers run under node:test.
  const backing = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => { backing.set(k, v) },
    removeItem: (k: string) => { backing.delete(k) },
  }
  try {
    const [first] = buildReviewItems(CASE, 'Renal', T0)
    addReviewItems([{ ...first, ease: 2.1, intervalDays: 6, repetitions: 2, dueAt: T0 + 1, lastReviewedAt: T0 }])

    const better = buildReviewItems(
      { ...CASE, recallCards: { mechanism: 'Short, case-agnostic mechanism.' } },
      'Renal',
      T0 + 1000,
    )
    const merged = addReviewItems(better)
    const card = merged.find(i => i.id === first.id)!
    assert.equal(card.answer, 'Short, case-agnostic mechanism.') // text refreshed
    assert.equal(card.ease, 2.1)          // scheduling state untouched
    assert.equal(card.repetitions, 2)
    assert.equal(card.dueAt, T0 + 1)
    assert.equal(card.createdAt, T0)      // not re-minted
    // no duplicate ids
    assert.equal(merged.filter(i => i.id === first.id).length, 1)
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage
  }
})

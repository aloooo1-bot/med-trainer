import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewItems, type CaseLike } from '../store'

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

test('buildReviewItems returns nothing without a diagnosis', () => {
  assert.equal(buildReviewItems({ diagnosis: '' }, 'Renal', T0).length, 0)
})

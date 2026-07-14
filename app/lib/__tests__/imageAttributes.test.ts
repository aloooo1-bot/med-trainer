import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractLaterality, caseLaterality, lateralityRelation,
  classifyCandidates, selectByLaterality, filterByLaterality,
} from '../imageAttributes'

const firstPick = <T>(xs: T[]) => xs[0]

test('extractLaterality reads sides from radiology descriptors', () => {
  assert.equal(extractLaterality('right pleural effusion'), 'right')
  assert.equal(extractLaterality('Left lower lobe consolidation'), 'left')
  assert.equal(extractLaterality('bilateral pleural effusions'), 'bilateral')
  assert.equal(extractLaterality('right and left basilar opacities'), 'bilateral')
  assert.equal(extractLaterality('midline shift'), 'midline')
  assert.equal(extractLaterality('diffuse reticular opacities'), 'unknown')
  assert.equal(extractLaterality(''), 'unknown')
})

test('caseLaterality prefers imagingCategory, falls back to report text', () => {
  assert.equal(caseLaterality('right pleural effusion', 'some report'), 'right')
  assert.equal(caseLaterality('pleural effusion', 'Large effusion in the left hemithorax'), 'left')
  assert.equal(caseLaterality(undefined, undefined), 'unknown')
})

test('lateralityRelation: unknown case = no constraint; unknown image = unconfirmed', () => {
  assert.equal(lateralityRelation('unknown', 'left'), 'match')       // non-lateralized case
  assert.equal(lateralityRelation('right', 'right'), 'match')
  assert.equal(lateralityRelation('right', 'left'), 'conflict')
  assert.equal(lateralityRelation('right', undefined), 'unconfirmed')
  assert.equal(lateralityRelation('bilateral', 'right'), 'conflict')  // unilateral image misses a side
})

test('classifyCandidates partitions correctly', () => {
  const c = classifyCandidates(
    [
      { item: 'a', laterality: 'right' },
      { item: 'b', laterality: 'left' },
      { item: 'c' },
    ],
    'right',
  )
  assert.deepEqual(c.matches, ['a'])
  assert.deepEqual(c.conflicts, ['b'])
  assert.deepEqual(c.unconfirmed, ['c'])
})

test('strict policy suppresses when no confirmed match (the fail-safe)', () => {
  const untagged = [{ item: 'x' }, { item: 'y' }] // no laterality attributes yet
  const r = selectByLaterality(untagged, 'right', 'strict', firstPick)
  assert.equal(r.item, null)
  assert.equal(r.match.status, 'suppressed')
})

test('strict policy serves a confirmed match', () => {
  const cands = [{ item: 'wrong', laterality: 'left' as const }, { item: 'right-img', laterality: 'right' as const }]
  const r = selectByLaterality(cands, 'right', 'strict', firstPick)
  assert.equal(r.item, 'right-img')
  assert.equal(r.match.status, 'confirmed')
})

test('lenient policy serves an unconfirmed image but never a conflict', () => {
  const cands = [{ item: 'left-img', laterality: 'left' as const }, { item: 'untagged' }]
  const r = selectByLaterality(cands, 'right', 'lenient', firstPick)
  assert.equal(r.item, 'untagged')       // conflict (left-img) never chosen
  assert.equal(r.match.status, 'unconfirmed')
})

test('non-lateralized case serves any image', () => {
  const r = selectByLaterality([{ item: 'any' }], 'unknown', 'strict', firstPick)
  assert.equal(r.item, 'any')
  assert.equal(r.match.status, 'confirmed')
})

test('filterByLaterality drops conflicting live results and sorts matches first', () => {
  const results = [
    { caption: 'Chest radiograph showing left pleural effusion' },
    { caption: 'Right-sided pleural effusion on PA film' },
    { caption: 'Pleural effusion, unspecified side' },
  ]
  const { items, match } = filterByLaterality(results, r => r.caption, 'right', 'strict')
  assert.equal(match.status, 'confirmed')
  assert.equal(items[0].caption, 'Right-sided pleural effusion on PA film') // match first
  assert.ok(!items.some(r => r.caption.includes('left pleural'))) // conflict dropped
})

test('filterByLaterality strict-suppresses when every live result conflicts or is unknown', () => {
  const results = [{ caption: 'left pleural effusion' }]
  const { items, match } = filterByLaterality(results, r => r.caption, 'right', 'strict')
  assert.deepEqual(items, [])
  assert.equal(match.status, 'suppressed')
})

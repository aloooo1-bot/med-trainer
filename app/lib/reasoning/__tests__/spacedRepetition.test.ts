import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeReviewItem, scheduleNext, dueItems, dueCount } from '../spacedRepetition'
import type { ReviewItem } from '../types'

const T0 = 1_700_000_000_000 // fixed epoch for deterministic tests
const DAY = 86_400_000

function newItem(now = T0): ReviewItem {
  return makeReviewItem(
    { id: 'r1', prompt: 'Discriminator for IgA nephropathy?', answer: 'Synpharyngitic hematuria', diagnosis: 'IgA Nephropathy', system: 'Renal', tag: 'discriminator' },
    now,
  )
}

test('makeReviewItem starts due immediately with default SM-2 state', () => {
  const i = newItem()
  assert.equal(i.dueAt, T0)
  assert.equal(i.repetitions, 0)
  assert.equal(i.ease, 2.5)
  assert.equal(i.intervalDays, 0)
})

test('successful reviews follow the SM-2 interval progression 1 → 6 → interval*ease', () => {
  let i = newItem()
  i = scheduleNext(i, 'good', T0)
  assert.equal(i.repetitions, 1)
  assert.equal(i.intervalDays, 1)
  assert.equal(i.dueAt, T0 + 1 * DAY)

  i = scheduleNext(i, 'good', i.dueAt)
  assert.equal(i.repetitions, 2)
  assert.equal(i.intervalDays, 6)

  const easeBefore = i.ease
  i = scheduleNext(i, 'good', i.dueAt)
  assert.equal(i.repetitions, 3)
  assert.equal(i.intervalDays, Math.round(6 * easeBefore))
})

test('a lapse (again) resets repetitions and shrinks the interval + ease', () => {
  let i = newItem()
  i = scheduleNext(i, 'good', T0)
  i = scheduleNext(i, 'good', i.dueAt) // interval 6, reps 2
  const easeBefore = i.ease
  i = scheduleNext(i, 'again', i.dueAt)
  assert.equal(i.repetitions, 0)
  assert.equal(i.intervalDays, 1)
  assert.ok(i.ease < easeBefore, 'ease should drop on a lapse')
  assert.ok(i.ease >= 1.3, 'ease floored at 1.3')
})

test('easy grade increases ease faster than good', () => {
  const good = scheduleNext(newItem(), 'good', T0)
  const easy = scheduleNext(newItem(), 'easy', T0)
  assert.ok(easy.ease > good.ease)
})

test('dueItems / dueCount select only items at or past their due time', () => {
  const due = newItem()
  const later = scheduleNext(newItem(), 'good', T0) // due T0 + 1 day
  const all = [due, later]
  assert.equal(dueCount(all, T0), 1)
  assert.deepEqual(dueItems(all, T0).map(i => i.id), ['r1'])
  // a day later both are due
  assert.equal(dueCount(all, T0 + DAY), 2)
})

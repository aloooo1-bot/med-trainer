import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  masteryKey,
  updateMastery,
  isMastered,
  recommendNext,
  MASTERY_THRESHOLD,
} from '../mastery'
import type { MasteryRecord } from '../types'

const T0 = 1_700_000_000_000

test('first attempt seeds the score directly', () => {
  const rec = updateMastery(undefined, 'Renal', 'Clinical', 72, true, T0)
  assert.equal(rec.key, masteryKey('Renal', 'Clinical'))
  assert.equal(rec.score, 72)
  assert.equal(rec.attempts, 1)
  assert.equal(rec.correctStreak, 1)
})

test('subsequent attempts blend via EWMA and track streaks', () => {
  let rec = updateMastery(undefined, 'Renal', 'Clinical', 60, true, T0)
  rec = updateMastery(rec, 'Renal', 'Clinical', 100, true, T0 + 1)
  // 0.4*100 + 0.6*60 = 76
  assert.equal(rec.score, 76)
  assert.equal(rec.attempts, 2)
  assert.equal(rec.correctStreak, 2)
  // a wrong answer resets the streak
  rec = updateMastery(rec, 'Renal', 'Clinical', 40, false, T0 + 2)
  assert.equal(rec.correctStreak, 0)
})

test('isMastered requires high score AND enough attempts AND a recent correct streak', () => {
  const base: MasteryRecord = {
    key: masteryKey('Cardiovascular', 'Foundations'),
    system: 'Cardiovascular',
    difficulty: 'Foundations',
    score: MASTERY_THRESHOLD + 5,
    attempts: 4,
    lastAttemptAt: T0,
    correctStreak: 2,
  }
  assert.ok(isMastered(base))
  assert.ok(!isMastered({ ...base, attempts: 2 }), 'too few attempts')
  assert.ok(!isMastered({ ...base, correctStreak: 1 }), 'streak too short')
  assert.ok(!isMastered({ ...base, score: 70 }), 'score too low')
  assert.ok(!isMastered(undefined))
})

const CANDIDATES = [
  { system: 'Renal', difficulty: 'Foundations' },
  { system: 'Renal', difficulty: 'Clinical' },
  { system: 'Cardiovascular', difficulty: 'Foundations' },
]

test('recommendNext prefers an untried slot at the lowest difficulty', () => {
  const records = [updateMastery(undefined, 'Renal', 'Foundations', 90, true, T0)]
  const rec = recommendNext(records, CANDIDATES)!
  assert.equal(rec.difficulty, 'Foundations') // Cardiovascular/Foundations untried
  assert.equal(rec.system, 'Cardiovascular')
})

test('recommendNext falls back to the weakest attempted-but-unmastered slot', () => {
  const records = [
    updateMastery(undefined, 'Renal', 'Foundations', 55, false, T0),
    updateMastery(undefined, 'Renal', 'Clinical', 85, true, T0),
    updateMastery(undefined, 'Cardiovascular', 'Foundations', 70, true, T0),
  ]
  const rec = recommendNext(records, CANDIDATES)!
  assert.equal(rec.system, 'Renal')
  assert.equal(rec.difficulty, 'Foundations') // lowest score (55)
})

test('recommendNext returns null with no candidates', () => {
  assert.equal(recommendNext([], []), null)
})

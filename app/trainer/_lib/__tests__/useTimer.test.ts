import test from 'node:test'
import assert from 'node:assert/strict'
import { tickTimer, resumedStatus, fmtTime } from '../useTimer'
import type { TimerState } from '../types'

const base: TimerState = {
  totalSeconds: 10, remainingSeconds: 10, elapsedSeconds: 0, pausedSeconds: 0, status: 'running',
}

test('a running tick decrements remaining and increments elapsed', () => {
  const next = tickTimer(base)
  assert.equal(next.remainingSeconds, 9)
  assert.equal(next.elapsedSeconds, 1)
  assert.equal(next.status, 'running')
})

test('the final tick rolls into expired at remaining 0', () => {
  const next = tickTimer({ ...base, remainingSeconds: 1, elapsedSeconds: 9 })
  assert.equal(next.status, 'expired')
  assert.equal(next.remainingSeconds, 0)
  assert.equal(next.elapsedSeconds, 10)
})

test('expired keeps counting elapsed — the soft deadline never stops the case', () => {
  let s: TimerState = { ...base, remainingSeconds: 0, elapsedSeconds: 10, status: 'expired' }
  s = tickTimer(tickTimer(tickTimer(s)))
  assert.equal(s.status, 'expired')
  assert.equal(s.remainingSeconds, 0)
  assert.equal(s.elapsedSeconds, 13)
  // Overtime shown in the header, and the flag sent to grading, both derive
  // from elapsed >= total.
  assert.equal(s.elapsedSeconds - s.totalSeconds, 3)
  assert.ok(s.totalSeconds > 0 && s.elapsedSeconds >= s.totalSeconds)
})

test('idle, paused, and completed do not tick', () => {
  for (const status of ['idle', 'paused', 'completed'] as const) {
    const s = { ...base, status }
    assert.deepEqual(tickTimer(s), s)
  }
})

test('a pause taken mid-case resumes to running', () => {
  assert.equal(resumedStatus({ ...base, remainingSeconds: 4, status: 'paused' }), 'running')
})

test('a pause taken during overtime resumes back into overtime', () => {
  assert.equal(resumedStatus({ ...base, remainingSeconds: 0, elapsedSeconds: 15, status: 'paused' }), 'expired')
})

test('an untimed (Foundations) state never resumes into expired', () => {
  assert.equal(resumedStatus({ ...base, totalSeconds: 0, remainingSeconds: 0, status: 'paused' }), 'running')
})

test('fmtTime pads seconds', () => {
  assert.equal(fmtTime(65), '1:05')
  assert.equal(fmtTime(0), '0:00')
})

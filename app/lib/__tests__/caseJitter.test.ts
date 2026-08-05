import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jitterCase, VITAL_THRESHOLDS } from '../caseJitter'

/**
 * Jitter varies the numbers so repeat encounters differ, but the case's prose
 * and teaching points are fixed text written against the authored value. These
 * tests pin the invariant that makes that safe: a jittered vital may move, but
 * never across a line that changes what the number MEANS.
 */

function makeCase(vitals: Partial<{ bp: string; hr: number; rr: number; temp: number; spo2: number; weight: string }>) {
  return {
    patientInfo: { name: 'Test Patient', age: 60, gender: 'Female' },
    vitals: { bp: '130/80', hr: 80, rr: 16, temp: 98.6, spo2: 97, weight: '150 lbs', ...vitals },
  }
}

const RUNS = 400

test('SpO2 authored at the 88% oxygen threshold never drops below it', () => {
  for (let i = 0; i < RUNS; i++) {
    assert.ok(jitterCase(makeCase({ spo2: 88 })).vitals.spo2 >= 88)
  }
})

test('SpO2 authored below 88 never rises to meet it', () => {
  for (let i = 0; i < RUNS; i++) {
    assert.ok(jitterCase(makeCase({ spo2: 87 })).vitals.spo2 < 88)
  }
})

test('a non-tachycardic rate never jitters into tachycardia', () => {
  for (let i = 0; i < RUNS; i++) {
    assert.ok(jitterCase(makeCase({ hr: 98 })).vitals.hr <= 100)
  }
})

test('a tachycardic rate stays tachycardic', () => {
  for (let i = 0; i < RUNS; i++) {
    assert.ok(jitterCase(makeCase({ hr: 102 })).vitals.hr > 100)
  }
})

test('a febrile temperature never jitters below the fever threshold', () => {
  for (let i = 0; i < RUNS; i++) {
    assert.ok(jitterCase(makeCase({ temp: 100.5 })).vitals.temp >= 100.4)
  }
})

test('an afebrile temperature never jitters up into fever', () => {
  for (let i = 0; i < RUNS; i++) {
    assert.ok(jitterCase(makeCase({ temp: 100.2 })).vitals.temp < 100.4)
  }
})

test('a hypotensive systolic never jitters out of hypotension', () => {
  for (let i = 0; i < RUNS; i++) {
    const sys = parseInt(jitterCase(makeCase({ bp: '88/58' })).vitals.bp.split('/')[0], 10)
    assert.ok(sys < 90, `expected <90, got ${sys}`)
  }
})

test('jitter still varies values inside a band', () => {
  const seen = new Set<number>()
  for (let i = 0; i < RUNS; i++) seen.add(jitterCase(makeCase({ hr: 80 })).vitals.hr)
  assert.ok(seen.size > 1, 'clamping must not freeze values that sit far from any threshold')
})

test('every threshold list is sorted and free of duplicates', () => {
  for (const [vital, list] of Object.entries(VITAL_THRESHOLDS)) {
    const arr = [...list]
    assert.deepEqual(arr, [...new Set(arr)].sort((a, b) => a - b), `${vital} thresholds must be sorted and unique`)
  }
})

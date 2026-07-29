import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadingStage, isGenerating, QUIET_MS, GENERATING_MS, LONG_MS,
} from '../_lib/loadingStage'

// The quiet window is the whole point: with the case library fully warm, most
// starts are ~150-400ms cache hits, and showing a spinner for those flashes a
// loading screen that vanishes before it can be read.

test('a cached-speed case stays quiet — nothing is rendered', () => {
  assert.equal(loadingStage(0), 'quiet')
  assert.equal(loadingStage(150), 'quiet')   // typical cache hit
  assert.equal(loadingStage(400), 'quiet')   // slow cache hit
  assert.equal(loadingStage(QUIET_MS - 1), 'quiet')
})

test('a slow-but-not-generating wait shows the minimal treatment', () => {
  assert.equal(loadingStage(QUIET_MS), 'preparing')      // boundary is inclusive
  assert.equal(loadingStage(1200), 'preparing')
  assert.equal(loadingStage(GENERATING_MS - 1), 'preparing')
})

test('past the generation threshold it is a real write', () => {
  assert.equal(loadingStage(GENERATING_MS), 'generating')
  assert.equal(loadingStage(12_000), 'generating')
  assert.equal(loadingStage(LONG_MS - 1), 'generating')
})

test('a long wait is acknowledged rather than treated as normal', () => {
  assert.equal(loadingStage(LONG_MS), 'long')
  assert.equal(loadingStage(120_000), 'long')  // near the server abort ceiling
})

test('isGenerating covers both generating stages and neither early one', () => {
  assert.equal(isGenerating('quiet'), false)
  assert.equal(isGenerating('preparing'), false)
  assert.equal(isGenerating('generating'), true)
  assert.equal(isGenerating('long'), true)
})

test('stages advance monotonically — no stage is ever skipped backwards', () => {
  const order = ['quiet', 'preparing', 'generating', 'long']
  let last = 0
  for (let ms = 0; ms <= 30_000; ms += 50) {
    const idx = order.indexOf(loadingStage(ms))
    assert.ok(idx >= last, `stage went backwards at ${ms}ms`)
    last = idx
  }
})

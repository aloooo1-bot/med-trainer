import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withTimeout, TimeoutError } from '../withTimeout'

/**
 * A fake timer so these run instantly. `fire()` triggers the pending callback,
 * standing in for the deadline elapsing.
 */
function fakeTimer() {
  let pending: (() => void) | null = null
  let cleared = false
  return {
    timer: {
      set: (fn: () => void) => { pending = fn; return 1 as unknown },
      clear: () => { cleared = true; pending = null },
    },
    fire: () => pending?.(),
    get cleared() { return cleared },
  }
}

test('the DEFAULT timer works when called as a method', async () => {
  // Regression: `{ set: setTimeout }` invoked as `timer.set(...)` binds `this`
  // to the timer object, which browsers reject with "Illegal invocation" —
  // throwing synchronously and sending every wrapped request to its catch
  // branch. Every other test here injects a fake timer and cannot catch this,
  // so this one deliberately exercises the real default.
  assert.equal(await withTimeout(Promise.resolve('ok'), 50_000), 'ok')
  await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 50_000), /boom/)
  // And it genuinely times out on a real (short) deadline.
  await assert.rejects(withTimeout(new Promise<void>(() => {}), 5), /timed out/)
})

test('resolves with the value when the promise wins', async () => {
  const t = fakeTimer()
  const result = await withTimeout(Promise.resolve('ecg'), 15_000, 'image', t.timer as never)
  assert.equal(result, 'ecg')
})

test('clears the timer on success so nothing fires later', async () => {
  const t = fakeTimer()
  await withTimeout(Promise.resolve('ok'), 15_000, 'image', t.timer as never)
  assert.equal(t.cleared, true)
})

test('propagates the original rejection rather than masking it as a timeout', async () => {
  const t = fakeTimer()
  await assert.rejects(
    withTimeout(Promise.reject(new Error('HTTP 400')), 15_000, 'image', t.timer as never),
    /HTTP 400/,
  )
  assert.equal(t.cleared, true)
})

test('rejects with TimeoutError when the deadline elapses first', async () => {
  const t = fakeTimer()
  // A promise that never settles — the exact condition that left the ECG panel
  // pulsing "Loading ECG…" forever with no machine read to fall back on.
  const forever = new Promise<string>(() => {})
  const p = withTimeout(forever, 15_000, 'image request for "ECG"', t.timer as never)
  t.fire()
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof TimeoutError)
    assert.match((err as Error).message, /image request for "ECG" timed out after 15000ms/)
    return true
  })
})

test('a hanging request always settles, so the caller can reach its fallback', async () => {
  const t = fakeTimer()
  const forever = new Promise<string>(() => {})
  let outcome = 'still pending'
  const p = withTimeout(forever, 15_000, 'image', t.timer as never)
    .then(() => { outcome = 'resolved' })
    .catch(() => { outcome = 'failed' })
  t.fire()
  await p
  assert.equal(outcome, 'failed', 'the loading state must be escapable')
})

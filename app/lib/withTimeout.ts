/**
 * Bound a promise so it always settles.
 *
 * Written for the session image fetches, where an unsettled request was not a
 * slow request but a permanent one: the panel showed "Loading ECG…" forever,
 * and before a diagnosis is submitted it shows no machine read either — so a
 * student who had ordered the ECG was left with a pulsing box and nothing to
 * interpret. A request that cannot finish must be allowed to fail, because the
 * failure path has an honest fallback and the loading path does not.
 *
 * Pure + testable: the timer is injectable so tests need no real delay.
 */

export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`${label ?? 'operation'} timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string,
  // Injectable so tests do not have to wait.
  //
  // Wrapped in arrow functions rather than passed as bare references: assigning
  // `set: setTimeout` and calling it as `timer.set(...)` invokes it with `this`
  // bound to the timer object, which browsers reject with "Illegal invocation".
  // That threw synchronously inside the try block, so every image request —
  // ECG, special modality and radiology alike — landed in the catch and
  // reported itself as failed.
  timer: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = timer.set(() => reject(new TimeoutError(ms, label)), ms)
    promise.then(
      value => { timer.clear(handle); resolve(value) },
      error => { timer.clear(handle); reject(error) },
    )
  })
}

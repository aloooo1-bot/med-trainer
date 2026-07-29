/**
 * Which loading treatment to show, purely as a function of elapsed time.
 *
 * Extracted from the component so the thresholds are testable: the most
 * important one — that a fast (cached) case shows NOTHING — is a sub-second
 * window that is impractical to observe reliably in a browser harness.
 *
 * Two very different waits hide behind one "generating" flag. A cached case
 * resolves in ~150-400ms; only an uncached slot triggers a live generation,
 * which can run tens of seconds.
 */
export type LoadingStage = 'quiet' | 'preparing' | 'generating' | 'long'

/** Below this a case is effectively instant — showing a spinner would flash. */
export const QUIET_MS = 450
/** Past this it is not a cache hit; it is genuinely being written. */
export const GENERATING_MS = 4000
/** Past this, acknowledge the wait instead of implying it is normal. */
export const LONG_MS = 25_000

export function loadingStage(elapsedMs: number): LoadingStage {
  if (elapsedMs >= LONG_MS) return 'long'
  if (elapsedMs >= GENERATING_MS) return 'generating'
  if (elapsedMs >= QUIET_MS) return 'preparing'
  return 'quiet'
}

/** Whether this stage is a real generation (drives the copy and the tip panel). */
export function isGenerating(stage: LoadingStage): boolean {
  return stage === 'generating' || stage === 'long'
}

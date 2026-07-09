import type { GradingResult } from './types'
import { getRubric } from './rubric'

/** Clamp per-dimension scores into their rubric ranges (model may exceed them). */
export function clampDimensions(result: GradingResult, difficulty: string): void {
  if (!result.dimensions) return
  for (const { key, max } of getRubric(difficulty)) {
    const dim = result.dimensions[key]
    if (dim && typeof dim.score === 'number') {
      const clamped = Math.max(0, Math.min(max, dim.score))
      if (clamped !== dim.score) {
        console.warn(`[GRADING] ${key} score ${dim.score} out of [0,${max}] — clamped to ${clamped}`)
        dim.score = clamped
      }
    }
  }
}

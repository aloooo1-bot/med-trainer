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

/**
 * Tidy the itemised deductions and make the score consistent with them.
 *
 * Directional reconciliation:
 *  - When the score is HIGHER than the deductions imply (score > max − sum),
 *    the model under-subtracted — the flagrant case being full marks alongside
 *    itemised criticism, which shipped a student a 15/15 with −15 of reasons.
 *    The deduction reasons are specific, checkable claims; the inflated score
 *    is the arithmetic slip. Lower the score to max − sum (floored at 0).
 *  - When the score is LOWER than the deductions imply, keep it. An incomplete
 *    list that under-explains the gap is acceptable; a score is never RAISED
 *    to fit a list.
 *
 * This runs in gradeSession BEFORE anything is persisted, and the headline
 * total is recomputed from the dimensions immediately after — so lowering an
 * inflated dimension here corrects the recorded grade rather than rewriting
 * one. Must run AFTER clampDimensions, so the gap is measured against a legal
 * score.
 */
export function reconcileDeductions(result: GradingResult, difficulty: string): void {
  if (!result.dimensions) return
  for (const { key, max } of getRubric(difficulty)) {
    const dim = result.dimensions[key]
    if (!dim) continue

    const cleaned = (dim.deductions ?? [])
      .map(d => ({ points: Math.round(Number(d?.points)), reason: String(d?.reason ?? '').trim() }))
      // A zero, negative or unparseable deduction explains nothing, and an
      // unlabelled one is worse than absent — it implies a reason it withholds.
      .filter(d => Number.isFinite(d.points) && d.points > 0 && d.reason !== '')
    dim.deductions = cleaned

    const sum = cleaned.reduce((s, d) => s + d.points, 0)
    const implied = Math.max(0, max - sum)
    if (cleaned.length > 0 && dim.score > implied) {
      console.warn(
        `[GRADING] ${key} score ${dim.score}/${max} exceeds what its own deductions allow ` +
        `(−${sum} ⇒ ${implied}) — lowered to ${implied}`,
      )
      dim.score = implied
    } else if (cleaned.length > 0 && dim.score < implied) {
      console.warn(
        `[GRADING] ${key} deductions sum to ${sum} but the gap is ${max - dim.score} ` +
        `(${dim.score}/${max}) — list under-explains the gap; score kept`,
      )
    }
  }
}

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
 * Tidy the itemised deductions and check they explain the gap.
 *
 * The SCORE IS AUTHORITATIVE and is never rewritten to fit the list. It is
 * recomputed from the dimensions in gradeService, recomputed again when the
 * session is saved, and is the number already sitting in a student's history —
 * bending it to match a model's arithmetic would silently rewrite a recorded
 * grade to make a caption tidy.
 *
 * So when the items do not sum to `max − score` the items are kept and the
 * mismatch is logged. The row header shows the authoritative `−N` either way,
 * so a bad list under-explains the gap rather than misstating it.
 *
 * Must run AFTER clampDimensions, so the gap is measured against a legal score.
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

    const gap = max - dim.score
    const sum = cleaned.reduce((s, d) => s + d.points, 0)
    if (cleaned.length > 0 && sum !== gap) {
      console.warn(
        `[GRADING] ${key} deductions sum to ${sum} but the gap is ${gap} ` +
        `(${dim.score}/${max}) — score left untouched, list shown as returned`,
      )
    }
  }
}

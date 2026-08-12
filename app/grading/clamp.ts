import type { Deduction, GradingResult } from './types'
import { correctDiagnosisFloor, getRubric, wrongDiagnosisCap } from './rubric'

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

/**
 * Shrink a dimension's deductions to fit a smaller gap, keeping every reason.
 *
 * The gaps a deduction names are real and stay visible — a student who skipped
 * the echo should still read "did not order echocardiography". What the floor
 * changes is what those gaps are allowed to COST once the diagnosis is right,
 * so the points scale down proportionally rather than the reasons disappearing.
 * Only when the new gap has fewer points than there are line items must some
 * go, and then the smallest go first: a 1-point item cannot be halved.
 */
function rescaleDeductions(deductions: Deduction[], targetSum: number): Deduction[] {
  if (targetSum <= 0 || deductions.length === 0) return []

  // Rank by weight to decide what survives, but restore the original order for
  // display — the grader listed them in the order it wants them read.
  const ranked = deductions.map((d, i) => ({ d, i })).sort((a, b) => b.d.points - a.d.points)
  const kept = ranked.slice(0, targetSum).sort((a, b) => a.i - b.i).map(x => x.d)

  const oldSum = kept.reduce((s, d) => s + d.points, 0)
  if (oldSum <= targetSum) return kept.map(d => ({ ...d }))

  const scaled = kept.map(d => ({ ...d, points: Math.max(1, Math.round((d.points * targetSum) / oldSum)) }))

  // Rounding and the 1-point minimum both drift the sum; settle it by nudging
  // the largest items, which distorts the relative weights least.
  let drift = scaled.reduce((s, d) => s + d.points, 0) - targetSum
  while (drift > 0) {
    const target = scaled.filter(d => d.points > 1).sort((a, b) => b.points - a.points)[0]
    if (!target) break
    target.points -= 1
    drift -= 1
  }
  while (drift < 0) {
    scaled.sort((a, b) => b.points - a.points)[0].points += 1
    drift += 1
  }
  return scaled
}

/**
 * Enforce the rubric's promise that a correct diagnosis cannot total below the
 * difficulty's floor.
 *
 * The HARD FLOOR block states this to the grader as a MUST with a verify step,
 * and it was still missed — a Clinical case with the correct diagnosis, correct
 * organism and a coherent workup came back at 70 against a floor of 82, because
 * five dimensions each deducted defensibly and nothing summed them. A model
 * cannot be trusted to check its own arithmetic against a threshold; that is
 * what a clamp is for.
 *
 * Points are restored in the rubric's own stated order — testOrdering first,
 * then historyInterview — because those are the process dimensions, the ones a
 * student can lose ground on while still reasoning their way to the right
 * answer. The diagnosis dimensions are reached only if those run out.
 *
 * No dimension is lifted past `max − its largest single deduction`, so its most
 * significant named gap keeps costing something. Without that cap the floor
 * erases exactly the line a student most needs: on the endocarditis case it
 * took testOrdering to a clean 20/20 and deleted "did not order
 * echocardiography" — the pivotal confirmatory test. The PIVOTAL TEST rule is
 * explicit that this deduction survives ("the deduction lives ONLY in
 * testOrdering — do NOT let it pull ... the total below the correct-diagnosis
 * hard floor"), which is a rule about where the cost lands, not permission to
 * refund it.
 *
 * Must run AFTER reconcileDeductions, which lowers scores to match their
 * deduction lists and would otherwise immediately undo every raise.
 */
export function enforceCorrectDiagnosisFloor(result: GradingResult, difficulty: string): void {
  if (!result.dimensions || !result.correct) return

  const rubric = getRubric(difficulty)
  const dims = result.dimensions
  const total = () => rubric.reduce((sum, { key }) => sum + (dims[key]?.score ?? 0), 0)

  const floor = correctDiagnosisFloor(difficulty)
  const before = total()
  if (before >= floor) return

  // Stated redistribution order first, then whatever else has headroom, so the
  // floor is reached even when the process dimensions are already full.
  const order = [...new Set(['testOrdering', 'historyInterview', ...rubric.map(d => d.key)])]

  // Two passes. The first preserves each dimension's largest named gap; if that
  // leaves the total short — every dimension carrying heavy deductions — the
  // second ignores the reservation, because the floor is the rubric's MUST and
  // preserving a line item is this function's own courtesy.
  let touched = 0
  for (const preserveGaps of [true, false]) {
    for (const key of order) {
      const spec = rubric.find(d => d.key === key)
      const dim = dims[key as keyof typeof dims]
      if (!spec || !dim) continue

      const short = floor - total()
      if (short <= 0) break

      // Leave room for the dimension's most significant named gap to still cost
      // something — a refunded deduction is a lesson deleted.
      const largest = preserveGaps ? Math.max(0, ...(dim.deductions ?? []).map(d => d.points)) : 0
      const ceiling = Math.max(dim.score, spec.max - largest)

      const raise = Math.min(short, ceiling - dim.score)
      if (raise <= 0) continue

      dim.score += raise
      dim.deductions = rescaleDeductions(dim.deductions ?? [], spec.max - dim.score)
      touched++
    }
    if (total() >= floor) break
  }

  const after = total()
  if (after < floor) {
    // Every dimension is at max and the total still misses the floor — only
    // possible if the rubric's maxima do not sum to 100. Worth knowing.
    console.warn(
      `[GRADING] correct diagnosis totalled ${after}/100 with every dimension at max — ` +
      `floor of ${floor} unreachable; check the rubric weights for ${difficulty}`,
    )
  } else {
    console.warn(
      `[GRADING] correct diagnosis totalled ${before}/100, below the ${difficulty} floor of ` +
      `${floor} — raised to ${after} across ${touched} dimension(s)`,
    )
  }
}

/**
 * Enforce the rubric's cap on a wrong diagnosis: 60/100, or 70 when the student
 * named the right organ system with the wrong pathological process.
 *
 * The mirror of enforceCorrectDiagnosisFloor, unenforced for the same reason —
 * stated to the grader as a MUST with a verify step, with nothing summing the
 * dimensions afterwards. The failure mode is the more damaging of the two: a
 * thorough workup that reaches the wrong answer scores every process dimension
 * highly, and the rubric's whole position is that naming the wrong entity
 * cannot be a passing grade however good the process was.
 *
 * Points come off in the rubric's stated order — historyInterview first, then
 * testOrdering. Each reduction adds a deduction naming the cap, so a student
 * who loses six points to it can see that it was the cap and not an unnamed
 * judgment about their interview.
 *
 * Must run AFTER reconcileDeductions, whose job is the opposite direction
 * (lowering inflated scores to match their lists); a cap applied first would be
 * measured against numbers that were about to move.
 */
export function enforceWrongDiagnosisCap(result: GradingResult, difficulty: string): void {
  if (!result.dimensions || result.correct) return

  const rubric = getRubric(difficulty)
  const dims = result.dimensions
  const total = () => rubric.reduce((sum, { key }) => sum + (dims[key]?.score ?? 0), 0)

  const cap = wrongDiagnosisCap(difficulty, dims.diagnosisAccuracy?.score ?? 0)
  const before = total()
  if (before <= cap) return

  const order = [...new Set(['historyInterview', 'testOrdering', ...rubric.map(d => d.key)])]
  let touched = 0

  for (const key of order) {
    const dim = dims[key as keyof typeof dims]
    if (!dim) continue

    const excess = total() - cap
    if (excess <= 0) break

    const cut = Math.min(excess, dim.score)
    if (cut <= 0) continue

    dim.score -= cut
    dim.deductions = [
      ...(dim.deductions ?? []),
      { points: cut, reason: `Total capped at ${cap}/100 — the submitted diagnosis was incorrect` },
    ]
    touched++
  }

  const after = total()
  if (after > cap) {
    // Only reachable if diagnosisAccuracy alone exceeds the cap, which means the
    // grader awarded near-full accuracy while calling the diagnosis wrong.
    console.warn(
      `[GRADING] wrong diagnosis totalled ${after}/100 with every dimension at zero — ` +
      `cap of ${cap} unreachable; diagnosisAccuracy was ${dims.diagnosisAccuracy?.score} with correct=false`,
    )
  } else {
    console.warn(
      `[GRADING] wrong diagnosis totalled ${before}/100, above the ${difficulty} cap of ` +
      `${cap} — lowered to ${after} across ${touched} dimension(s)`,
    )
  }
}

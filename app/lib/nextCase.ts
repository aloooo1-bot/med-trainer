/**
 * The single source of truth for "what should this student attempt next".
 *
 * Both surfaces that recommend a case — the dashboard's NextCaseCard and the
 * Focus tab's Up-next strip / study queue — MUST derive from these helpers.
 * They previously used different urgency orderings and different tier cutoffs,
 * so adjacent tabs gave the same student different answers.
 */
import type { SystemEntry } from './dashboardData'
import { type FocusSkips, isSkipped } from './focusSettings'

export type Tier = 'Foundations' | 'Clinical' | 'Advanced'

/**
 * Urgency ranking shared with the Focus study queue: gap from 100, boosted
 * when only one case is on record (a single data point is least trustworthy
 * and most worth confirming).
 */
export function urgencyOf(s: SystemEntry): number {
  return Math.round((100 - s.score) * (s.count === 1 ? 1.2 : 1))
}

/**
 * Difficulty to attempt next in a system, from its average score. Free
 * accounts train at Foundations only — the trainer enforces this, so
 * recommendations must never point at a tier the user can't launch.
 */
export function recommendedTier(score: number, isPro: boolean): Tier {
  if (!isPro) return 'Foundations'
  return score < 60 ? 'Foundations' : score < 80 ? 'Clinical' : 'Advanced'
}

export interface NextCaseRec {
  system: string
  tier: Tier
  reason: string
  /** False only for the brand-new-account default. */
  fromData: boolean
}

/** Top recommendation: most urgent non-skipped system, tier-gated. */
export function recommendNextCase(
  systems: SystemEntry[],
  isPro: boolean,
  skips: FocusSkips = {},
): NextCaseRec {
  const ranked = systems
    .filter(s => s.count > 0 && !isSkipped(s.name, skips))
    .sort((a, b) => urgencyOf(b) - urgencyOf(a))
  if (ranked.length === 0) {
    return { system: 'Cardiovascular', tier: 'Foundations', reason: 'A great place to start.', fromData: false }
  }
  const w = ranked[0]
  return {
    system: w.name,
    tier: recommendedTier(w.score, isPro),
    reason: `Your ${w.name} avg is ${w.score} across ${w.count} case${w.count === 1 ? '' : 's'}.`,
    fromData: true,
  }
}

/**
 * Differential-reasoning engine.
 *
 * A deliberately simple, transparent "teaching model" of how evidence updates a
 * clinician's differential. Each ordered test's result applies a multiplicative
 * likelihood factor to each differential (naive-Bayes style), then we renormalize.
 * These are pedagogical likelihoods, NOT literal published likelihood ratios —
 * the goal is to make "this result makes X more/less likely" visible and intuitive.
 */
import type {
  BeliefState,
  DifferentialPrior,
  TestEffect,
  TestImpactEntry,
  TestImpacts,
} from './types'

/** Multiplicative likelihood factor applied per test result, by effect. */
export const EFFECT_MULTIPLIER: Record<TestEffect, number> = {
  confirms: 8,
  supports: 2.2,
  neutral: 1,
  'argues-against': 0.4,
  excludes: 0.02,
}

/** Human-facing label + arrow for an effect, for the differential board. */
export const EFFECT_LABEL: Record<TestEffect, { arrow: string; label: string }> = {
  confirms: { arrow: '↑↑', label: 'confirms' },
  supports: { arrow: '↑', label: 'more likely' },
  neutral: { arrow: '→', label: 'no change' },
  'argues-against': { arrow: '↓', label: 'less likely' },
  excludes: { arrow: '✗', label: 'excluded' },
}

/** Normalize arbitrary prior weights into a probability distribution. */
export function normalizePriors(priors: DifferentialPrior[]): BeliefState[] {
  if (priors.length === 0) return []
  const weights = priors.map(p => Math.max(p.prior, 0))
  const total = weights.reduce((s, w) => s + w, 0)
  if (total <= 0) {
    const u = 1 / priors.length
    return priors.map(p => ({ name: p.name, probability: u, category: p.category }))
  }
  return priors.map((p, i) => ({ name: p.name, probability: weights[i] / total, category: p.category }))
}

/** Apply one test's per-differential impacts to a belief state and renormalize. */
export function applyTestResult(
  beliefs: BeliefState[],
  impacts: Record<string, TestImpactEntry>,
): BeliefState[] {
  const updated = beliefs.map(b => {
    const effect = impacts[b.name]?.effect ?? 'neutral'
    return { ...b, probability: b.probability * EFFECT_MULTIPLIER[effect] }
  })
  const total = updated.reduce((s, b) => s + b.probability, 0)
  // If every differential collapsed to ~0 (shouldn't happen in a well-formed case),
  // keep the prior distribution rather than dividing by zero.
  if (total <= 0) return beliefs
  return updated.map(b => ({ ...b, probability: b.probability / total }))
}

/** Belief state after ordering a sequence of tests, applied in order. */
export function computeBeliefs(
  priors: DifferentialPrior[],
  testImpacts: TestImpacts,
  orderedTests: string[],
): BeliefState[] {
  let beliefs = normalizePriors(priors)
  for (const test of orderedTests) {
    const impacts = testImpacts[test]
    if (impacts) beliefs = applyTestResult(beliefs, impacts)
  }
  return [...beliefs].sort((a, b) => b.probability - a.probability)
}

/** Shannon entropy (bits) of a belief distribution — our uncertainty measure. */
export function entropy(beliefs: BeliefState[]): number {
  return -beliefs.reduce(
    (s, b) => s + (b.probability > 0 ? b.probability * Math.log2(b.probability) : 0),
    0,
  )
}

/**
 * How much THIS test's result reduces uncertainty given the current beliefs.
 * Results are deterministic per case, so this is the realized (not expected)
 * entropy drop — a good proxy for "how discriminating was ordering this test".
 */
export function discriminatingValue(
  beliefs: BeliefState[],
  impacts: Record<string, TestImpactEntry>,
): number {
  const before = entropy(beliefs)
  const after = entropy(applyTestResult(beliefs, impacts))
  return Math.max(0, before - after)
}

/** Rank not-yet-ordered tests by how much they would sharpen the differential now. */
export function rankTestsByValue(
  beliefs: BeliefState[],
  testImpacts: TestImpacts,
  alreadyOrdered: string[],
): Array<{ test: string; value: number }> {
  const ordered = new Set(alreadyOrdered)
  return Object.keys(testImpacts)
    .filter(t => !ordered.has(t))
    .map(t => ({ test: t, value: discriminatingValue(beliefs, testImpacts[t]) }))
    .sort((a, b) => b.value - a.value)
}

/**
 * The single highest-value test the student could order next (for coaching).
 * Returns null if nothing meaningfully reduces uncertainty.
 */
export function bestNextTest(
  beliefs: BeliefState[],
  testImpacts: TestImpacts,
  alreadyOrdered: string[],
): { test: string; value: number } | null {
  const ranked = rankTestsByValue(beliefs, testImpacts, alreadyOrdered)
  return ranked.length > 0 && ranked[0].value > 0.01 ? ranked[0] : null
}

/**
 * Authoritative, human-readable evidence-based differential ranking for the AI
 * grader — so the grader's differential discussion stays consistent with the
 * board the student saw (they must not contradict each other). Notes the
 * confirm/exclude effect of each test the student actually ordered.
 */
export function formatEvidenceSummary(
  priors: DifferentialPrior[],
  testImpacts: TestImpacts,
  orderedTests: string[],
): string {
  if (!priors?.length) return ''
  const beliefs = computeBeliefs(priors, testImpacts, orderedTests)
  return beliefs
    .map((b, i) => {
      const decisive: string[] = []
      for (const test of orderedTests) {
        const effect = testImpacts[test]?.[b.name]?.effect
        if (effect === 'confirms') decisive.push(`confirmed by ${test}`)
        else if (effect === 'excludes') decisive.push(`excluded by ${test}`)
      }
      const pct = Math.round(b.probability * 100)
      const note = decisive.length ? ` — ${decisive.join('; ')}` : ''
      return `${i + 1}. ${b.name} (${pct}%)${note}`
    })
    .join('\n')
}

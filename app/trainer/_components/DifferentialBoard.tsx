'use client'

import { useMemo, useState } from 'react'
import type { DifferentialPrior, TestImpacts } from '../../lib/reasoning/types'
import { computeBeliefs, bestNextTest } from '../../lib/reasoning/differential'

/**
 * Qualitative band for a probability. The priors/impacts are LLM-authored
 * teaching values, not published likelihood ratios — exact percentages imply
 * false precision, so the reveal shows direction-strength bands by default
 * and puts the raw numbers behind a toggle.
 */
function probabilityBand(p: number): { arrow: string; label: string } {
  if (p >= 0.6) return { arrow: '↑↑', label: 'strongly favored' }
  if (p >= 0.25) return { arrow: '↑', label: 'favored' }
  if (p >= 0.05) return { arrow: '—', label: 'possible' }
  return { arrow: '↓', label: 'unlikely' }
}

/**
 * Live "differential board": as the student orders tests, each result shifts the
 * probability of every tracked hypothesis (naive-Bayes teaching model). Renders
 * nothing for legacy cases that lack differentialPriors, so it degrades safely.
 */
export function DifferentialBoard({
  priors,
  testImpacts,
  orderedTests,
  correctDiagnosis,
  caseDifficulty,
  reveal = false,
  showHint = true,
}: {
  priors?: DifferentialPrior[]
  testImpacts?: TestImpacts
  orderedTests: string[]
  /** Only used once `reveal` is true (after submission) to mark the answer. */
  correctDiagnosis?: string
  caseDifficulty: string
  reveal?: boolean
  showHint?: boolean
}) {
  const impacts = testImpacts ?? {}

  // ANTI-CUEING GUARD: the live-updating board (and its bestNextTest hint)
  // shows the candidate differential ranking while the case is still being
  // worked — that is acceptable ONLY as Foundations training wheels. At
  // Clinical/Advanced it would cue the answer and defeat the difficulty
  // gating, so live mode is hard-blocked here regardless of what a caller
  // passes; the reveal (post-grading) mode remains available everywhere.
  const liveBlocked = !reveal && caseDifficulty !== 'Foundations'

  // Post-grading reveal defaults to qualitative bands (anti-false-precision);
  // the live Foundations board keeps numbers (they drive the teaching loop).
  const [showNumbers, setShowNumbers] = useState(false)
  const numeric = !reveal || showNumbers

  const beliefs = useMemo(
    () => (priors?.length ? computeBeliefs(priors, impacts, orderedTests) : []),
    [priors, impacts, orderedTests],
  )

  const hint = useMemo(
    () => (showHint && !reveal && beliefs.length ? bestNextTest(beliefs, impacts, orderedTests) : null),
    [showHint, reveal, beliefs, impacts, orderedTests],
  )

  const appliedCount = useMemo(
    () => orderedTests.filter(t => impacts[t]).length,
    [orderedTests, impacts],
  )

  if (liveBlocked || !beliefs.length) return null

  return (
    <div className="rounded-md border border-surface-4 bg-surface-1 p-3" role="group" aria-label="Differential probabilities">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
          Differential
        </span>
        <div className="flex items-center gap-2">
          {reveal && (
            <button
              onClick={() => setShowNumbers(v => !v)}
              className="text-[10px] text-ink-tertiary underline decoration-dotted hover:text-ink-secondary transition-colors"
              title="Percentages are model teaching values, not published likelihood ratios"
            >
              {showNumbers ? 'hide numbers' : 'show numbers'}
            </button>
          )}
          <span className="text-[10px] text-ink-tertiary">
            {appliedCount === 0 ? 'pre-test' : `${appliedCount} result${appliedCount === 1 ? '' : 's'} in`}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {beliefs.map(b => {
          const pct = Math.round(b.probability * 100)
          const excluded = b.probability < 0.005
          const isAnswer = reveal && correctDiagnosis && b.name === correctDiagnosis
          return (
            <div key={b.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span
                  className={
                    excluded
                      ? 'text-ink-tertiary line-through'
                      : isAnswer
                        ? 'font-semibold text-emerald-400'
                        : 'text-ink-secondary'
                  }
                >
                  {b.name}
                  {b.category === 'cant-miss' && !excluded && (
                    <span className="ml-1 text-[9px] uppercase text-amber-400" title="Can't-miss diagnosis">
                      ⚠ can&apos;t-miss
                    </span>
                  )}
                  {isAnswer && <span className="ml-1 text-[9px] uppercase">✓ answer</span>}
                </span>
                <span className="font-mono tabular-nums text-ink-tertiary">
                  {excluded
                    ? '✗'
                    : numeric
                      ? `${pct}%`
                      : `${probabilityBand(b.probability).arrow} ${probabilityBand(b.probability).label}`}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                role="progressbar"
                aria-valuenow={excluded ? 0 : pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${b.name}: ${excluded ? 'excluded' : `${pct}%`}`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(excluded ? 0 : 2, pct)}%`,
                    background: isAnswer ? 'var(--green, #34d399)' : 'var(--color-primary-500, #6366f1)',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {hint && hint.value > 0.05 && (
        <p className="mt-2 text-[10px] leading-snug text-ink-tertiary">
          💡 Most informative next test: <span className="text-ink-secondary">{hint.test}</span>
        </p>
      )}
    </div>
  )
}

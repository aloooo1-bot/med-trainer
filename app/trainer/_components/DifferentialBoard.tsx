'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

const EXCLUDED_BELOW = 0.005
/** Probability change below this is noise — no delta badge. */
const DELTA_EPSILON = 0.01
/** How long a change stays highlighted after a result lands. */
const DELTA_LINGER_MS = 2800
const REORDER_MS = 480

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Live "differential board": as the student orders tests, each result shifts the
 * probability of every tracked hypothesis (naive-Bayes teaching model). Renders
 * nothing for legacy cases that lack differentialPriors, so it degrades safely.
 *
 * Motion is the teaching point, not decoration: when a result lands the rows
 * physically re-rank (FLIP), the size of each swing is called out, and a
 * hypothesis being ruled out gets a visible moment. Watching the differential
 * reorganize is what makes Bayesian updating legible — so it is animated
 * deliberately, and fully disabled under prefers-reduced-motion.
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
  // Memoized: an unstable `{}` fallback identity would recompute `beliefs` on
  // every render, and the motion effects below key on that array's identity.
  const impacts = useMemo(() => testImpacts ?? {}, [testImpacts])

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

  // ── Motion state ────────────────────────────────────────────────────────────
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const prevTops = useRef(new Map<string, number>())
  const prevProbs = useRef(new Map<string, number>())
  const [deltas, setDeltas] = useState<Record<string, number>>({})
  const [justExcluded, setJustExcluded] = useState<Set<string>>(new Set())

  // FLIP: rows slide from their previous rank to the new one so a re-ranking
  // reads as movement rather than a jump-cut. Uses the Web Animations API
  // rather than rAF + inline transitions — WAAPI never strands a transform on
  // the element if the frame loop is paused (hidden tab) or the row unmounts
  // mid-flight, and it needs no cleanup pass.
  useLayoutEffect(() => {
    const nextTops = new Map<string, number>()
    rowRefs.current.forEach((el, name) => nextTops.set(name, el.offsetTop))
    if (!prefersReducedMotion()) {
      nextTops.forEach((top, name) => {
        const prev = prevTops.current.get(name)
        const el = rowRefs.current.get(name)
        if (prev == null || !el || Math.abs(prev - top) < 1) return
        el.animate?.(
          [{ transform: `translateY(${prev - top}px)` }, { transform: 'translateY(0)' }],
          { duration: REORDER_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
        )
      })
    }
    prevTops.current = nextTops
  }, [beliefs])

  // Track how far each hypothesis moved on this update, and which ones were
  // just ruled out. Skipped on first paint so the pre-test board is quiet.
  useEffect(() => {
    const seeded = prevProbs.current.size > 0
    const nextDeltas: Record<string, number> = {}
    const newlyExcluded = new Set<string>()
    for (const b of beliefs) {
      const prev = prevProbs.current.get(b.name)
      if (seeded && prev != null) {
        if (Math.abs(b.probability - prev) >= DELTA_EPSILON) nextDeltas[b.name] = b.probability - prev
        if (prev >= EXCLUDED_BELOW && b.probability < EXCLUDED_BELOW) newlyExcluded.add(b.name)
      }
      prevProbs.current.set(b.name, b.probability)
    }
    if (!seeded || (!Object.keys(nextDeltas).length && !newlyExcluded.size)) return
    setDeltas(nextDeltas)
    setJustExcluded(newlyExcluded)
    const t = setTimeout(() => { setDeltas({}); setJustExcluded(new Set()) }, DELTA_LINGER_MS)
    return () => clearTimeout(t)
  }, [beliefs])

  if (liveBlocked || !beliefs.length) return null

  const leader = beliefs[0]?.name

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

      {/* aria-live so the re-ranking is announced, not just shown */}
      <div className="flex flex-col gap-2" aria-live="polite">
        {beliefs.map(b => {
          const pct = Math.round(b.probability * 100)
          const excluded = b.probability < EXCLUDED_BELOW
          const isAnswer = reveal && correctDiagnosis && b.name === correctDiagnosis
          const delta = deltas[b.name]
          const rising = delta != null && delta > 0
          const dropping = delta != null && delta < 0
          const wasJustExcluded = justExcluded.has(b.name)
          const isLeader = b.name === leader && !excluded

          const barColor = isAnswer
            ? 'var(--color-confirmed)'
            : b.category === 'cant-miss'
              ? 'var(--color-caution)'
              : isLeader
                ? 'var(--color-primary-400)'
                : 'var(--color-primary-200)'

          return (
            <div
              key={b.name}
              ref={el => {
                if (el) rowRefs.current.set(b.name, el)
                else rowRefs.current.delete(b.name)
              }}
              className={[
                'flex flex-col gap-1 rounded-sm px-1 -mx-1 transition-colors duration-700',
                wasJustExcluded ? 'bg-critical/10' : rising ? 'bg-confirmed/10' : '',
                excluded ? 'opacity-55' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span
                  className={
                    excluded
                      ? 'text-ink-tertiary line-through'
                      : isAnswer
                        ? 'font-semibold text-confirmed'
                        : isLeader
                          ? 'font-semibold text-ink-primary'
                          : 'text-ink-secondary'
                  }
                >
                  {b.name}
                  {b.category === 'cant-miss' && !excluded && (
                    <span className="ml-1 text-[9px] uppercase text-caution" title="Can't-miss diagnosis">
                      ⚠ can&apos;t-miss
                    </span>
                  )}
                  {isAnswer && <span className="ml-1 text-[9px] uppercase">✓ answer</span>}
                  {wasJustExcluded && (
                    <span className="ml-1 text-[9px] uppercase text-critical">ruled out</span>
                  )}
                </span>

                <span className="flex items-center gap-1.5">
                  {delta != null && !wasJustExcluded && (
                    <span
                      className={`font-mono text-[9px] tabular-nums ${rising ? 'text-confirmed' : 'text-ink-tertiary'}`}
                      title={`${rising ? 'Rose' : 'Fell'} ${Math.abs(Math.round(delta * 100))} points on the last result`}
                    >
                      {rising ? '▲' : dropping ? '▼' : ''}{Math.abs(Math.round(delta * 100))}
                    </span>
                  )}
                  <span className="font-mono tabular-nums text-ink-tertiary">
                    {excluded
                      ? '✗'
                      : numeric
                        ? `${pct}%`
                        : `${probabilityBand(b.probability).arrow} ${probabilityBand(b.probability).label}`}
                  </span>
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
                  className="h-full rounded-full motion-safe:transition-[width,background-color] motion-safe:duration-500 motion-safe:ease-out"
                  style={{ width: `${Math.max(excluded ? 0 : 2, pct)}%`, background: barColor }}
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

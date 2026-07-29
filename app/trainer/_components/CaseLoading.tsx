'use client'

import { useEffect, useState } from 'react'
import { loadingStage, isGenerating } from '../_lib/loadingStage'

/**
 * The wait before a case opens.
 *
 * Two very different waits hide behind one flag. A cached case resolves in
 * ~150-400ms; only an uncached system x difficulty x diagnosis slot triggers a
 * live generation, which can run tens of seconds. The previous UI showed the
 * full spinner + phase list + progress pips for both, so the common path
 * flashed a loading screen that vanished before it could be read, and the slow
 * path advanced through invented phases on a 3s timer regardless of what the
 * server was actually doing.
 *
 * This reveals progressively by elapsed time instead:
 *   <450ms   nothing at all — a cache hit should feel instant
 *   <4s      a quiet spinner, no claims
 *   >=4s     it is a genuine generation; say so and use the time
 *   >=25s    acknowledge the wait rather than pretending it is normal
 *
 * Nothing here is a fake progress bar: a percentage we cannot measure is worse
 * than no percentage at all.
 */

const TIP_ROTATE_MS = 7000

/**
 * Priming prompts for the wait. Each is true of this app's actual rubric, so
 * the dead time teaches the scoring model rather than filling space.
 */
const TIPS = [
  'Commit to a leading diagnosis before you order anything — your calibration is scored, not just your answer.',
  'Ask at the domain level: “any medical conditions?” surfaces more than working down a checklist.',
  'The pivotal test is the one that separates your diagnosis from its most dangerous mimic.',
  'Extra appropriate tests are not penalised — missing the confirmatory one is.',
  'Being wrong at an honest 50% beats being wrong at 95%. Confidence is part of the skill.',
]

export function CaseLoading({ system, difficulty }: { system?: string; difficulty?: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    // 250ms cadence: fine enough for the stage thresholds, coarse enough to
    // cost nothing while a heavy generation is in flight.
    const id = setInterval(() => setElapsed(Date.now() - start), 250)
    return () => clearInterval(id)
  }, [])

  const stage = loadingStage(elapsed)
  if (stage === 'quiet') return null

  const generating = isGenerating(stage)
  const longWait = stage === 'long'
  const tip = TIPS[Math.floor(elapsed / TIP_ROTATE_MS) % TIPS.length]
  const label = [difficulty?.toLowerCase(), system && system !== 'Any' ? system : null]
    .filter(Boolean).join(' ')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-surface-4 border-t-primary-400" />

      <div className="text-center">
        <p className="text-sm font-medium text-ink-primary">
          {generating ? 'Writing a fresh case' : 'Preparing your case'}
          {label ? <span className="text-ink-secondary"> · {label}</span> : null}
        </p>
        {generating && (
          <p className="mt-1 text-[11px] text-ink-tertiary">
            {longWait
              ? 'Still working — this one is taking longer than usual. It will open as soon as it is ready.'
              : 'This case is being written now rather than pulled from the library, so it takes a moment.'}
          </p>
        )}
      </div>

      {/* The wait is only filled once we know it is a real wait. */}
      {generating && (
        <div
          key={tip}
          className="animate-fade-in max-w-sm rounded-md border border-surface-4 bg-surface-1 px-4 py-3 text-center"
          aria-live="polite"
        >
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[.08em] text-ink-tertiary">
            While you wait
          </div>
          <p className="text-[12px] leading-relaxed text-ink-secondary">{tip}</p>
        </div>
      )}
    </div>
  )
}

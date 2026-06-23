'use client'

import { useState } from 'react'

const CONFIDENCE_PRESETS = [50, 65, 80, 95]

/**
 * Pre-test commitment: the student ranks the candidate diagnoses from most- to
 * least-likely AND states confidence in their top pick, BEFORE ordering tests.
 * The scorecard compares the ranking to the evidence; the Progress page tracks
 * confidence vs. actual accuracy (Brier calibration). Renders nothing for legacy
 * cases that lack a tracked differential.
 */
export function PredictionPanel({
  candidates,
  prediction,
  confidence,
  onLock,
}: {
  candidates: string[]
  /** Locked ranking, or null while still ranking. */
  prediction: string[] | null
  /** Locked confidence in the top pick (0-1), for the read-only display. */
  confidence?: number | null
  onLock: (ranking: string[], confidence: number) => void
}) {
  const [ranking, setRanking] = useState<string[]>([])
  const [conf, setConf] = useState<number | null>(null)

  if (!candidates || candidates.length < 2) return null

  // Locked → compact read-only summary.
  if (prediction) {
    return (
      <div className="rounded-md border border-surface-4 bg-surface-1 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Your pre-test read (locked)</div>
        <ol className="flex flex-col gap-1">
          {prediction.map((name, i) => (
            <li key={name} className="flex items-center gap-2 text-[12px] text-ink-secondary">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px]">{i + 1}</span>
              {name}
            </li>
          ))}
        </ol>
        {confidence != null && (
          <p className="mt-2 text-[11px] text-ink-tertiary">Confidence in top pick: <span className="text-ink-secondary font-semibold">{Math.round(confidence * 100)}%</span></p>
        )}
      </div>
    )
  }

  const toggle = (name: string) =>
    setRanking(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))

  const allRanked = ranking.length === candidates.length
  const canLock = allRanked && conf != null

  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--amber, #f59e0b)' }}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--amber, #f59e0b)' }}>
        Commit your differential first
      </div>
      <p className="mb-2.5 text-[11px] leading-snug text-ink-tertiary">
        Rank these from most to least likely <em>before</em> ordering tests, then state your confidence. You&apos;ll see how your read held up against the evidence.
      </p>
      <div className="flex flex-col gap-1.5">
        {candidates.map(name => {
          const rank = ranking.indexOf(name)
          const ranked = rank !== -1
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                ranked ? 'border-primary-500 text-ink-primary' : 'border-surface-3 text-ink-secondary hover:border-surface-4'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${
                  ranked ? 'bg-primary-500 text-ink-inverse' : 'bg-surface-3 text-ink-tertiary'
                }`}
              >
                {ranked ? rank + 1 : '+'}
              </span>
              {name}
            </button>
          )
        })}
      </div>

      {allRanked && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] text-ink-tertiary">
            How confident are you in <span className="text-ink-secondary font-semibold">{ranking[0]}</span>?
          </div>
          <div className="flex gap-1.5">
            {CONFIDENCE_PRESETS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setConf(p)}
                aria-pressed={conf === p}
                className={`flex-1 rounded border px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                  conf === p ? 'border-primary-500 bg-primary-500 text-ink-inverse' : 'border-surface-3 text-ink-secondary hover:border-surface-4'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => { setRanking([]); setConf(null) }} className="text-[11px] text-ink-tertiary hover:text-ink-secondary">
          Clear
        </button>
        <button
          type="button"
          disabled={!canLock}
          onClick={() => onLock(ranking, (conf ?? 0) / 100)}
          className={`rounded px-3 py-1 text-[12px] font-semibold transition-colors ${
            canLock ? 'bg-primary-500 text-ink-inverse hover:bg-primary-400' : 'cursor-not-allowed bg-surface-3 text-ink-tertiary'
          }`}
        >
          Lock in
        </button>
      </div>
    </div>
  )
}

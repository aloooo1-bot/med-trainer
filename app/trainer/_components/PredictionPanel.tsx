'use client'

import { useState } from 'react'

/**
 * Pre-test commitment: the student ranks the candidate diagnoses from most- to
 * least-likely BEFORE ordering any tests. After the workup the scorecard compares
 * this ranking against the evidence-based order (calibration training). Renders
 * nothing for legacy cases that lack a tracked differential.
 */
export function PredictionPanel({
  candidates,
  prediction,
  onLock,
}: {
  candidates: string[]
  /** Locked ranking, or null while still ranking. */
  prediction: string[] | null
  onLock: (ranking: string[]) => void
}) {
  const [ranking, setRanking] = useState<string[]>([])

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
      </div>
    )
  }

  const toggle = (name: string) =>
    setRanking(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))

  const allRanked = ranking.length === candidates.length

  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--amber, #f59e0b)' }}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--amber, #f59e0b)' }}>
        Commit your differential first
      </div>
      <p className="mb-2.5 text-[11px] leading-snug text-ink-tertiary">
        Rank these from most to least likely <em>before</em> ordering tests. You&apos;ll see how your read held up against the evidence.
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
      <div className="mt-2.5 flex items-center justify-between">
        <button type="button" onClick={() => setRanking([])} className="text-[11px] text-ink-tertiary hover:text-ink-secondary">
          Clear
        </button>
        <button
          type="button"
          disabled={!allRanked}
          onClick={() => onLock(ranking)}
          className={`rounded px-3 py-1 text-[12px] font-semibold transition-colors ${
            allRanked ? 'bg-primary-500 text-ink-inverse hover:bg-primary-400' : 'cursor-not-allowed bg-surface-3 text-ink-tertiary'
          }`}
        >
          Lock in
        </button>
      </div>
    </div>
  )
}

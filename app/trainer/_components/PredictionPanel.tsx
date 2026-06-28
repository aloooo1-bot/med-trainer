'use client'

import { useState } from 'react'

const CONFIDENCE_PRESETS = [50, 65, 80, 95]

/**
 * Pre-test commitment, BEFORE ordering any tests.
 *
 * - Foundations (open=false): "training wheels" — the candidate diagnoses are
 *   shown and the student ranks them + states confidence. Recognition practice.
 * - Clinical/Advanced (open=true): the candidate list is hidden to avoid cueing
 *   the answer. The student GENERATES their own leading diagnosis (free text) +
 *   confidence. The differential is revealed only afterward, as scorecard feedback.
 *
 * Renders nothing for legacy cases that lack a tracked differential.
 */
export function PredictionPanel({
  candidates,
  open = false,
  prediction,
  confidence,
  onLock,
}: {
  candidates: string[]
  open?: boolean
  /** Locked prediction (ranked names, or [leadingDx] in open mode), or null while editing. */
  prediction: string[] | null
  confidence?: number | null
  onLock: (ranking: string[], confidence: number) => void
}) {
  const [ranking, setRanking] = useState<string[]>([])
  const [leadingDx, setLeadingDx] = useState('')
  const [conf, setConf] = useState<number | null>(null)

  if (!candidates || candidates.length < 2) return null

  // Locked → compact read-only summary.
  if (prediction) {
    return (
      <div className="rounded-md border border-surface-4 bg-surface-1 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Your pre-test read (locked)</div>
        {open ? (
          <p className="text-[12px] text-ink-secondary">Leading diagnosis: <span className="font-semibold text-ink-primary">{prediction[0]}</span></p>
        ) : (
          <ol className="flex flex-col gap-1">
            {prediction.map((name, i) => (
              <li key={name} className="flex items-center gap-2 text-[12px] text-ink-secondary">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px]">{i + 1}</span>
                {name}
              </li>
            ))}
          </ol>
        )}
        {confidence != null && (
          <p className="mt-2 text-[11px] text-ink-tertiary">Confidence: <span className="text-ink-secondary font-semibold">{Math.round(confidence * 100)}%</span></p>
        )}
      </div>
    )
  }

  const toggle = (name: string) =>
    setRanking(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))

  const ready = open ? leadingDx.trim().length > 1 : ranking.length === candidates.length
  const canLock = ready && conf != null

  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--amber, #f59e0b)' }}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--amber, #f59e0b)' }}>
        Commit your {open ? 'leading diagnosis' : 'differential'} first
      </div>
      <p className="mb-2.5 text-[11px] leading-snug text-ink-tertiary">
        {open
          ? <>From the presentation alone, what&apos;s your leading diagnosis — <em>before</em> ordering tests? The full differential is revealed afterward.</>
          : <>Rank these from most to least likely <em>before</em> ordering tests, then state your confidence.</>}
      </p>

      {open ? (
        <input
          type="text"
          value={leadingDx}
          onChange={e => setLeadingDx(e.target.value)}
          placeholder="Your leading diagnosis…"
          aria-label="Your leading diagnosis"
          className="w-full rounded border border-surface-3 bg-surface-0 px-2.5 py-1.5 text-[12px] text-ink-primary placeholder-ink-tertiary focus:border-primary-500 focus:outline-none"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {candidates.map(name => {
            const rank = ranking.indexOf(name)
            const ranked = rank !== -1
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                aria-pressed={ranked}
                aria-label={ranked ? `${name}, ranked ${rank + 1} — click to remove` : `Rank ${name}`}
                className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                  ranked ? 'border-primary-500 text-ink-primary' : 'border-surface-3 text-ink-secondary hover:border-surface-4'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${ranked ? 'bg-primary-500 text-ink-inverse' : 'bg-surface-3 text-ink-tertiary'}`}>
                  {ranked ? rank + 1 : '+'}
                </span>
                {name}
              </button>
            )
          })}
        </div>
      )}

      {ready && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] text-ink-tertiary">
            How confident are you{open ? '' : <> in <span className="text-ink-secondary font-semibold">{ranking[0]}</span></>}?
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
        <button type="button" onClick={() => { setRanking([]); setLeadingDx(''); setConf(null) }} className="text-[11px] text-ink-tertiary hover:text-ink-secondary">
          Clear
        </button>
        <button
          type="button"
          disabled={!canLock}
          onClick={() => onLock(open ? [leadingDx.trim()] : ranking, (conf ?? 0) / 100)}
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

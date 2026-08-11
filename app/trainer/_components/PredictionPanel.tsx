'use client'

import { useState, useEffect } from 'react'

/**
 * Confidence presets carry a plain-language gloss. A student asked for a bare
 * percentage tends to pick a comfortable-looking number; naming what each level
 * COMMITS them to is the actual calibration training, and it makes the later
 * "confident and wrong" verdict land as something they chose rather than
 * something the app decided.
 */
const CONFIDENCE_PRESETS: { value: number; gloss: string }[] = [
  { value: 50, gloss: 'a coin flip' },
  { value: 65, gloss: 'leaning that way' },
  { value: 80, gloss: 'fairly sure' },
  { value: 95, gloss: "I'd be surprised to be wrong" },
]

/**
 * Pre-test read, BEFORE ordering any tests. Optional — nothing gates on it —
 * but committing is what powers calibration tracking, so the panel nudges and
 * offers an explicit skip instead of pretending to be a gate.
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
  suggestedLeading,
  onLock,
}: {
  candidates: string[]
  open?: boolean
  /** Locked prediction (ranked names, or [leadingDx] in open mode), or null while editing. */
  prediction: string[] | null
  confidence?: number | null
  /** Top of the student's working differential — prefills the open-mode input. */
  suggestedLeading?: string
  onLock: (ranking: string[], confidence: number) => void
}) {
  const [ranking, setRanking] = useState<string[]>([])
  const [leadingDx, setLeadingDx] = useState('')
  const [conf, setConf] = useState<number | null>(null)
  const [skipped, setSkipped] = useState(false)

  // Open-mode prefill: adopt the working differential's top entry while the
  // student hasn't typed anything of their own. Editable like any input text.
  useEffect(() => {
    // Prop→state sync on external change only; guarded so it never loops.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && suggestedLeading && leadingDx === '') setLeadingDx(suggestedLeading)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedLeading, open])

  // Ranked mode needs a candidate list; open (free-text) mode does not —
  // gated difficulties deliberately never receive candidates (anti-cueing).
  if (!open && (!candidates || candidates.length < 2)) return null

  // Locked → a sealed record. Deliberately styled as something committed and
  // no longer editable, rather than a collapsed version of the form: the
  // commitment only means anything if it visibly cannot be walked back.
  if (prediction) {
    return (
      <div className="animate-result-in rounded-md border-2 border-dashed border-surface-4 bg-surface-1 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8,11 V7 a4,4 0 0 1 8,0 v4" />
          </svg>
          Pre-test read — locked
        </div>
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

  // Skipped → a quiet one-line chip; reopenable until the student locks or grades.
  if (skipped) {
    return (
      <button
        type="button"
        onClick={() => setSkipped(false)}
        className="flex w-full items-center justify-between rounded-md border border-surface-3 bg-surface-1 px-3 py-2 text-left text-[11px] text-ink-tertiary hover:border-surface-4 hover:text-ink-secondary"
      >
        <span>Pre-test read skipped — no calibration tracking for this case</span>
        <span className="font-semibold text-primary-500">Reopen</span>
      </button>
    )
  }

  const toggle = (name: string) =>
    setRanking(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))

  const ready = open ? leadingDx.trim().length > 1 : ranking.length === candidates.length
  const canLock = ready && conf != null

  return (
    <div className="rounded-md border border-surface-3 p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
          Pre-test read <span className="font-normal normal-case text-ink-tertiary">— optional</span>
        </span>
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="text-[11px] text-ink-tertiary underline-offset-2 hover:text-ink-secondary hover:underline"
        >
          Skip — order tests directly
        </button>
      </div>
      <p className="mb-2.5 text-[11px] leading-snug text-ink-tertiary">
        {open
          ? <>From the presentation alone, what&apos;s your leading diagnosis? Committing <em>before</em> tests is what trains calibration — the full differential is revealed afterward.</>
          : <>Rank these from most to least likely and state your confidence. Committing <em>before</em> tests is what trains calibration.</>}
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
                key={p.value}
                type="button"
                onClick={() => setConf(p.value)}
                aria-pressed={conf === p.value}
                aria-label={`${p.value} percent — ${p.gloss}`}
                title={p.gloss}
                className={`flex-1 rounded border px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                  conf === p.value ? 'border-primary-500 bg-primary-500 text-ink-inverse' : 'border-surface-3 text-ink-secondary hover:border-surface-4'
                }`}
              >
                {p.value}%
              </button>
            ))}
          </div>
          {/* Reserve the row so picking a level doesn't shift the Lock button. */}
          <div className="mt-1.5 text-[10.5px] italic text-ink-tertiary" style={{ minHeight: 14 }}>
            {conf != null ? CONFIDENCE_PRESETS.find(p => p.value === conf)?.gloss : ''}
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

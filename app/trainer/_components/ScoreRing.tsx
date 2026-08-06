import { useEffect, useState } from 'react'

const SWEEP_MS = 900

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * The end-of-case verdict. The ring sweeps from empty to the final score and
 * the number counts up with it, so the result lands as an event rather than
 * appearing pre-filled — this is the payoff moment of the whole case.
 *
 * The accessible name always carries the FINAL score, so assistive tech never
 * reads a mid-tween value. Reduced motion renders the final state outright.
 */
export function ScoreRing({ score }: { score: number }) {
  const r = 68
  const circ = 2 * Math.PI * r
  const target = Math.max(0, Math.min(100, score))
  const strokeColor = score >= 75 ? 'var(--color-confirmed)' : score >= 60 ? 'var(--color-caution)' : 'var(--color-critical)'

  // Start empty (also the SSR state, so hydration always matches), then sweep
  // once mounted. Every state update happens inside a timer callback rather
  // than the effect body, so this never triggers a cascading render.
  const [swept, setSwept] = useState(false)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const reduce = prefersReducedMotion()
    const dur = reduce ? 0 : SWEEP_MS
    // Flip on the next tick so the browser paints the empty ring first and the
    // CSS transition actually runs.
    const kick = setTimeout(() => setSwept(true), reduce ? 0 : 30)
    // Count up alongside the sweep. setInterval (not rAF) so a backgrounded
    // tab still settles on the final value instead of freezing mid-count.
    const start = Date.now()
    const id = setInterval(() => {
      const t = dur === 0 ? 1 : Math.min(1, (Date.now() - start) / dur)
      // easeOutCubic — fast start, gentle settle, matching the ring easing
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t >= 1) clearInterval(id)
    }, 16)
    return () => { clearTimeout(kick); clearInterval(id) }
  }, [target])

  return (
    <svg width="160" height="160" role="img" aria-label={`Score: ${score} of 100`} className="block">
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="8" />
      <circle
        cx="80" cy="80" r={r} fill="none"
        className="score-ring-sweep"
        style={{ stroke: strokeColor }}
        strokeWidth="8"
        strokeDasharray={`${circ}`}
        strokeDashoffset={swept ? circ * (1 - target / 100) : circ}
        strokeLinecap="round" transform="rotate(-90 80 80)"
      />
      <text x="80" y="86" textAnchor="middle" aria-hidden="true"
        style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 48, fontWeight: 500, fill: 'var(--color-ink-primary)' }}>
        {shown}
      </text>
      <text x="80" y="106" textAnchor="middle" aria-hidden="true"
        style={{ fontSize: 12, fill: 'var(--color-ink-tertiary)', letterSpacing: '0.05em' }}>/ 100</text>
    </svg>
  )
}

export function CategoryRow({
  label, dim, max, pct, expanded, onToggle, index = 0, average,
}: {
  label: string
  dim: { score: number; feedback: string; deductions?: Array<{ points: number; reason: string }> }
  max: number
  pct: number
  expanded: boolean
  onToggle: () => void
  /** Position in the scorecard — cascades each row in after the ring sweep. */
  index?: number
  /** This student's own mean on this dimension, rescaled to `max`. */
  average?: { score: number; n: number } | null
}) {
  // The authoritative gap, from the score itself. Shown even when the model's
  // itemisation disagrees with it, so the header never misstates the loss.
  const lost = Math.max(0, max - dim.score)
  const deductions = dim.deductions ?? []
  const barColor = pct >= 75 ? 'bg-confirmed' : pct >= 60 ? 'bg-caution' : 'bg-critical'
  const scoreColor = pct >= 75 ? 'text-confirmed' : pct >= 60 ? 'text-caution' : 'text-critical'
  const panelId = `sc-panel-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div
      className="animate-result-in"
      style={{ animationDelay: `${420 + index * 70}ms` }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} details`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-2 transition-colors focus-visible:outline-2 focus-visible:outline-sc-accent"
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        <span className="w-40 shrink-0 text-sm font-medium text-ink">{label}</span>
        <div className="flex-1 h-1.5 rounded-full bg-paper-3 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`w-16 text-right font-mono text-sm tabular-nums ${scoreColor}`}>
          {dim.score}<span className="text-ink-3 text-xs">/{max}</span>
        </span>
        {/* Points earned reads as a pass; points lost reads as a deficit.
            Fixed width so the minus signs line up down the column. */}
        <span className="w-9 text-right font-mono text-xs tabular-nums text-critical">
          {lost > 0 ? `−${lost}` : ''}
        </span>
        <svg
          style={{ transition: 'transform 200ms', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          className="w-4 h-4 text-ink-3 flex-shrink-0"
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={`${label} details`}
        // grid-template-rows animates to the CONTENT's height. The previous
        // maxHeight: 500px was a guess that a feedback sentence, a deduction
        // list and an average line can exceed — and it clipped silently, with
        // no scrollbar, hiding the very items this row exists to show.
        style={{ display: 'grid', gridTemplateRows: expanded ? '1fr' : '0fr', transition: 'grid-template-rows 280ms ease' }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ background: 'var(--overlay-tint)', borderRadius: 8, padding: 12, margin: '0 16px 12px' }}>
            <p className="text-sm text-ink-2 leading-relaxed">{dim.feedback || 'No detailed feedback available.'}</p>

            {deductions.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5" style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
                {deductions.map((d, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                    <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-critical" style={{ marginTop: 2 }}>
                      −{d.points}
                    </span>
                    <span>{d.reason}</span>
                  </li>
                ))}
              </ul>
            )}

            {average && average.n > 0 && (
              <p className="mt-3 text-xs text-ink-3">
                your average {average.score}/{max} · {average.n} case{average.n === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function NotesResultPanel({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-surface-3 bg-surface-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-ink-secondary">Your Case Notes</span>
        <svg className={`w-4 h-4 text-ink-tertiary transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-surface-3 px-5 py-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-secondary">{content}</pre>
          <p className="mt-3 text-xs text-ink-tertiary italic border-t border-surface-4 pt-3">
            Compare your notes with the teaching points and differential discussion above to identify gaps in your reasoning.
          </p>
        </div>
      )}
    </div>
  )
}

export function ScorecardNotesPanel({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-surface-3 bg-surface-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-ink-secondary">Your Case Notes</span>
        <svg className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-surface-3 px-5 py-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-2">{content}</pre>
        </div>
      )}
    </div>
  )
}

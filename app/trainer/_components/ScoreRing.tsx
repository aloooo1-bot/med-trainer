import { useState } from 'react'

export function ScoreRing({ score }: { score: number }) {
  const r = 68
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(100, score) / 100)
  const strokeColor = score >= 75 ? 'var(--color-confirmed)' : score >= 60 ? 'var(--color-caution)' : 'var(--color-critical)'
  return (
    <svg width="160" height="160" role="img" aria-label={`Score: ${score} of 100`} className="block">
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="8" />
      <circle
        cx="80" cy="80" r={r} fill="none" style={{ stroke: strokeColor }} strokeWidth="8"
        strokeDasharray={`${circ}`} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 80 80)"
      />
      <text x="80" y="86" textAnchor="middle"
        style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 48, fontWeight: 500, fill: 'var(--color-ink-primary)' }}>
        {score}
      </text>
      <text x="80" y="106" textAnchor="middle"
        style={{ fontSize: 12, fill: 'var(--color-ink-tertiary)', letterSpacing: '0.05em' }}>/ 100</text>
    </svg>
  )
}

export function CategoryRow({
  label, dim, max, pct, expanded, onToggle,
}: {
  label: string
  dim: { score: number; feedback: string }
  max: number
  pct: number
  expanded: boolean
  onToggle: () => void
}) {
  const barColor = pct >= 75 ? 'bg-confirmed' : pct >= 60 ? 'bg-caution' : 'bg-critical'
  const scoreColor = pct >= 75 ? 'text-confirmed' : pct >= 60 ? 'text-caution' : 'text-critical'
  const panelId = `sc-panel-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div>
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
        style={{ overflow: 'hidden', maxHeight: expanded ? '500px' : '0', transition: 'max-height 280ms ease' }}
      >
        <div style={{ background: 'var(--overlay-tint)', borderRadius: 8, padding: 12, margin: '0 16px 12px' }}>
          <p className="text-sm text-ink-2 leading-relaxed">{dim.feedback || 'No detailed feedback available.'}</p>
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

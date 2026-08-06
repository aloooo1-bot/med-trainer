import { useRef, useState, type ReactNode } from 'react'

export type FeedbackSection = {
  title: string
  /** Nodes, not strings — a missed question renders as its text plus the
   *  nearest thing the student actually asked. */
  items: ReactNode[]
  tone: 'confirmed' | 'caution' | 'insight'
  icon: string
  footer?: string
}

const TONE_MAP: Record<'confirmed' | 'caution' | 'insight', {
  cardBg: string; iconBg: string; labelColor: string; dotColor: string
}> = {
  confirmed: { cardBg: 'var(--confirmed-bg)', iconBg: 'var(--color-confirmed)', labelColor: 'var(--color-confirmed)', dotColor: 'var(--color-confirmed)' },
  caution:   { cardBg: 'var(--caution-bg)',   iconBg: 'var(--color-caution)',   labelColor: 'var(--color-caution)',   dotColor: 'var(--color-caution)'   },
  insight:   { cardBg: 'var(--insight-bg)',   iconBg: 'var(--color-insight)',   labelColor: 'var(--color-ink-secondary)', dotColor: 'var(--color-ink-secondary)' },
}

/**
 * Feedback sections as named tabs rather than a blind carousel.
 *
 * This used to be arrows and dots: only the active section had a title, so a
 * student had no way to know "What you missed" existed without clicking through
 * — the most important panel on the scorecard was hidden behind an anonymous
 * chevron. Every section is now labelled and counted up front, so the shape of
 * the feedback is legible before anything is opened.
 */
export function FeedbackTabs({ sections }: { sections: FeedbackSection[] }) {
  const [idx, setIdx] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  if (sections.length === 0) return null

  const n = sections.length
  const safeIdx = Math.min(idx, n - 1)
  const { items, tone, footer } = sections[safeIdx]
  const { cardBg, dotColor } = TONE_MAP[tone]

  // Left/right move between tabs, as the tablist pattern expects. Without this
  // the tabs are reachable but not traversable, which is worse than buttons.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (safeIdx + delta + n) % n
    setIdx(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div style={{ padding: '0 20px 12px' }}>
      <div
        role="tablist"
        aria-label="Feedback sections"
        onKeyDown={onKeyDown}
        style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}
      >
        {sections.map((s, i) => {
          const t = TONE_MAP[s.tone]
          const active = i === safeIdx
          return (
            <button
              key={s.title}
              ref={el => { tabRefs.current[i] = el }}
              role="tab"
              id={`fb-tab-${i}`}
              aria-selected={active}
              aria-controls={`fb-panel-${i}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setIdx(i)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                background: active ? t.cardBg : 'transparent',
                border: `1px solid ${active ? t.iconBg : 'var(--color-rule)'}`,
                color: active ? t.labelColor : 'var(--color-ink-tertiary)',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase', lineHeight: 1.3,
                transition: 'background 120ms, border-color 120ms, color 120ms',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: active ? t.iconBg : 'var(--color-surface-4)',
                  color: active ? '#fff' : 'var(--color-ink-tertiary)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                }}
              >
                {s.icon}
              </span>
              {s.title}
              {/* The count is the point: it says how much is in here before you open it. */}
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, opacity: active ? 0.85 : 0.7 }}>
                {s.items.length}
              </span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`fb-panel-${safeIdx}`}
        aria-labelledby={`fb-tab-${safeIdx}`}
        style={{ background: cardBg, borderRadius: 14, padding: '16px 18px' }}
      >
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--color-ink-primary)', lineHeight: 1.6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 8 }} />
              {item}
            </li>
          ))}
        </ul>
      </div>
      {footer && (
        <p style={{ marginTop: 10, fontSize: 11, color: 'var(--color-ink-tertiary)', fontStyle: 'italic', lineHeight: 1.5, padding: '0 4px' }}>{footer}</p>
      )}
    </div>
  )
}

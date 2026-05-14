import { useState } from 'react'

export type FeedbackSection = {
  title: string
  items: string[]
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

export function FeedbackCarousel({ sections }: { sections: FeedbackSection[] }) {
  const [idx, setIdx] = useState(0)
  if (sections.length === 0) return null
  const n = sections.length
  const safeIdx = idx % n
  const { title, items, tone, icon, footer } = sections[safeIdx]
  const { cardBg, iconBg, labelColor, dotColor } = TONE_MAP[tone]
  const showNav = n > 1
  return (
    <div style={{ padding: '0 20px 12px' }}>
      <div style={{ background: cardBg, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: iconBg, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              {icon}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: labelColor, lineHeight: 1.3 }}>
              {title}
            </span>
          </div>
          {showNav && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setIdx(i => (i - 1 + n) % n)}
                  aria-label="Previous section"
                  style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--overlay-tint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--color-ink-primary)', transition: 'background 120ms' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.setProperty('background', 'var(--overlay-tint-hover)') }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.setProperty('background', 'var(--overlay-tint)') }}
                >←</button>
                <button
                  onClick={() => setIdx(i => (i + 1) % n)}
                  aria-label="Next section"
                  style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--overlay-tint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--color-ink-primary)', transition: 'background 120ms' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.setProperty('background', 'var(--overlay-tint-hover)') }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.setProperty('background', 'var(--overlay-tint)') }}
                >→</button>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {sections.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    aria-current={i === safeIdx ? true : undefined}
                    aria-label={`Go to ${sections[i].title}`}
                    style={{ width: 5, height: 5, borderRadius: '50%', border: 'none', background: i === safeIdx ? dotColor : 'var(--color-surface-4)', cursor: 'pointer', padding: 0, display: 'block', transition: 'background 120ms' }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
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

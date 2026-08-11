import { type ReactNode } from 'react'

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
 * Feedback sections stacked, all visible at once.
 *
 * This has been a carousel (sections hidden behind anonymous chevrons) and
 * then tabs (sections labelled and counted, but two of three still hidden
 * behind a click). Stacking finishes the argument that motivated the tabs:
 * "What you missed" and "Teaching points" are exactly what a student should
 * re-read together, and nothing on a results screen should need discovering.
 */
export function FeedbackSections({ sections }: { sections: FeedbackSection[] }) {
  if (sections.length === 0) return null

  return (
    <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sections.map(section => {
        const t = TONE_MAP[section.tone]
        return (
          <section key={section.title} aria-label={section.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: t.iconBg, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                }}
              >
                {section.icon}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.labelColor, lineHeight: 1.3 }}>
                {section.title}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--color-ink-tertiary)' }}>
                {section.items.length}
              </span>
            </div>
            <div style={{ background: t.cardBg, borderRadius: 14, padding: '16px 18px' }}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.items.map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--color-ink-primary)', lineHeight: 1.6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.dotColor, flexShrink: 0, marginTop: 8 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {section.footer && (
              <p style={{ marginTop: 8, fontSize: 11, color: 'var(--color-ink-tertiary)', fontStyle: 'italic', lineHeight: 1.5, padding: '0 4px' }}>{section.footer}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

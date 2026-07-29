import Link from 'next/link'

/**
 * Shared empty/locked state with line-art illustration.
 *
 * Same visual register as the mastery body map: schematic ink strokes on
 * paper, muted so the art recedes behind the message, with a single accent
 * detail to give each drawing a focal point. Deliberately not emoji — these
 * are the moments a new user forms their first impression of whether the tool
 * is serious.
 *
 * Illustrations are decorative; the message carries the meaning, so every SVG
 * is aria-hidden and the text is the accessible content.
 */

export type EmptyVariant =
  | 'no-cases'         // nothing recorded yet
  | 'not-enough-data'  // some data, not enough to draw a trend
  | 'no-matches'       // filters excluded everything
  | 'empty-deck'       // no spaced-repetition cards yet
  | 'caught-up'        // deck exists, nothing due

const STROKE = 'var(--muted)'
const ACCENT = 'var(--accent)'

function Art({ variant }: { variant: EmptyVariant }) {
  const common = {
    width: 128,
    height: 94,
    viewBox: '0 0 128 94',
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (variant) {
    // A blank chart waiting for its first trace — the flatline with one
    // complex reads as "no beats recorded yet" without being morbid.
    case 'no-cases':
      return (
        <svg {...common}>
          <g stroke={STROKE} strokeWidth="1.5" opacity="0.55">
            <rect x="22" y="16" width="84" height="66" rx="6" />
            <rect x="52" y="10" width="24" height="11" rx="3.5" />
            <path d="M34,64 H74" opacity="0.5" />
            <path d="M34,72 H62" opacity="0.5" />
          </g>
          <path
            d="M30,44 H46 l4.5,-13 l4.5,26 l4.5,-13 H98"
            stroke={ACCENT} strokeWidth="1.9" opacity="0.9"
          />
        </svg>
      )

    // Three points and a dashed continuation: a trend needs more of them.
    case 'not-enough-data':
      return (
        <svg {...common}>
          <g stroke={STROKE} strokeWidth="1.5" opacity="0.55">
            <path d="M26,18 V76 H104" />
          </g>
          <path d="M34,66 L48,56 L62,60" stroke={ACCENT} strokeWidth="1.9" opacity="0.9" />
          <path d="M62,60 L98,30" stroke={ACCENT} strokeWidth="1.6" strokeDasharray="3 4" opacity="0.45" />
          <g fill={ACCENT} opacity="0.9">
            <circle cx="34" cy="66" r="3" />
            <circle cx="48" cy="56" r="3" />
            <circle cx="62" cy="60" r="3" />
          </g>
          <circle cx="98" cy="30" r="3" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.5" />
        </svg>
      )

    // A funnel with nothing coming through.
    case 'no-matches':
      return (
        <svg {...common}>
          <g stroke={STROKE} strokeWidth="1.5" opacity="0.55">
            <path d="M34,20 H94 L70,50 V72 L58,64 V50 Z" />
          </g>
          <g stroke={ACCENT} strokeWidth="1.6" opacity="0.35">
            <path d="M56,82 H72" strokeDasharray="3 4" />
          </g>
          <g fill={STROKE} opacity="0.3">
            <circle cx="44" cy="86" r="2.5" />
            <circle cx="84" cy="86" r="2.5" />
          </g>
        </svg>
      )

    // A fanned stack of blank cards.
    case 'empty-deck':
      return (
        <svg {...common}>
          <g stroke={STROKE} strokeWidth="1.5">
            <rect x="30" y="26" width="54" height="44" rx="5" opacity="0.3" transform="rotate(-9 57 48)" />
            <rect x="36" y="23" width="54" height="44" rx="5" opacity="0.45" transform="rotate(-4 63 45)" />
            <rect x="42" y="20" width="54" height="44" rx="5" opacity="0.7" />
          </g>
          <g stroke={ACCENT} strokeWidth="1.6" opacity="0.5">
            <path d="M54,38 H84" />
            <path d="M54,47 H74" />
          </g>
        </svg>
      )

    // Deck exists, nothing due — a card with a check.
    case 'caught-up':
      return (
        <svg {...common}>
          <g stroke={STROKE} strokeWidth="1.5" opacity="0.55">
            <rect x="30" y="20" width="54" height="44" rx="5" transform="rotate(-5 57 42)" />
          </g>
          <circle cx="88" cy="60" r="16" fill="none" stroke="var(--green)" strokeWidth="1.8" opacity="0.85" />
          <path d="M81,60 l5,5 l10,-11" stroke="var(--green)" strokeWidth="2.2" opacity="0.95" />
        </svg>
      )
  }
}

export function EmptyState({
  variant,
  title,
  body,
  actionLabel,
  actionHref,
  compact = false,
}: {
  variant: EmptyVariant
  title: string
  body?: string
  actionLabel?: string
  actionHref?: string
  /** Tighter padding for use inside a card that already has chrome. */
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', padding: compact ? '18px 16px' : '34px 20px', gap: 2,
      }}
    >
      <Art variant={variant} />
      <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</p>
      {body && (
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--muted)', maxWidth: 340, lineHeight: 1.6 }}>
          {body}
        </p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

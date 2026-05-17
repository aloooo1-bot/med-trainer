import Link from 'next/link'
import type { SystemEntry } from '@/app/lib/dashboardData'

type Session = { score: number; system: string }

export default function NextCaseCard({
  sessions, systems,
}: {
  sessions: Session[]; systems: SystemEntry[]
}) {
  let system: string, tier: string, reason: string
  if (sessions.length === 0 || systems.length === 0) {
    system = 'Cardiovascular'
    tier = 'Foundations'
    reason = 'A great place to start.'
  } else {
    const w = systems[0]
    system = w.name
    tier = w.score < 70 ? 'Foundations' : 'Clinical'
    reason = `Your ${w.name} avg is ${w.score}.`
  }

  const tierClass = tier.toLowerCase()

  return (
    <div className="dx-next-card">
      <div className="dx-next-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11" style={{ marginRight: 5, verticalAlign: 'middle', opacity: 0.8 }}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        Recommended next case
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 4px', lineHeight: 1.4 }}
         title="Foundations — classic cases, no timer. Clinical — atypical features, 22-min timer. Advanced — rare/complex, 15-min timer.">
        Foundations → Clinical → Advanced as your score improves.
      </p>
      <h2 className="dx-next-headline">
        {system} <span className={`dx-next-tier ${tierClass}`}>{tier}</span>
      </h2>
      <p className="dx-next-reason">{reason}</p>
      <Link
        href={`/trainer?system=${encodeURIComponent(system)}&difficulty=${tier}`}
        className="dx-btn-primary dx-next-btn"
      >
        Start case →
      </Link>
    </div>
  )
}

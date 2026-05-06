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

  return (
    <div className="dx-next-card">
      <div className="dx-next-eyebrow">Recommended next case</div>
      <h2 className="dx-next-headline">
        {system} · <span className="dx-next-tier">{tier}</span>
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

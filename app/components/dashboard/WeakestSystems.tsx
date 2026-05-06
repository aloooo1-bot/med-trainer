import Link from 'next/link'
import type { SystemEntry } from '@/app/lib/dashboardData'

function scoreColor(s: number) {
  return s >= 75 ? 'var(--green)' : s >= 60 ? 'var(--amber)' : 'var(--red)'
}

export default function WeakestSystems({ systems }: { systems: SystemEntry[] }) {
  const top3 = systems.slice(0, 3)
  return (
    <div className="dx-card">
      <div className="dx-card-header">Focus areas</div>
      <div className="dx-card-body dx-weak-list">
        {top3.length === 0 ? (
          <p className="dx-empty-state">Complete a few cases to see your focus areas.</p>
        ) : top3.map(s => (
          <Link
            key={s.name}
            href={`/trainer?system=${encodeURIComponent(s.name)}`}
            className="dx-weak-row"
          >
            <span className="dx-system-name">{s.name}</span>
            <span className="dx-system-count">{s.count} case{s.count !== 1 ? 's' : ''}</span>
            <span className="dx-weak-pill" style={{ color: scoreColor(s.score) }}>{s.score}</span>
            <span className="dx-weak-chevron">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

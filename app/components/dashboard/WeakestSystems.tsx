import Link from 'next/link'
import type { SystemEntry } from '@/app/lib/dashboardData'

function scorePill(s: number): { color: string; background: string } {
  if (s >= 75) return { color: 'var(--green)', background: 'rgba(107,184,122,0.15)' }
  if (s >= 60) return { color: 'var(--amber)', background: 'rgba(212,162,76,0.14)' }
  return { color: 'var(--red)', background: 'rgba(232,93,93,0.14)' }
}

export default function WeakestSystems({ systems }: { systems: SystemEntry[] }) {
  const top3 = systems.slice(0, 3)
  return (
    <div className="dx-card">
      <div className="dx-card-header">
        <span className="dx-card-hicon" style={{ background: 'rgba(212,162,76,0.14)', color: 'var(--amber)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </span>
        Focus areas
      </div>
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
            <span className="dx-weak-pill" style={scorePill(s.score)}>
              {s.score}<span className="dx-score-pct">%</span>
            </span>
            <span className="dx-weak-chevron">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

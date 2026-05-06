import Link from 'next/link'
import type { GradingResult } from '@/app/grading/types'

type Session = {
  id: string; score: number; system: string; difficulty: string;
  completed_at: string; grading_result: GradingResult | null
}

const DIM_META = [
  { key: 'historyInterview'      as const, label: 'History & Interview', max: 18 },
  { key: 'testOrdering'          as const, label: 'Test Ordering',       max: 18 },
  { key: 'diagnosisAccuracy'     as const, label: 'Diagnosis Accuracy',  max: 27 },
  { key: 'diagnosisCompleteness' as const, label: 'Completeness',        max: 13 },
  { key: 'clinicalReasoning'     as const, label: 'Clinical Reasoning',  max: 14 },
]

function biggestLoss(gr: GradingResult | null): string {
  if (!gr?.dimensions) return '—'
  let maxLost = 0, maxLabel = ''
  for (const { key, label, max } of DIM_META) {
    const lost = max - (gr.dimensions[key]?.score ?? max)
    if (lost > maxLost) { maxLost = lost; maxLabel = label }
  }
  return maxLost > 0 ? `−${maxLost}pts ${maxLabel}` : '—'
}

function scoreColor(s: number) {
  return s >= 75 ? 'var(--green)' : s >= 60 ? 'var(--amber)' : 'var(--red)'
}

export default function RecentActivity({ sessions }: { sessions: Session[] }) {
  const recent = sessions.slice(0, 5)
  return (
    <div className="dx-card dx-recent">
      <div className="dx-card-header">Recent activity</div>
      {recent.length === 0 ? (
        <div className="dx-card-body">
          <p className="dx-empty-state">No cases yet — start your first one above.</p>
        </div>
      ) : recent.map(s => (
        <Link key={s.id} href={`/history?expand=${s.id}`} className="dx-recent-row">
          <span className="dx-recent-date">
            {new Date(s.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span className="dx-recent-meta">
            <span className="dx-recent-system">{s.system}</span>
            <span className="dx-recent-diff">· {s.difficulty}</span>
          </span>
          <span className="dx-recent-score" style={{ color: scoreColor(s.score) }}>{s.score}</span>
          <span className="dx-recent-loss">{biggestLoss(s.grading_result)}</span>
        </Link>
      ))}
    </div>
  )
}

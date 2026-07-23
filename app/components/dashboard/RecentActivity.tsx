import Link from 'next/link'
import type { GradingResult } from '@/app/grading/types'
import { getRubric } from '@/app/grading/rubric'

type Session = {
  id: string; score: number; correct: boolean; system: string; difficulty: string;
  completed_at: string; grading_result: GradingResult | null
}

function biggestLoss(gr: GradingResult | null, difficulty: string): { label: string; key: string } {
  if (!gr?.dimensions) return { label: '—', key: '' }
  let maxFrac = 0, maxLabel = '', maxKey = ''
  for (const { key, label, max } of getRubric(difficulty)) {
    const dim = gr.dimensions[key]
    if (!dim) continue
    const frac = (max - dim.score) / max
    if (frac > maxFrac) { maxFrac = frac; maxLabel = label; maxKey = key }
  }
  return maxFrac > 0 ? { label: `−${Math.round(maxFrac * 100)}% ${maxLabel}`, key: maxKey } : { label: '—', key: '' }
}

function scoreColor(s: number) {
  return s >= 75 ? 'var(--green)' : s >= 60 ? 'var(--amber)' : 'var(--red)'
}

export default function RecentActivity({ sessions }: { sessions: Session[] }) {
  const recent = sessions.slice(0, 5)
  return (
    <div className="dx-card dx-recent">
      <div className="dx-card-header">
        <span className="dx-card-hicon" style={{ background: 'rgba(61,152,144,0.14)', color: 'var(--accent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </span>
        Recent activity
      </div>
      {recent.length === 0 ? (
        <div className="dx-card-body">
          <p className="dx-empty-state">No cases yet — start your first one above.</p>
        </div>
      ) : recent.map(s => {
        const loss = biggestLoss(s.grading_result, s.difficulty)
        const dotColor = s.correct ? 'var(--green)' : 'var(--red)'
        return (
          <Link key={s.id} href={`/history?expand=${s.id}`} className="dx-recent-row">
            <span
              className="dx-recent-dot"
              style={{ background: dotColor }}
              title={s.correct ? 'Diagnosis correct' : 'Diagnosis incorrect'}
            />
            <span className="dx-recent-date">
              {new Date(s.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="dx-recent-meta">
              <span className="dx-recent-system">{s.system}</span>
              <span className="dx-recent-diff">· {s.difficulty}</span>
            </span>
            <span className="dx-recent-score" style={{ color: scoreColor(s.score) }}>
              {s.score}<span className="dx-score-pct">%</span>
            </span>
            <span
              className={`dx-recent-loss${loss.key ? ' has-loss' : ''}`}
              title={loss.key ? 'Biggest subscore deduction within the weighted total' : undefined}
            >
              {loss.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

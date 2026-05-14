import type { CaseEntry } from '@/app/lib/dashboardData'
import { fractionToPercent, scoreColor } from '@/app/lib/scoreColor'

const SCORECARD_LABELS: Record<keyof CaseEntry['scorecard'], string> = {
  history: 'History', testing: 'Test Ordering', diagnosis: 'Diagnosis',
  completeness: 'Completeness', reasoning: 'Reasoning',
}

export default function CaseDetailPanel({ c }: { c: CaseEntry }) {
  return (
    <div className="dx-detail-panel">
      {/* Scorecard */}
      <div>
        <div className="dx-detail-section-title">Scorecard</div>
        <div className="dx-detail-grid">
          {(Object.entries(c.scorecard) as [keyof CaseEntry['scorecard'], string][]).map(([key, val]) => {
            const pct = fractionToPercent(val)
            return (
              <div key={key} className="dx-score-dim">
                <div className="dx-score-dim-label">{SCORECARD_LABELS[key]}</div>
                <div className="dx-score-dim-frac" style={{ color: scoreColor(pct) }}>{val}</div>
                <div className="dx-mini-track">
                  <div className="dx-mini-fill" style={{ width: `${pct}%`, backgroundColor: scoreColor(pct) }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Strengths */}
      <div>
        <div className="dx-detail-section-title">Strengths</div>
        {c.strengths.map((s, i) => (
          <div key={i} className="dx-strength-item">
            <svg className="dx-strength-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20,6 9,17 4,12" />
            </svg>
            {s}
          </div>
        ))}
      </div>

      {/* Missed questions */}
      {c.missed.length > 0 && (
        <div>
          <div className="dx-detail-section-title">Missed Questions</div>
          {c.missed.map((m, i) => (
            <div key={i} className="dx-missed-item">
              <svg className="dx-missed-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {m}
            </div>
          ))}
        </div>
      )}

      {/* Teaching point */}
      <div>
        <div className="dx-detail-section-title">Teaching Point</div>
        <div className="dx-teaching">{c.teaching}</div>
      </div>

      <div className="dx-detail-footer">
        <span>⏱ {c.time}</span>
        <span>💬 {c.questions} questions asked</span>
      </div>
    </div>
  )
}

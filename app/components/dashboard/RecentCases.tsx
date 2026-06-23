'use client'

import { useState } from 'react'
import type { CaseEntry } from '@/app/lib/dashboardData'
import { scoreClass } from '@/app/lib/scoreColor'
import CaseDetailPanel from './CaseDetailPanel'

const TABS = ['All', 'Foundations', 'Clinical', 'Advanced'] as const
type Tab = typeof TABS[number]

function levelClass(level: string) {
  return level.toLowerCase().replace(' ', '-')
}

export default function RecentCases({ cases, onViewAll }: { cases: CaseEntry[]; onViewAll: () => void }) {
  const [tab, setTab]         = useState<Tab>('All')
  const [expanded, setExpanded] = useState<number | null>(null)

  const filtered = tab === 'All' ? cases : cases.filter(c => c.level === tab)

  function toggle(i: number) {
    setExpanded(prev => prev === i ? null : i)
  }

  return (
    <div className="dx-card">
      <div className="dx-card-header">Recent Cases</div>

      <div className="dx-tabs">
        {TABS.map(t => (
          <button key={t} className={`dx-tab${tab === t ? ' active' : ''}`} onClick={() => { setTab(t); setExpanded(null) }}>
            {t}
          </button>
        ))}
      </div>

      {filtered.map((c, i) => {
        const isOpen = expanded === i
        return (
          <div key={i}>
            <div className="dx-case-row" onClick={() => toggle(i)}>
              <div className="dx-dot" style={{ backgroundColor: c.correct ? 'var(--green)' : 'var(--red)' }} />
              <div className="dx-case-meta">
                <div className="dx-case-system">
                  {c.system}
                  <span className={`dx-level-chip ${levelClass(c.level)}`}>{c.level}</span>
                </div>
                <div className="dx-case-date">{c.date}</div>
              </div>
              <div className={`dx-case-score ${scoreClass(c.score)}`}>{c.score}<span className="dx-score-pct">%</span></div>
              <div className={`dx-result-badge ${c.correct ? 'correct' : 'incorrect'}`}>
                {c.correct ? 'Correct' : 'Incorrect'}
              </div>
              <div style={{ color: isOpen ? 'var(--accent)' : 'var(--muted)', fontSize: 18, lineHeight: 1 }}>
                {isOpen ? '▲' : '▼'}
              </div>
            </div>
            {isOpen && <CaseDetailPanel c={c} />}
          </div>
        )
      })}

      <div className="dx-view-all-row">
        <button className="dx-btn-ghost" onClick={onViewAll}>
          View all case history →
        </button>
      </div>
    </div>
  )
}

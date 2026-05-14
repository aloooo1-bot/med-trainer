'use client'

import { useState, useEffect, useMemo } from 'react'
import type { CaseEntry, SystemEntry } from '@/app/lib/dashboardData'
import { scoreClass, scoreColor } from '@/app/lib/scoreColor'
import CaseDetailPanel from './CaseDetailPanel'

type SortKey = 'date' | 'score' | 'system'

function levelClass(level: string) { return level.toLowerCase().replace(' ', '-') }

export default function HistoryModal({
  cases, systems, onClose,
}: {
  cases: CaseEntry[]; systems: SystemEntry[]; onClose: () => void
}) {
  const [sysFilter, setSysFilter] = useState('All Systems')
  const [search, setSearch]       = useState('')
  const [sortKey, setSortKey]     = useState<SortKey>('date')
  const [sortAsc, setSortAsc]     = useState(false)
  const [expanded, setExpanded]   = useState<number | null>(null)

  // Esc key closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sysNames = ['All Systems', ...Array.from(new Set(systems.map(s => s.name)))]

  const filtered = useMemo(() => {
    let rows = cases
    if (sysFilter !== 'All Systems') rows = rows.filter(c => c.system === sysFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(c => c.yourDx.toLowerCase().includes(q) || c.correctDx.toLowerCase().includes(q) || c.system.toLowerCase().includes(q))
    }
    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'score')  cmp = a.score - b.score
      if (sortKey === 'system') cmp = a.system.localeCompare(b.system)
      if (sortKey === 'date')   cmp = a.date.localeCompare(b.date)
      return sortAsc ? cmp : -cmp
    })
  }, [cases, sysFilter, search, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p)
    else { setSortKey(key); setSortAsc(false) }
  }

  const avgScore  = cases.length ? Math.round(cases.reduce((a, c) => a + c.score, 0) / cases.length) : 0
  const topSystem = systems.reduce((best, s) => s.count > (best?.count ?? 0) ? s : best, systems[0])

  return (
    <div className="dx-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dx-modal" onClick={e => e.stopPropagation()}>

        <div className="dx-modal-header">
          <div className="dx-modal-title">Case History</div>
          <button className="dx-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="dx-modal-stats">
          <div className="dx-modal-stat">
            <div className="dx-modal-stat-label">Completed</div>
            <div className="dx-modal-stat-value">{cases.length}</div>
          </div>
          <div className="dx-modal-stat">
            <div className="dx-modal-stat-label">Avg Score</div>
            <div className="dx-modal-stat-value" style={{ color: scoreColor(avgScore) }}>{avgScore}<span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6 }}>%</span></div>
          </div>
          <div className="dx-modal-stat">
            <div className="dx-modal-stat-label">Most Practiced</div>
            <div className="dx-modal-stat-value" style={{ fontSize: 14, paddingTop: 4 }}>{topSystem?.name ?? '—'}</div>
          </div>
        </div>

        <div className="dx-filter-chips">
          {sysNames.map(name => (
            <button key={name} className={`dx-chip${sysFilter === name ? ' active' : ''}`} onClick={() => { setSysFilter(name); setExpanded(null) }}>
              {name}
            </button>
          ))}
        </div>

        <div className="dx-search-wrap">
          <input className="dx-search" placeholder="Search by diagnosis or system…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="dx-modal-body">
          <div className="dx-table-header">
            <span className="sortable" onClick={() => toggleSort('date')}>Date {sortKey === 'date' ? (sortAsc ? '↑' : '↓') : ''}</span>
            <span className="sortable" onClick={() => toggleSort('system')}>System {sortKey === 'system' ? (sortAsc ? '↑' : '↓') : ''}</span>
            <span>Level</span>
            <span className="sortable" onClick={() => toggleSort('score')}>Score {sortKey === 'score' ? (sortAsc ? '↑' : '↓') : ''}</span>
            <span>Result</span>
            <span>Your Dx</span>
            <span>Correct Dx</span>
            <span />
          </div>

          {filtered.map((c, i) => {
            const isOpen = expanded === i
            return (
              <div key={i}>
                <div className="dx-table-row" onClick={() => setExpanded(isOpen ? null : i)}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{c.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.system}</span>
                  <span><span className={`dx-level-chip ${levelClass(c.level)}`}>{c.level}</span></span>
                  <span className={`dx-case-score ${scoreClass(c.score)}`}>{c.score}<span className="dx-score-pct">%</span></span>
                  <span><span className={`dx-result-badge ${c.correct ? 'correct' : 'incorrect'}`}>{c.correct ? 'Correct' : 'Incorrect'}</span></span>
                  <span className="dx-diagnosis-cell">{c.yourDx}</span>
                  <span className="dx-diagnosis-cell">{c.correctDx}</span>
                  <button className={`dx-expand-btn${isOpen ? ' open' : ''}`} onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : i) }}>
                    {isOpen ? '▲' : '▼'}
                  </button>
                </div>
                {isOpen && (
                  <div style={{ paddingLeft: 0, borderBottom: '1px solid var(--border)' }}>
                    <CaseDetailPanel c={c} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

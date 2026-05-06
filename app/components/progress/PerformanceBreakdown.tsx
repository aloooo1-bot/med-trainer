'use client'

import { useState, useMemo } from 'react'

type Session = { system: string; difficulty: string; score: number }

type Row = {
  system: string
  count: number
  avgScore: number
  fAvg: number | null
  cAvg: number | null
  aAvg: number | null
}

type SortKey = 'system' | 'count' | 'avgScore' | 'fAvg' | 'cAvg' | 'aAvg'

function avg(arr: number[]): number | null {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
}

function computeBreakdown(sessions: Session[]): Row[] {
  const map = new Map<string, { all: number[]; F: number[]; C: number[]; A: number[] }>()
  for (const s of sessions) {
    if (!map.has(s.system)) map.set(s.system, { all: [], F: [], C: [], A: [] })
    const e = map.get(s.system)!
    e.all.push(s.score)
    if (s.difficulty === 'Foundations') e.F.push(s.score)
    else if (s.difficulty === 'Clinical')   e.C.push(s.score)
    else if (s.difficulty === 'Advanced')   e.A.push(s.score)
  }
  return [...map.entries()].map(([system, e]) => ({
    system,
    count: e.all.length,
    avgScore: avg(e.all)!,
    fAvg: avg(e.F),
    cAvg: avg(e.C),
    aAvg: avg(e.A),
  }))
}

function cssScore(s: number | null) {
  if (s === null) return 'var(--muted)'
  return s < 60 ? 'var(--red)' : s < 75 ? 'var(--amber)' : 'var(--green)'
}

export default function PerformanceBreakdown({ sessions }: { sessions: Session[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const rows = useMemo(() => {
    const r = computeBreakdown(sessions)
    return r.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = av === null ? -Infinity : (av as number)
      const bn = bv === null ? -Infinity : (bv as number)
      return sortDir === 'asc' ? an - bn : bn - an
    })
  }, [sessions, sortKey, sortDir])

  function clickHeader(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'system' ? 'asc' : 'desc') }
  }

  function arrow(key: SortKey) {
    if (key !== sortKey) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  if (rows.length === 0) {
    return (
      <div className="dx-card">
        <div className="dx-card-header">Performance Breakdown</div>
        <div className="dx-card-body">
          <p className="dx-empty-state">Your performance breakdown will appear once you complete a case.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dx-card">
      <div className="dx-card-header">Performance Breakdown</div>
      <div className="dx-perf-table">
        <div className="dx-perf-header">
          <span className="dx-perf-th sortable" onClick={() => clickHeader('system')}>System{arrow('system')}</span>
          <span className="dx-perf-th sortable" onClick={() => clickHeader('count')}>Cases{arrow('count')}</span>
          <span className="dx-perf-th sortable" onClick={() => clickHeader('avgScore')}>Avg{arrow('avgScore')}</span>
          <span className="dx-perf-th sortable" onClick={() => clickHeader('fAvg')}>Foundations{arrow('fAvg')}</span>
          <span className="dx-perf-th sortable" onClick={() => clickHeader('cAvg')}>Clinical{arrow('cAvg')}</span>
          <span className="dx-perf-th sortable" onClick={() => clickHeader('aAvg')}>Advanced{arrow('aAvg')}</span>
        </div>
        {rows.map(r => (
          <div key={r.system} className="dx-perf-row">
            <span className="dx-perf-system">{r.system}</span>
            <span className="dx-perf-count">{r.count}</span>
            <span className="dx-perf-score" style={{ color: cssScore(r.avgScore) }}>{r.avgScore}</span>
            <span className="dx-perf-score" style={{ color: cssScore(r.fAvg) }}>{r.fAvg ?? '—'}</span>
            <span className="dx-perf-score" style={{ color: cssScore(r.cAvg) }}>{r.cAvg ?? '—'}</span>
            <span className="dx-perf-score" style={{ color: cssScore(r.aAvg) }}>{r.aAvg ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

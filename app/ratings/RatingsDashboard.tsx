'use client'

import { useState, useMemo } from 'react'
import type { RatingRow } from '../lib/supabase/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const DIMS = [
  { key: 'overall',              label: 'Overall Case' },
  { key: 'clinical_realism',     label: 'Clinical Realism' },
  { key: 'grading_fairness',     label: 'Grading Fairness' },
  { key: 'patient_communication',label: 'Patient Communication' },
  { key: 'difficulty_accuracy',  label: 'Difficulty Accuracy' },
] as const

type DimKey = typeof DIMS[number]['key']

const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundations: 'text-green-400',
  Clinical:    'text-yellow-400',
  Advanced:    'text-red-400',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function ratingColor(v: number) {
  if (v >= 4) return 'text-green-400'
  if (v >= 3) return 'text-yellow-400'
  return 'text-red-400'
}

function avgOf(rows: RatingRow[], key: DimKey): number | null {
  const vals = rows.map(r => r[key]).filter((v): v is number => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function StarBar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`text-sm leading-none ${i <= Math.round(value) ? 'text-yellow-400' : 'text-ink-muted'}`}>★</span>
        ))}
      </span>
      <span className={`text-xs tabular-nums font-semibold ${ratingColor(value)}`}>{value.toFixed(1)}</span>
    </span>
  )
}

function StarDistribution({ rows, dimKey }: { rows: RatingRow[]; dimKey: DimKey }) {
  const vals = rows.map(r => r[dimKey]).filter((v): v is number => v != null)
  const total = vals.length
  if (total === 0) return <p className="text-xs text-ink-tertiary">No ratings yet.</p>
  const counts = [5, 4, 3, 2, 1].map(s => ({ star: s, count: vals.filter(v => v === s).length }))
  const maxCount = Math.max(...counts.map(c => c.count), 1)
  return (
    <div className="space-y-1">
      {counts.map(({ star, count }) => (
        <div key={star} className="flex items-center gap-2 text-[10px]">
          <span className="text-yellow-500 w-4 shrink-0 text-right">{star}★</span>
          <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-yellow-500/60" style={{ width: `${(count / maxCount) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-ink-tertiary tabular-nums">
            {count > 0 ? `${Math.round((count / total) * 100)}%` : '—'}
          </span>
        </div>
      ))}
      <p className="text-[10px] text-ink-tertiary mt-1">{total} rating{total !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RatingsDashboard({ initialRows }: { initialRows: RatingRow[] }) {
  const [filterSystem, setFilterSystem] = useState('All')
  const [filterDiff,   setFilterDiff]   = useState('All')
  const [activeDim,    setActiveDim]    = useState<DimKey>('overall')
  const [expandedCase, setExpandedCase] = useState<string | null>(null)

  const allSystems = useMemo(() =>
    ['All', ...new Set(initialRows.map(r => r.system))].sort((a, b) => a === 'All' ? -1 : a.localeCompare(b)),
    [initialRows]
  )

  const rows = useMemo(() =>
    initialRows.filter(r =>
      (filterSystem === 'All' || r.system === filterSystem) &&
      (filterDiff === 'All' || r.difficulty === filterDiff)
    ),
    [initialRows, filterSystem, filterDiff]
  )

  // Per-case groups
  const caseGroups = useMemo(() => {
    const map = new Map<string, { key: string; diagnosis: string; system: string; difficulty: string; rows: RatingRow[]; latest: string }>()
    for (const r of rows) {
      const key = `${r.system}||${r.difficulty}||${r.diagnosis}`
      if (!map.has(key)) map.set(key, { key, diagnosis: r.diagnosis, system: r.system, difficulty: r.difficulty, rows: [], latest: r.created_at })
      const g = map.get(key)!
      g.rows.push(r)
      if (r.created_at > g.latest) g.latest = r.created_at
    }
    return [...map.values()].sort((a, b) => (avgOf(b.rows, 'overall') ?? 0) - (avgOf(a.rows, 'overall') ?? 0))
  }, [rows])

  const byDiff = useMemo(() =>
    DIFFICULTIES.map(diff => {
      const dr = rows.filter(r => r.difficulty === diff)
      return { diff, count: dr.length, avg: avgOf(dr, 'overall') }
    }).filter(d => d.count > 0),
    [rows]
  )

  const lowRated = useMemo(() =>
    caseGroups
      .filter(g => g.rows.length >= 2 && (avgOf(g.rows, 'overall') ?? 5) < 3.5)
      .sort((a, b) => (avgOf(a.rows, 'overall') ?? 5) - (avgOf(b.rows, 'overall') ?? 5)),
    [caseGroups]
  )

  const recentComments = useMemo(() =>
    [...rows].filter(r => r.comment.trim()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20),
    [rows]
  )

  if (rows.length === 0 && initialRows.length === 0) {
    return (
      <div className="text-center py-24">
        <div className="text-3xl text-ink-muted mb-3">⭐</div>
        <p className="text-ink-secondary text-sm mb-1">No ratings submitted yet.</p>
        <p className="text-ink-tertiary text-xs">Complete a case and rate it to see data here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-ink-tertiary">Filter:</span>
        <div className="flex flex-wrap gap-1">
          {allSystems.map(s => (
            <button key={s} onClick={() => setFilterSystem(s)}
              className={`text-xs rounded px-2.5 py-1 border transition-colors ${filterSystem === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-3 text-ink-tertiary hover:border-surface-4 hover:text-ink-secondary'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-2">
          {['All', ...DIFFICULTIES].map(d => (
            <button key={d} onClick={() => setFilterDiff(d)}
              className={`text-xs rounded px-2.5 py-1 border transition-colors ${filterDiff === d ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-3 text-ink-tertiary hover:border-surface-4 hover:text-ink-secondary'}`}>
              {d}
            </button>
          ))}
        </div>
        {rows.length !== initialRows.length && (
          <span className="text-xs text-ink-tertiary ml-2">{rows.length} of {initialRows.length} shown</span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-tertiary text-center py-12">No ratings match this filter.</p>
      ) : (<>

        {/* Overall dimension cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {DIMS.map(({ key, label }) => {
            const avg = avgOf(rows, key)
            return (
              <div key={key} className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                <div className="text-xs text-ink-tertiary mb-2 leading-tight">{label}</div>
                {avg != null ? <StarBar value={avg} /> : <span className="text-xs text-ink-tertiary">—</span>}
              </div>
            )
          })}
        </div>

        {/* Distribution + by-difficulty */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

          {/* Dimension distribution (tabbed) */}
          <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
            <div className="border-b border-surface-3 px-5 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Distribution</span>
              <span className="text-xs text-ink-tertiary">{rows.length} total</span>
            </div>
            <div className="flex border-b border-surface-3 overflow-x-auto">
              {DIMS.map(({ key, label }) => (
                <button key={key} onClick={() => setActiveDim(key)}
                  className={`shrink-0 px-3 py-2 text-[11px] transition-colors whitespace-nowrap ${activeDim === key ? 'text-ink-primary border-b-2 border-blue-500' : 'text-ink-tertiary hover:text-ink-secondary'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-5">
              <StarDistribution rows={rows} dimKey={activeDim} />
            </div>
          </section>

          {/* By difficulty + by system */}
          <div className="space-y-4">
            {byDiff.length > 0 && (
              <section className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-3">By Difficulty</div>
                <div className="space-y-2.5">
                  {byDiff.map(({ diff, count, avg }) => (
                    <div key={diff} className="flex items-center gap-3">
                      <span className={`text-xs font-semibold w-24 shrink-0 ${DIFFICULTY_COLOR[diff]}`}>{diff}</span>
                      <div className="flex-1">{avg != null ? <StarBar value={avg} /> : <span className="text-xs text-ink-tertiary">—</span>}</div>
                      <span className="text-xs text-ink-tertiary tabular-nums">×{count}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Per-case table */}
        <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
          <div className="border-b border-surface-3 px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Ratings by Case</span>
            <span className="text-xs text-ink-tertiary">{caseGroups.length} unique case{caseGroups.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-3 text-ink-tertiary">
                  <th className="px-4 py-2.5 text-left font-medium">Diagnosis</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">System</th>
                  <th className="px-3 py-2.5 text-left font-medium">Lvl</th>
                  <th className="px-3 py-2.5 text-center font-medium">n</th>
                  {DIMS.slice(1).map(d => (
                    <th key={d.key} className="px-2 py-2.5 text-center font-medium hidden lg:table-cell">
                      {d.label.split(' ')[0]}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-medium">Overall</th>
                  <th className="px-2 py-2.5 w-4" />
                </tr>
              </thead>
              <tbody>
                {caseGroups.map(g => {
                  const isExp = expandedCase === g.key
                  const overallAvg = avgOf(g.rows, 'overall')
                  return (
                    <>
                      <tr key={g.key}
                        onClick={() => setExpandedCase(isExp ? null : g.key)}
                        className={`border-b border-surface-3/40 cursor-pointer select-none transition-colors ${isExp ? 'bg-surface-2/60' : 'hover:bg-surface-2/20'}`}>
                        <td className="px-4 py-2.5 text-ink-secondary max-w-[160px] truncate" title={g.diagnosis}>{g.diagnosis}</td>
                        <td className="px-3 py-2.5 text-ink-tertiary max-w-[100px] truncate hidden md:table-cell" title={g.system}>{g.system}</td>
                        <td className={`px-3 py-2.5 font-semibold ${DIFFICULTY_COLOR[g.difficulty] ?? 'text-ink-secondary'}`}>{g.difficulty.slice(0, 4)}</td>
                        <td className="px-3 py-2.5 text-center text-ink-tertiary tabular-nums">{g.rows.length}</td>
                        {DIMS.slice(1).map(d => {
                          const v = avgOf(g.rows, d.key)
                          return (
                            <td key={d.key} className="px-2 py-2.5 text-center hidden lg:table-cell">
                              {v != null ? <span className={`tabular-nums font-medium ${ratingColor(v)}`}>{v.toFixed(1)}</span> : <span className="text-ink-muted">—</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2.5 text-center">
                          {overallAvg != null
                            ? <span className={`text-sm font-bold tabular-nums ${ratingColor(overallAvg)}`}>{overallAvg.toFixed(1)}</span>
                            : <span className="text-ink-tertiary">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-ink-tertiary text-right">{isExp ? '▲' : '▼'}</td>
                      </tr>

                      {isExp && (
                        <tr key={`${g.key}-exp`} className="border-b border-surface-3/40 bg-surface-2/10">
                          <td colSpan={10} className="px-5 py-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-ink-tertiary mb-2">Dimension Breakdown</div>
                                {DIMS.map(({ key, label }) => {
                                  const v = avgOf(g.rows, key)
                                  return v != null ? (
                                    <div key={key} className="flex items-center gap-3">
                                      <span className="text-xs text-ink-tertiary w-40 shrink-0">{label}</span>
                                      <StarBar value={v} />
                                    </div>
                                  ) : null
                                })}
                                <div className="text-[10px] text-ink-tertiary pt-1">Last rated {fmtDate(g.latest)}</div>
                              </div>
                              {g.rows.filter(r => r.comment).length > 0 && (
                                <div>
                                  <div className="text-xs font-medium text-ink-tertiary mb-2">Comments ({g.rows.filter(r => r.comment).length})</div>
                                  <div className="space-y-2">
                                    {g.rows.filter(r => r.comment).slice(-5).map((r, i) => (
                                      <p key={i} className="text-xs text-ink-secondary italic border-l-2 border-surface-3 pl-3 leading-snug">&ldquo;{r.comment}&rdquo;</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Needs attention */}
        {lowRated.length > 0 && (
          <section className="rounded-lg border border-red-900/40 bg-surface-1 overflow-hidden">
            <div className="border-b border-red-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-400">
              Needs Attention — Overall &lt; 3.5★ (≥ 2 ratings)
            </div>
            <div className="divide-y divide-gray-800/40">
              {lowRated.map(g => {
                const avg = avgOf(g.rows, 'overall')
                return (
                  <div key={g.key} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-primary truncate">{g.diagnosis}</div>
                      <div className="text-xs text-ink-tertiary mt-0.5">
                        {g.system} · <span className={DIFFICULTY_COLOR[g.difficulty]}>{g.difficulty}</span>
                        {' · '}{g.rows.length} rating{g.rows.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {avg != null && <StarBar value={avg} />}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Recent comments */}
        {recentComments.length > 0 && (
          <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
            <div className="border-b border-surface-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Recent Comments
            </div>
            <div className="divide-y divide-gray-800/40">
              {recentComments.map((r, i) => {
                const overallVal = r.overall
                return (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-ink-secondary">{r.diagnosis}</span>
                        <span className="text-xs text-ink-tertiary ml-2">
                          {r.system} · <span className={DIFFICULTY_COLOR[r.difficulty]}>{r.difficulty}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {overallVal != null && <StarBar value={overallVal} />}
                        <span className="text-[10px] text-ink-tertiary whitespace-nowrap">{fmtDate(r.created_at)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-ink-secondary leading-snug italic">&ldquo;{r.comment}&rdquo;</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </>)}
    </div>
  )
}

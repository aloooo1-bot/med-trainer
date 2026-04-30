'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  type CaseSessionRecord, type APICallType, type AbandonedSessionRecord,
  loadSessionRecords, clearAnalytics,
  loadAbandonedSessions, clearAbandonedAnalytics,
} from '../lib/analytics'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number, digits = 4): string {
  return `$${n.toFixed(digits)}`
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
}
function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), sec = s % 60
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}
function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const CALL_TYPE_LABELS: Record<APICallType, string> = {
  generation: 'Generation',
  chat: 'Chat',
  grading_main: 'Grading',
  grading_oral: 'Oral grading',
  ros_derived: 'ROS summary',
  ros_classifier: 'ROS classifier',
  on_demand: 'On-demand result',
}

const CALL_TYPE_COLOR: Record<APICallType, string> = {
  generation:     'text-blue-400',
  chat:           'text-green-400',
  grading_main:   'text-yellow-400',
  grading_oral:   'text-orange-400',
  ros_derived:    'text-purple-400',
  ros_classifier: 'text-pink-400',
  on_demand:      'text-cyan-400',
}

const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']
const DIFFICULTY_COLOR: Record<string, string> = {
  Foundations: 'text-green-400',
  Clinical: 'text-yellow-400',
  Advanced: 'text-red-400',
}

// ── Derived stats ─────────────────────────────────────────────────────────────

function computeStats(sessions: CaseSessionRecord[]) {
  if (sessions.length === 0) return null

  const totalCost = sessions.reduce((s, r) => s + r.totalCostUSD, 0)
  const totalInputTok = sessions.reduce((s, r) => s + r.totalInputTokens, 0)
  const totalOutputTok = sessions.reduce((s, r) => s + r.totalOutputTokens, 0)
  const accurateCount = sessions.filter(s => s.correct).length

  // Cost by call type
  const costByType: Partial<Record<APICallType, number>> = {}
  const callCountByType: Partial<Record<APICallType, number>> = {}
  for (const session of sessions) {
    for (const call of session.apiCalls) {
      costByType[call.type] = (costByType[call.type] ?? 0) + call.costUSD
      callCountByType[call.type] = (callCountByType[call.type] ?? 0) + 1
    }
  }

  // By difficulty
  const byDiff = DIFFICULTIES.map(diff => {
    const rows = sessions.filter(s => s.difficulty === diff)
    return {
      diff,
      count: rows.length,
      avgCost: avg(rows.map(r => r.totalCostUSD)),
      avgQuestions: avg(rows.map(r => r.questionCount)),
      avgScore: avg(rows.map(r => r.score)),
      accuracy: rows.length ? rows.filter(r => r.correct).length / rows.length : 0,
      avgElapsed: avg(rows.map(r => r.elapsedSeconds)),
    }
  })

  // Question count histogram buckets: 0-2, 3-5, 6-9, 10-14, 15-19, 20+
  const Q_BUCKETS = [
    { label: '0–2', min: 0, max: 2 },
    { label: '3–5', min: 3, max: 5 },
    { label: '6–9', min: 6, max: 9 },
    { label: '10–14', min: 10, max: 14 },
    { label: '15–19', min: 15, max: 19 },
    { label: '20+', min: 20, max: Infinity },
  ]
  const qHistogram = Q_BUCKETS.map(b => ({
    label: b.label,
    count: sessions.filter(s => s.questionCount >= b.min && s.questionCount <= b.max).length,
  }))
  const qMax = Math.max(...qHistogram.map(b => b.count), 1)

  // Per-system cost
  const systems = [...new Set(sessions.map(s => s.system))].sort()
  const bySys = systems.map(sys => {
    const rows = sessions.filter(s => s.system === sys)
    return { sys, count: rows.length, avgCost: avg(rows.map(r => r.totalCostUSD)) }
  }).sort((a, b) => b.avgCost - a.avgCost)

  // Top expensive sessions
  const topSessions = [...sessions].sort((a, b) => b.totalCostUSD - a.totalCostUSD).slice(0, 15)

  return {
    totalCost, totalInputTok, totalOutputTok,
    avgCost: totalCost / sessions.length,
    avgQuestions: avg(sessions.map(s => s.questionCount)),
    avgScore: avg(sessions.map(s => s.score)),
    accuracy: accurateCount / sessions.length,
    avgElapsed: avg(sessions.map(s => s.elapsedSeconds)),
    costByType, callCountByType, byDiff, qHistogram, qMax, bySys, topSessions,
    startDate: Math.min(...sessions.map(s => s.startedAt)),
    endDate: Math.max(...sessions.map(s => s.completedAt)),
  }
}

const TAB_LABELS: Record<string, string> = {
  hpi: 'History (HPI)',
  ros: 'Review of Systems',
  exam: 'Physical Exam',
  results: 'Test Results',
  diagnosis: 'Diagnosis',
}

function computeAbandonStats(sessions: CaseSessionRecord[], abandoned: AbandonedSessionRecord[]) {
  const total = sessions.length + abandoned.length
  if (total === 0) return null

  const abandonRate = abandoned.length / total

  const tabCounts: Record<string, number> = {}
  for (const rec of abandoned) {
    tabCounts[rec.tabAtAbandon] = (tabCounts[rec.tabAtAbandon] ?? 0) + 1
  }

  const allSystems = [...new Set([...sessions.map(s => s.system), ...abandoned.map(a => a.system)])].sort()
  const bySys = allSystems
    .map(sys => {
      const completedCount = sessions.filter(s => s.system === sys).length
      const abandonedCount = abandoned.filter(a => a.system === sys).length
      return {
        sys,
        completedCount,
        abandonedCount,
        rate: (completedCount + abandonedCount) > 0
          ? abandonedCount / (completedCount + abandonedCount)
          : 0,
      }
    })
    .filter(r => r.abandonedCount > 0)
    .sort((a, b) => b.rate - a.rate)

  return { total, abandonRate, tabCounts, bySys }
}

// ── Admin page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [sessions, setSessions] = useState<CaseSessionRecord[]>([])
  const [abandoned, setAbandoned] = useState<AbandonedSessionRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showConfirmClear, setShowConfirmClear] = useState(false)

  const stats = useMemo(() => computeStats(sessions), [sessions])
  const abandonStats = useMemo(() => computeAbandonStats(sessions, abandoned), [sessions, abandoned])

  useEffect(() => {
    setSessions(loadSessionRecords())
    setAbandoned(loadAbandonedSessions())
    setLoaded(true)
  }, [])

  function handleClear() {
    clearAnalytics()
    clearAbandonedAnalytics()
    setSessions([])
    setAbandoned([])
    setShowConfirmClear(false)
  }

  if (!loaded) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Loading…</div>
  }

  if (sessions.length === 0 && abandoned.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl text-gray-700 mb-3">📊</div>
          <p className="text-gray-400 text-sm mb-1">No sessions recorded yet.</p>
          <p className="text-gray-600 text-xs">Generate and submit cases to start collecting analytics.</p>
          <a href="/" className="mt-6 inline-block text-xs text-blue-400 hover:text-blue-300 underline">← Back to trainer</a>
        </div>
      </div>
    )
  }

  const allTypes = Object.keys(CALL_TYPE_LABELS) as APICallType[]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-100">Session Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {sessions.length} completed · {abandoned.length} abandoned
            {stats && ` · ${fmtDate(stats.startDate)} → ${fmtDate(stats.endDate)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSessions(loadSessionRecords()); setAbandoned(loadAbandonedSessions()) }}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1.5 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowConfirmClear(true)}
            className="text-xs text-red-500 hover:text-red-400 border border-red-900 rounded px-3 py-1.5 transition-colors"
          >
            Clear data
          </button>
          <a href="/" className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1.5 transition-colors">
            ← Trainer
          </a>
        </div>
      </header>

      <main className="p-6 space-y-8 max-w-6xl mx-auto">

        {stats && (<>
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Total cost', value: fmt$(stats.totalCost, 4) },
            { label: 'Avg cost / session', value: fmt$(stats.avgCost, 4) },
            { label: 'Avg questions / session', value: stats.avgQuestions.toFixed(1) },
            { label: 'Avg score', value: `${stats.avgScore.toFixed(1)}/100` },
            { label: 'Accuracy', value: fmtPct(stats.accuracy * 100) },
            { label: 'Avg time', value: fmtElapsed(Math.round(stats.avgElapsed)) },
            { label: 'Input tokens (total)', value: stats.totalInputTok.toLocaleString() },
            { label: 'Output tokens (total)', value: stats.totalOutputTok.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-lg font-bold text-gray-100 tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        {/* Two-column: difficulty breakdown + call type breakdown */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

          {/* By difficulty */}
          <section className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              By Difficulty
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-5 py-2.5 text-left font-medium">Level</th>
                  <th className="px-3 py-2.5 text-right font-medium">n</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg Qs</th>
                  <th className="px-3 py-2.5 text-right font-medium">Accuracy</th>
                  <th className="px-4 py-2.5 text-right font-medium">Avg time</th>
                </tr>
              </thead>
              <tbody>
                {stats.byDiff.map(row => (
                  <tr key={row.diff} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className={`px-5 py-2.5 font-semibold ${DIFFICULTY_COLOR[row.diff]}`}>{row.diff}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">{row.count}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">{fmt$(row.avgCost, 4)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">{row.avgQuestions.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">{fmtPct(row.accuracy * 100)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{fmtElapsed(Math.round(row.avgElapsed))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Cost by call type */}
          <section className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Cost by Call Type
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-5 py-2.5 text-left font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Calls</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">% of total</th>
                </tr>
              </thead>
              <tbody>
                {allTypes
                  .map(type => ({
                    type,
                    cost: stats.costByType[type] ?? 0,
                    count: stats.callCountByType[type] ?? 0,
                  }))
                  .filter(r => r.count > 0)
                  .sort((a, b) => b.cost - a.cost)
                  .map(row => (
                    <tr key={row.type} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className={`px-5 py-2.5 font-medium ${CALL_TYPE_COLOR[row.type]}`}>{CALL_TYPE_LABELS[row.type]}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">{row.count.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">{fmt$(row.cost, 4)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                        {fmtPct(stats.totalCost > 0 ? (row.cost / stats.totalCost) * 100 : 0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* Question count histogram */}
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-5">
            Question Count Distribution
          </div>
          <div className="flex items-end gap-3 h-32">
            {stats.qHistogram.map(bucket => {
              const pct = bucket.count / stats.qMax
              return (
                <div key={bucket.label} className="flex flex-col items-center gap-1.5 flex-1">
                  <span className="text-[10px] text-gray-500 tabular-nums">{bucket.count}</span>
                  <div
                    className="w-full rounded-t bg-blue-700/60 hover:bg-blue-600/70 transition-colors min-h-[2px]"
                    style={{ height: `${Math.max(2, pct * 100)}%` }}
                  />
                  <span className="text-[10px] text-gray-500">{bucket.label}</span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-3">x-axis = questions asked to the patient; y-axis = session count</p>
        </section>

        {/* By system */}
        {stats.bySys.length > 0 && (
          <section className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Avg Cost by Body System
            </div>
            <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-2 md:grid-cols-3">
              {stats.bySys.map(row => (
                <div key={row.sys} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 truncate pr-2">{row.sys}</span>
                  <span className="text-gray-200 tabular-nums whitespace-nowrap">
                    {fmt$(row.avgCost, 4)} <span className="text-gray-600">×{row.count}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        </>)}

        {/* Abandonment */}
        {abandonStats && (
          <section className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Abandonment
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-start gap-8">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Abandoned</div>
                  <div className="text-2xl font-bold text-orange-400 tabular-nums">{abandoned.length}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Completed</div>
                  <div className="text-2xl font-bold text-gray-100 tabular-nums">{sessions.length}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Abandonment rate</div>
                  <div className="text-2xl font-bold text-orange-300 tabular-nums">{fmtPct(abandonStats.abandonRate * 100)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* By stage */}
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2">By stage at abandonment</div>
                  {Object.entries(abandonStats.tabCounts).length === 0
                    ? <p className="text-xs text-gray-600">No data</p>
                    : Object.entries(abandonStats.tabCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([tab, count]) => (
                          <div key={tab} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800/50">
                            <span className="text-gray-400">{TAB_LABELS[tab] ?? tab}</span>
                            <span className="text-orange-300 tabular-nums font-semibold">{count}</span>
                          </div>
                        ))
                  }
                </div>

                {/* By system */}
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2">By body system</div>
                  {abandonStats.bySys.length === 0
                    ? <p className="text-xs text-gray-600">No data</p>
                    : abandonStats.bySys.slice(0, 12).map(row => (
                        <div key={row.sys} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800/50">
                          <span className="text-gray-400 truncate pr-3">{row.sys}</span>
                          <span className="tabular-nums whitespace-nowrap text-gray-500">
                            <span className="text-orange-400 font-semibold">{row.abandonedCount}</span>
                            <span className="text-gray-600">/{row.abandonedCount + row.completedCount}</span>
                            {' '}
                            <span className="text-gray-600">({fmtPct(row.rate * 100)})</span>
                          </span>
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>
          </section>
        )}

        {stats && (<>
        {/* Top expensive sessions */}
        <section className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Top Sessions by Cost
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-5 py-2.5 text-left font-medium">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium">Difficulty</th>
                  <th className="px-3 py-2.5 text-left font-medium">System</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qs</th>
                  <th className="px-3 py-2.5 text-right font-medium">Time</th>
                  <th className="px-3 py-2.5 text-right font-medium">Score</th>
                  <th className="px-4 py-2.5 text-left font-medium">Diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {stats.topSessions.map(session => (
                  <tr key={session.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(session.startedAt)}</td>
                    <td className={`px-3 py-2.5 font-medium ${DIFFICULTY_COLOR[session.difficulty] ?? 'text-gray-400'}`}>
                      {session.difficulty}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 max-w-[100px] truncate">{session.system}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-100 tabular-nums">{fmt$(session.totalCostUSD, 4)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">{session.questionCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{fmtElapsed(session.elapsedSeconds)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={session.correct ? 'text-green-400' : 'text-red-400'}>{session.score}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate" title={session.diagnosis}>
                      {session.diagnosis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent sessions */}
        <section className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Recent Sessions (last 20)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-5 py-2.5 text-left font-medium">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium">Diff</th>
                  <th className="px-3 py-2.5 text-left font-medium">System</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gen</th>
                  <th className="px-3 py-2.5 text-right font-medium">Chat</th>
                  <th className="px-3 py-2.5 text-right font-medium">Grade</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qs</th>
                  <th className="px-3 py-2.5 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {[...sessions].reverse().slice(0, 20).map(session => {
                  const byCost = (type: APICallType) =>
                    session.apiCalls.filter(c => c.type === type).reduce((s, c) => s + c.costUSD, 0)
                  return (
                    <tr key={session.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-5 py-2 text-gray-500 whitespace-nowrap">{fmtDate(session.startedAt)}</td>
                      <td className={`px-3 py-2 font-medium ${DIFFICULTY_COLOR[session.difficulty] ?? 'text-gray-400'}`}>
                        {session.difficulty.slice(0, 4)}
                      </td>
                      <td className="px-3 py-2 text-gray-400 max-w-[90px] truncate">{session.system}</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-100 tabular-nums">{fmt$(session.totalCostUSD, 4)}</td>
                      <td className="px-3 py-2 text-right text-blue-400 tabular-nums">{fmt$(byCost('generation'), 4)}</td>
                      <td className="px-3 py-2 text-right text-green-400 tabular-nums">{fmt$(byCost('chat'), 4)}</td>
                      <td className="px-3 py-2 text-right text-yellow-400 tabular-nums">
                        {fmt$(byCost('grading_main') + byCost('grading_oral'), 4)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">{session.questionCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={session.correct ? 'text-green-400' : 'text-red-400'}>{session.score}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        </>)}

        <p className="text-[10px] text-gray-700 pb-4">
          Pricing: claude-sonnet-4-6 · Input $3.00/MTok · Output $15.00/MTok · Cache write $3.75/MTok · Cache read $0.30/MTok
        </p>
      </main>

      {/* Confirm clear */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-red-900 bg-gray-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-base font-semibold text-red-400">Clear all analytics data?</h3>
            <p className="mb-5 text-sm text-gray-400">This permanently removes all {sessions.length} completed and {abandoned.length} abandoned sessions from localStorage. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleClear} className="flex-1 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors">
                Delete all
              </button>
              <button onClick={() => setShowConfirmClear(false)} className="flex-1 rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

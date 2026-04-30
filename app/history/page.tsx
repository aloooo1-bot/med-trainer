'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { type CaseSessionRecord, loadSessionRecords } from '../lib/analytics'
import type { GradingResult } from '../grading/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), sec = s % 60
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

function scoreColor(score: number, max = 100): string {
  const pct = score / max
  if (pct >= 0.8) return 'text-green-400'
  if (pct >= 0.6) return 'text-yellow-400'
  return 'text-red-400'
}

function barColor(score: number, max: number): string {
  const pct = score / max
  if (pct >= 0.8) return 'bg-green-500'
  if (pct >= 0.6) return 'bg-yellow-500'
  return 'bg-red-500'
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundations: 'text-green-400',
  Clinical: 'text-yellow-400',
  Advanced: 'text-red-400',
}

const DIM_META: { key: keyof NonNullable<GradingResult['dimensions']>; label: string; max: number }[] = [
  { key: 'historyInterview',      label: 'History & Interview',    max: 18 },
  { key: 'testOrdering',          label: 'Test Ordering',          max: 18 },
  { key: 'diagnosisAccuracy',     label: 'Diagnosis Accuracy',     max: 27 },
  { key: 'diagnosisCompleteness', label: 'Completeness',           max: 13 },
  { key: 'clinicalReasoning',     label: 'Clinical Reasoning',     max: 14 },
]

// ── Scorecard detail (expanded row) ──────────────────────────────────────────

function ScoreDetail({ session }: { session: CaseSessionRecord }) {
  const gr = session.gradingResult

  if (!gr) {
    return (
      <p className="text-xs text-gray-600 italic">
        Detailed scorecard not available for this session — recorded before scorecard storage was added.
      </p>
    )
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">

      {/* Left column: feedback + dimensions */}
      <div className="space-y-4">
        {gr.feedback && (
          <p className="text-sm text-gray-300 leading-relaxed">{gr.feedback}</p>
        )}

        {gr.dimensions && (
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Scorecard</div>
            {DIM_META.map(({ key, label, max }) => {
              const dim = gr.dimensions![key]
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{label}</span>
                    <span className={`tabular-nums font-semibold ${scoreColor(dim.score, max)}`}>
                      {dim.score}<span className="text-gray-600">/{max}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor(dim.score, max)}`}
                      style={{ width: `${(dim.score / max) * 100}%` }}
                    />
                  </div>
                  {dim.feedback && (
                    <p className="text-xs text-gray-500 leading-snug">{dim.feedback}</p>
                  )}
                </div>
              )
            })}

            {gr.efficiency && gr.efficiency.score > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Efficiency</span>
                  <span className={`tabular-nums font-semibold ${scoreColor(gr.efficiency.score, 10)}`}>
                    {gr.efficiency.score}<span className="text-gray-600">/10</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor(gr.efficiency.score, 10)}`}
                    style={{ width: `${(gr.efficiency.score / 10) * 100}%` }}
                  />
                </div>
                {gr.efficiency.feedback && (
                  <p className="text-xs text-gray-500 leading-snug">{gr.efficiency.feedback}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right column: strengths, missed, teaching points */}
      <div className="space-y-4">
        {(gr.strengths?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Strengths</div>
            {gr.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-green-400">
                <span className="mt-px shrink-0 text-green-600">✓</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}

        {(gr.missedQuestions?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Missed Questions</div>
            {gr.missedQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-yellow-400">
                <span className="mt-px shrink-0 text-yellow-700">·</span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        )}

        {(gr.teachingPoints?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Teaching Points</div>
            {gr.teachingPoints.map((tp, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-blue-300">
                <span className="mt-px shrink-0 text-blue-700">·</span>
                <span>{tp}</span>
              </div>
            ))}
          </div>
        )}

        {(gr.differentials?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Differentials</div>
            {gr.differentials.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                <span className="mt-px shrink-0 text-gray-600">·</span>
                <span>{d}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-gray-600 pt-1 border-t border-gray-800/60">
          <span>Time: {fmtElapsed(session.elapsedSeconds)}</span>
          <span>Questions asked: {session.questionCount}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [sessions, setSessions] = useState<CaseSessionRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const all = loadSessionRecords()
    setSessions([...all].reverse().slice(0, 50))
    setLoaded(true)
  }, [])

  const stats = useMemo(() => {
    if (sessions.length === 0) return null
    const correct = sessions.filter(s => s.correct).length
    const avgScore = sessions.reduce((a, s) => a + s.score, 0) / sessions.length
    const sysCount: Record<string, number> = {}
    for (const s of sessions) sysCount[s.system] = (sysCount[s.system] ?? 0) + 1
    const mostPracticed = Object.entries(sysCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    return { total: sessions.length, correct, accuracy: correct / sessions.length, avgScore, mostPracticed }
  }, [sessions])

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-gray-400 text-sm mb-1">No completed cases yet.</p>
          <p className="text-gray-600 text-xs mb-6">
            Generate a case and submit your diagnosis to start building your history.
          </p>
          <a href="/" className="text-xs text-blue-400 hover:text-blue-300 underline">
            ← Back to trainer
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-100">Case History</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {sessions.length === 50 ? 'Last 50 completed cases' : `${sessions.length} completed case${sessions.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <a
          href="/"
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1.5 transition-colors"
        >
          ← Trainer
        </a>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Summary stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Cases completed', value: stats.total.toString() },
              { label: 'Average score', value: `${stats.avgScore.toFixed(1)} / 100` },
              { label: 'Accuracy', value: `${(stats.accuracy * 100).toFixed(0)}%` },
              { label: 'Most practiced', value: stats.mostPracticed },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className="text-lg font-bold text-gray-100 leading-tight">{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Cases table */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-3 py-3 text-left font-medium">System</th>
                <th className="px-3 py-3 text-left font-medium">Level</th>
                <th className="px-3 py-3 text-right font-medium">Score</th>
                <th className="px-3 py-3 text-left font-medium">Result</th>
                <th className="px-3 py-3 text-left font-medium hidden sm:table-cell">Your Diagnosis</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Correct Diagnosis</th>
                <th className="px-3 py-3 w-6" />
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => {
                const isExpanded = expandedId === session.id
                return (
                  <Fragment key={session.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : session.id)}
                      className={`border-b border-gray-800/50 cursor-pointer select-none transition-colors ${
                        isExpanded ? 'bg-gray-800/40' : 'hover:bg-gray-800/20'
                      }`}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(session.startedAt)}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400 max-w-[90px] truncate">
                        {session.system}
                      </td>
                      <td className={`px-3 py-3 text-xs font-semibold ${DIFFICULTY_COLOR[session.difficulty] ?? 'text-gray-400'}`}>
                        {session.difficulty.slice(0, 4)}
                      </td>
                      <td className={`px-3 py-3 text-right text-sm font-bold tabular-nums ${scoreColor(session.score)}`}>
                        {session.score}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                          session.correct
                            ? 'bg-green-900/40 text-green-400'
                            : 'bg-red-900/40 text-red-400'
                        }`}>
                          {session.correct ? 'Correct' : 'Incorrect'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-300 max-w-[160px] truncate hidden sm:table-cell"
                          title={session.userDiagnosis}>
                        {session.userDiagnosis}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate hidden sm:table-cell"
                          title={session.diagnosis}>
                        {session.diagnosis}
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-xs text-right">
                        {isExpanded ? '▲' : '▼'}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-b border-gray-800/50 bg-gray-800/10">
                        <td colSpan={8} className="px-5 py-5">
                          {/* Show full diagnosis strings on mobile where columns are hidden */}
                          <div className="sm:hidden mb-4 space-y-1 text-xs">
                            <div>
                              <span className="text-gray-500">Your diagnosis: </span>
                              <span className="text-gray-300">{session.userDiagnosis}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Correct diagnosis: </span>
                              <span className="text-gray-400">{session.diagnosis}</span>
                            </div>
                          </div>
                          <ScoreDetail session={session} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-gray-700 pb-2 text-center">
          Showing completed cases stored in browser localStorage · History is local to this device
        </p>
      </main>
    </div>
  )
}

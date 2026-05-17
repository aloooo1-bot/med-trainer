'use client'

import { useState, useEffect, useMemo } from 'react'
import { type CaseSessionRecord, loadSessionRecords } from '../lib/analytics'
import type { GradingResult } from '../grading/types'
import { getRubric, type RubricDimension } from '../grading/rubric'
import { useChartTheme } from '../lib/useChartTheme'

// ── Constants ──────────────────────────────────────────────────────────────────

const SYSTEMS = [
  'Cardiovascular', 'Respiratory', 'Neurologic', 'Gastrointestinal',
  'Renal', 'Endocrine / Metabolic', 'Infectious', 'Hematologic / Oncologic',
  'Musculoskeletal', 'Psychiatric', 'Toxicologic', 'Trauma',
]

const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundations: 'text-green-400',
  Clinical:    'text-yellow-400',
  Advanced:    'text-red-400',
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct >= 0.8) return 'text-green-400'
  if (pct >= 0.6) return 'text-yellow-400'
  return 'text-red-400'
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function fmtPct1(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

// ── Score trend chart (inline SVG, no library) ─────────────────────────────────

function ScoreTrendChart({ sessions }: { sessions: CaseSessionRecord[] }) {
  const theme = useChartTheme()

  if (sessions.length < 2) {
    return (
      <p className="text-xs text-ink-tertiary text-center py-8">
        Complete at least 2 cases to see a trend.
      </p>
    )
  }

  const allSameDay = sessions.length > 1 && sessions.every(s =>
    new Date(s.completedAt).toDateString() === new Date(sessions[0].completedAt).toDateString()
  )

  const W = 560, H = 148
  const PAD = { top: 14, right: 10, bottom: 30, left: 26 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom

  const xFor = (i: number) =>
    sessions.length === 1 ? PAD.left + cW / 2 : PAD.left + (i / (sessions.length - 1)) * cW
  const yFor = (score: number) => PAD.top + (1 - score / 100) * cH

  const polyline = sessions.map((s, i) => `${xFor(i)},${yFor(s.score)}`).join(' ')

  // 7-case moving average — first valid point is at index 6 (7 data points)
  const maLine: string[] = []
  if (sessions.length >= 7) {
    sessions.forEach((_, i) => {
      if (i < 6) return
      const slice = sessions.slice(i - 6, i + 1)
      const ma = slice.reduce((a, s) => a + s.score, 0) / slice.length
      maLine.push(`${xFor(i)},${yFor(ma)}`)
    })
  }

  // X-axis tick interval: show every tick up to 12 sessions, then every 5
  const xTickStep = sessions.length <= 12 ? 1 : 5
  const xTicks = sessions
    .map((s, i) => ({ i, label: allSameDay ? `#${i + 1}` : new Date(s.completedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) }))
    .filter((_, i) => i === 0 || i === sessions.length - 1 || (i + 1) % xTickStep === 0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <desc>{sessions.length} cases, scores {Math.min(...sessions.map(s => s.score))}–{Math.max(...sessions.map(s => s.score))}</desc>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = yFor(v)
        return (
          <g key={v}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke={theme.gridLine} strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 3.5} fontSize="8" fill={theme.inkTertiary} textAnchor="end">
              {v}
            </text>
          </g>
        )
      })}
      {/* X-axis ticks */}
      {xTicks.map(({ i, label }) => (
        <text key={i} x={xFor(i)} y={H - 4} fontSize="7.5" fill={theme.inkTertiary} textAnchor="middle">
          {label}
        </text>
      ))}

      {/* Score line */}
      <polyline points={polyline} fill="none" stroke={theme.primary}
        strokeWidth="1.5" strokeOpacity="0.55" />

      {/* 7-case moving avg */}
      {maLine.length > 0 && (
        <polyline points={maLine.join(' ')} fill="none"
          stroke={theme.caution} strokeWidth="1.5" strokeOpacity="0.75" strokeDasharray="4 2" />
      )}

      {/* Score dots */}
      {sessions.map((s, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(s.score)} r="3.5"
          fill={s.correct ? theme.confirmed : theme.critical}
          stroke="var(--color-surface-0)" strokeWidth="1.5"
          tabIndex={0}
          aria-label={`${s.system} · ${s.difficulty} — Score ${s.score} (${s.correct ? 'correct' : 'incorrect'}) · ${new Date(s.completedAt).toLocaleDateString()}`}
          style={{ outline: 'none' }}
        >
          <title>{s.system} · {s.difficulty} — Score {s.score} ({s.correct ? 'correct' : 'incorrect'}) · {new Date(s.completedAt).toLocaleDateString()}</title>
        </circle>
      ))}
    </svg>
  )
}

// ── Stats computation ──────────────────────────────────────────────────────────

interface CellData { count: number; correct: number; totalScore: number }

function computeStats(sessions: CaseSessionRecord[]) {
  if (sessions.length === 0) return null

  const sorted = [...sessions].sort((a, b) => a.completedAt - b.completedAt)
  const correct = sessions.filter(s => s.correct).length

  // Current consecutive-correct streak
  let streak = 0
  for (const s of [...sorted].reverse()) {
    if (s.correct) streak++
    else break
  }

  // Score histogram (5 buckets)
  const HIST = [
    { label: '0–19', min: 0, max: 19 },
    { label: '20–39', min: 20, max: 39 },
    { label: '40–59', min: 40, max: 59 },
    { label: '60–79', min: 60, max: 79 },
    { label: '80–100', min: 80, max: 100 },
  ]
  const histogram = HIST.map(b => ({
    label: b.label,
    hue: Math.round((b.min / 100) * 120),
    count: sessions.filter(s => s.score >= b.min && s.score <= b.max).length,
  }))
  const histMax = Math.max(...histogram.map(b => b.count), 1)

  // Heatmap: sys × diff
  const allSystems = [...new Set([...SYSTEMS, ...sessions.map(s => s.system)])]
  const heatmap: Record<string, Record<string, CellData>> = {}
  for (const sys of allSystems) {
    heatmap[sys] = {}
    for (const diff of DIFFICULTIES) {
      heatmap[sys][diff] = { count: 0, correct: 0, totalScore: 0 }
    }
  }
  for (const s of sessions) {
    const cell = heatmap[s.system]?.[s.difficulty]
    if (cell) {
      cell.count++
      if (s.correct) cell.correct++
      cell.totalScore += s.score
    }
  }
  const activeSystems = allSystems.filter(sys =>
    DIFFICULTIES.some(d => (heatmap[sys][d]?.count ?? 0) > 0)
  )

  // Per-difficulty breakdown (avg score + accuracy)
  const byDiff = DIFFICULTIES.map(diff => {
    const rows = sessions.filter(s => s.difficulty === diff)
    return {
      diff,
      count: rows.length,
      accuracy: rows.length ? rows.filter(r => r.correct).length / rows.length : 0,
      avgScore: rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : 0,
    }
  }).filter(r => r.count > 0)

  // Dimension averages — normalise per session by that session's difficulty rubric
  const withDims = sessions.filter(s => s.gradingResult?.dimensions)
  // Collect all unique dimension keys appearing across difficulties
  const allDimKeys: RubricDimension['key'][] = [
    'historyInterview', 'testOrdering', 'diagnosisAccuracy', 'diagnosisCompleteness', 'clinicalReasoning',
  ]
  const dimAvgs = allDimKeys.map(key => {
    const relevant = withDims.filter(s => {
      const rubric = getRubric(s.difficulty)
      return rubric.some(d => d.key === key) && s.gradingResult!.dimensions![key] !== undefined
    })
    if (relevant.length === 0) return null
    const rubricLabel = getRubric(relevant[0].difficulty).find(d => d.key === key)!.label
    const pct = relevant.reduce((a, s) => {
      const rubric = getRubric(s.difficulty)
      const dim = rubric.find(d => d.key === key)!
      const dimScore = s.gradingResult!.dimensions![key]!.score
      return a + dimScore / dim.max
    }, 0) / relevant.length
    return { key, label: rubricLabel, pct, count: relevant.length }
  }).filter((d): d is NonNullable<typeof d> => d !== null)

  // Weak areas: ≥ 2 sessions, accuracy < 60%
  const weakAreas: { sys: string; diff: string; accuracy: number; count: number; avgScore: number }[] = []
  for (const sys of Object.keys(heatmap)) {
    for (const diff of DIFFICULTIES) {
      const cell = heatmap[sys][diff]
      if (cell.count >= 2 && cell.correct / cell.count < 0.6) {
        weakAreas.push({
          sys, diff,
          accuracy: cell.correct / cell.count,
          count: cell.count,
          avgScore: cell.totalScore / cell.count,
        })
      }
    }
  }
  weakAreas.sort((a, b) => a.accuracy - b.accuracy)

  // Recent trend: last 10 vs prior 10
  const last10 = sorted.slice(-10)
  const prior10 = sorted.slice(-20, -10)
  const trendDelta =
    last10.length >= 5 && prior10.length >= 5
      ? (last10.filter(s => s.correct).length / last10.length) -
        (prior10.filter(s => s.correct).length / prior10.length)
      : null

  return {
    total: sessions.length,
    correct,
    accuracy: correct / sessions.length,
    avgScore: sessions.reduce((a, s) => a + s.score, 0) / sessions.length,
    streak,
    systemsTried: new Set(sessions.map(s => s.system)).size,
    trendSessions: sorted.slice(-40),
    histogram,
    histMax,
    heatmap,
    activeSystems,
    byDiff,
    dimAvgs,
    withDimsCount: withDims.length,
    weakAreas,
    trendDelta,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [sessions, setSessions] = useState<CaseSessionRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setSessions(loadSessionRecords())
    setLoaded(true)
  }, [])

  const stats = useMemo(() => computeStats(sessions), [sessions])

  if (!loaded) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center text-ink-tertiary text-sm">
        Loading…
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl text-ink-muted mb-3">📈</div>
          <p className="text-ink-secondary text-sm mb-1">No completed cases yet.</p>
          <p className="text-ink-tertiary text-xs">
            Submit your first diagnosis to start tracking performance.
          </p>
          <a href="/" className="mt-6 inline-block text-xs text-blue-400 hover:text-blue-300 underline">
            ← Back to trainer
          </a>
        </div>
      </div>
    )
  }

  const trendBadge = stats.trendDelta !== null
    ? stats.trendDelta > 0.05
      ? { text: `↑ ${fmtPct(stats.trendDelta)} vs prior 10`, cls: 'text-green-400' }
      : stats.trendDelta < -0.05
        ? { text: `↓ ${fmtPct(Math.abs(stats.trendDelta))} vs prior 10`, cls: 'text-red-400' }
        : { text: '≈ flat vs prior 10', cls: 'text-ink-tertiary' }
    : null

  return (
    <div className="min-h-screen bg-surface-0 text-ink-primary">

      {/* Header */}
      <header className="border-b border-surface-3 bg-surface-1 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="heading-display text-[18px]">Performance <span className="heading-accent">review</span></h1>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {stats.total} completed case{stats.total !== 1 ? 's' : ''}
            {trendBadge && (
              <span className={`ml-2 ${trendBadge.cls}`}>{trendBadge.text}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/ratings"
            className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">
            Ratings
          </a>
          <a href="/history"
            className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">
            History
          </a>
          <a href="/admin"
            className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">
            Admin
          </a>
          <a href="/"
            className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">
            ← Trainer
          </a>
        </div>
      </header>

      <main className="p-6 space-y-8 max-w-6xl mx-auto">

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: 'Cases',          value: stats.total.toString(),             color: 'text-ink-primary' },
            { label: 'Accuracy (dx correct)', value: fmtPct1(stats.accuracy),   color: pctColor(stats.accuracy) },
            { label: 'Avg rubric score', value: `${stats.avgScore.toFixed(0)}/100`, color: pctColor(stats.avgScore / 100) },
            { label: 'Correct streak', value: stats.streak.toString(),            color: stats.streak >= 3 ? 'text-green-400' : 'text-ink-primary' },
            {
              label: 'Systems tried',
              value: stats.byDiff.length === 1 && stats.byDiff[0].diff === 'Foundations'
                ? `${stats.systemsTried} / 12 (Foundations only)`
                : `${stats.systemsTried} / 36`,
              color: 'text-ink-primary',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-surface-3 bg-surface-1 p-4">
              <div className="text-xs text-ink-tertiary mb-1">{label}</div>
              <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score trend */}
        <section className="rounded-lg border border-surface-3 bg-surface-1 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Score Trend</div>
            <div className="flex items-center gap-4 text-[10px] text-ink-tertiary">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#2d7a4a' }} />Correct
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#b43b3b' }} />Incorrect
              </span>
              {stats.trendSessions.length >= 7 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-dashed border-yellow-500" />7-case avg
                </span>
              )}
            </div>
          </div>
          <ScoreTrendChart sessions={stats.trendSessions} />
          {stats.trendSessions.length === 40 && (
            <p className="text-[10px] text-ink-muted mt-2">Showing last 40 sessions</p>
          )}
        </section>

        {/* Two columns: dimension bars + score histogram */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

          {/* Dimension averages */}
          <section className="rounded-lg border border-surface-3 bg-surface-1 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-4">
              Avg Dimension Scores
              {stats.withDimsCount > 0 && (
                <span className="ml-2 font-normal normal-case text-ink-tertiary">
                  ({stats.withDimsCount} graded)
                </span>
              )}
            </div>
            {stats.withDimsCount === 0
              ? <p className="text-xs text-ink-tertiary">Submit more cases to see dimension breakdowns.</p>
              : (() => {
                  const sorted = [...stats.dimAvgs].sort((a, b) => a.pct - b.pct)
                  const weakestPct = sorted[0]?.pct ?? 1
                  const secondPct  = sorted[1]?.pct ?? 1
                  const gapFlags   = new Set(
                    secondPct - weakestPct > 0.1 ? [sorted[0].key] : []
                  )
                  return (
                    <div className="space-y-3.5">
                      {stats.dimAvgs.map(({ key, label, pct }) => {
                        const isWeak = gapFlags.has(key)
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className={isWeak ? 'text-yellow-400 font-semibold' : 'text-ink-secondary'}>
                                {label}{isWeak ? ' ↓' : ''}
                              </span>
                              <span className={`tabular-nums font-semibold ${isWeak ? 'text-yellow-400' : pctColor(pct)}`}>
                                {Math.round(pct * 100)}%
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.round(pct * 100)}%`,
                                  backgroundColor: isWeak ? 'hsl(40,80%,45%)' : `hsl(${Math.round(pct * 120)},55%,42%)`,
                                }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
            }
          </section>

          {/* Score distribution + by-difficulty quick stats */}
          <section className="rounded-lg border border-surface-3 bg-surface-1 p-5 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-4">
                Score Distribution
              </div>
              <div className="flex items-end gap-2.5 h-24">
                {stats.histogram.map(bucket => {
                  const pct = bucket.count / stats.histMax
                  return (
                    <div key={bucket.label} className="flex flex-col items-center gap-1.5 flex-1">
                      <span className="text-[10px] text-ink-tertiary tabular-nums">
                        {bucket.count > 0 ? bucket.count : ''}
                      </span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: bucket.count === 0 ? 0 : `${Math.max(2, pct * 100)}%`,
                          backgroundColor: `hsl(${bucket.hue},55%,38%)`,
                        }}
                      />
                      <span className="text-[10px] text-ink-tertiary">{bucket.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {stats.byDiff.length > 0 && (
              <div className="border-t border-surface-3 pt-4">
                <div className="text-xs font-medium text-ink-tertiary mb-2">By Difficulty</div>
                <div className="space-y-2">
                  {stats.byDiff.map(({ diff, count, accuracy, avgScore }) => (
                    <div key={diff} className="flex items-center gap-3 text-xs">
                      <span className={`w-20 font-semibold ${DIFFICULTY_COLOR[diff]}`}>{diff}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${accuracy * 100}%`,
                            backgroundColor: `hsl(${Math.round(accuracy * 120)},55%,42%)`,
                          }}
                        />
                      </div>
                      <span className={`w-10 text-right tabular-nums font-semibold ${pctColor(accuracy)}`}>
                        {fmtPct(accuracy)}
                      </span>
                      <span className="text-ink-tertiary tabular-nums w-16 text-right">
                        avg {Math.round(avgScore)} ×{count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* System × Difficulty heatmap */}
        {stats.activeSystems.length > 0 && (
          <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
            <div className="border-b border-surface-3 px-5 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                System × Difficulty — Accuracy
              </span>
              <div className="flex items-center gap-3 text-[10px] text-ink-tertiary">
                <span style={{ color: 'hsl(0,60%,55%)' }}>■</span> Low
                <span style={{ color: 'hsl(60,60%,55%)' }}>■</span> Mid
                <span style={{ color: 'hsl(120,60%,45%)' }}>■</span> High
              </div>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left pb-3 pr-6 font-medium text-ink-tertiary whitespace-nowrap">
                      Body System
                    </th>
                    {DIFFICULTIES.map(d => (
                      <th key={d} className={`text-center pb-3 px-3 font-semibold ${DIFFICULTY_COLOR[d]}`}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.activeSystems.map(sys => (
                    <tr key={sys} className="border-t border-surface-3/60">
                      <td className="py-1.5 pr-6 text-ink-secondary whitespace-nowrap">{sys}</td>
                      {DIFFICULTIES.map(diff => {
                        const cell = stats.heatmap[sys]?.[diff]
                        if (!cell || cell.count === 0) {
                          return (
                            <td key={diff} className="py-1.5 px-3 text-center">
                              <a
                                href={`/trainer?system=${encodeURIComponent(sys)}&difficulty=${diff}`}
                                className="mx-auto w-16 rounded py-1 text-[10px] text-ink-muted bg-surface-2/40 block hover:text-blue-400 transition-colors"
                                style={{ textDecoration: 'none' }}
                              >
                                Try →
                              </a>
                            </td>
                          )
                        }
                        const acc = cell.correct / cell.count
                        const hue = Math.round(acc * 120)
                        return (
                          <td key={diff} className="py-1.5 px-3 text-center">
                            <div
                              className="mx-auto w-16 rounded py-1 text-[10px] font-semibold"
                              style={{
                                backgroundColor: `hsl(${hue},45%,15%)`,
                                color: `hsl(${hue},65%,62%)`,
                              }}
                            >
                              {fmtPct(acc)}
                              <span className="ml-1 opacity-50">×{cell.count}</span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Weak areas focus suggestions */}
        {stats.weakAreas.length > 0 && (
          <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
            <div className="border-b border-surface-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Focus Areas
            </div>
            <div className="p-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {stats.weakAreas.slice(0, 6).map(({ sys, diff, accuracy, count, avgScore }) => (
                <div key={`${sys}-${diff}`}
                  className="rounded-lg border border-surface-3 bg-surface-2/60 p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-ink-primary leading-tight">{sys}</div>
                      <div className={`text-xs font-medium mt-0.5 ${DIFFICULTY_COLOR[diff]}`}>{diff}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-red-400 tabular-nums">{fmtPct(accuracy)}</div>
                      <div className="text-[10px] text-ink-tertiary">{count} case{count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-ink-tertiary">
                    Avg score {Math.round(avgScore)} / 100
                  </div>
                  <a
                    href={`/trainer?system=${encodeURIComponent(sys)}&difficulty=${diff}`}
                    className="mt-auto block w-full text-center rounded bg-surface-3 hover:bg-surface-3 transition-colors text-xs text-ink-secondary py-1.5"
                  >
                    Practice this →
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}

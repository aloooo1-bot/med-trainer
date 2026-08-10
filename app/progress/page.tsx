'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import '@/app/dashboard.css'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { EmptyState } from '@/app/components/EmptyState'
import { createClient } from '@/app/lib/supabase/client'
import type { GradingResult } from '@/app/grading/types'
import type { ProgressSummary } from '@/app/lib/supabase/types'

/**
 * Row cap for the chart data. The trend charts plot at most a few hundred
 * points before becoming unreadable, and the activity calendar only looks back
 * 12 weeks — so this bounds the payload without changing what any chart can
 * actually show. The stat cards do NOT depend on it.
 */
const CHART_ROWS = 400

const ScoreOverTime = dynamic(() => import('@/app/components/progress/ScoreOverTime'), { ssr: false })
const ComponentScoreTrends = dynamic(() => import('@/app/components/progress/ComponentScoreTrends'), { ssr: false })
import PerformanceBreakdown from '@/app/components/progress/PerformanceBreakdown'
const ReasoningProgress = dynamic(() => import('@/app/components/progress/ReasoningProgress'), { ssr: false })

type Session = {
  id: string
  score: number
  correct: boolean
  system: string
  difficulty: string
  completed_at: string
  elapsed_seconds: number
  grading_result: GradingResult | null
}

function cssScore(s: number) {
  return s < 60 ? 'var(--red)' : s < 75 ? 'var(--amber)' : 'var(--green)'
}

function fmtSeconds(secs: number) {
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export default function ProgressPage() {
  const [displayName, setDisplayName] = useState('User')
  const [tier, setTier] = useState('free')
  const [sessions, setSessions] = useState<Session[]>([])
  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      const [{ data: p }, { data: agg }, { data: rows, error: rowsError }] = await Promise.all([
        supabase.from('profiles').select('display_name,tier').eq('id', user.id).single(),
        // Headline numbers are aggregated in Postgres over EVERY case, so they
        // stay exact no matter how the row fetch below is bounded.
        supabase.rpc('progress_summary'),
        // Rows exist only to draw the charts. Bounded and ordered newest-first:
        // an unbounded fetch pulled the full grading_result JSONB for every
        // case ever completed, and PostgREST would silently truncate it past
        // its db-max-rows cap anyway — which used to corrupt the totals.
        supabase.from('case_sessions')
          .select('id, score, correct, system, difficulty, completed_at, elapsed_seconds, grading_result')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false })
          .limit(CHART_ROWS),
      ])
      if (p) {
        setDisplayName(p.display_name ?? user.email?.split('@')[0] ?? 'User')
        setTier(p.tier ?? 'free')
      }
      if (rowsError) setLoadError(true)
      if (agg) setSummary(agg as ProgressSummary)
      setSessions((rows ?? []) as Session[])
      setLoaded(true)
    }).catch(() => {
      setLoadError(true)
      setLoaded(true)
    })
  }, [])

  // Charts read the fetched rows; the stat cards read the server aggregate.
  const tracked = useMemo(() => sessions.filter(s => s.system), [sessions])

  // Fall back to the fetched rows if the aggregate is unavailable (older
  // deployment without migration 0005, or a transient RPC failure) so the page
  // degrades to its previous behaviour rather than showing nothing.
  const stats = useMemo(() => {
    if (summary?.overall) return summary.overall
    const n = tracked.length
    if (!n) return { total: 0, avgScore: 0, medianScore: 0, correctRate: 0, avgSeconds: 0, medianSeconds: 0 }
    return {
      total: n,
      avgScore: Math.round(tracked.reduce((a, s) => a + s.score, 0) / n),
      medianScore: median(tracked.map(s => s.score)),
      correctRate: Math.round(tracked.filter(s => s.correct).length / n * 100),
      avgSeconds: Math.round(tracked.reduce((a, s) => a + s.elapsed_seconds, 0) / n),
      medianSeconds: median(tracked.map(s => s.elapsed_seconds)),
    }
  }, [summary, tracked])

  const totalCases = stats.total
  const avgScore = stats.avgScore
  const medianScore = totalCases ? stats.medianScore : null
  const correctRate = stats.correctRate
  const avgTimeStr = totalCases ? fmtSeconds(stats.avgSeconds) : '—'
  const medianTimeStr = totalCases ? `${Math.floor(stats.medianSeconds / 60)}m` : ''

  // Growth: last-30-day average vs the 30 days before it. Windows with fewer
  // than 3 cases don't produce a meaningful average, so the delta shows only
  // when both sides clear that bar. Computed from the fetched rows — the
  // 400-row window comfortably covers 60 days of real usage.
  const growth = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    const d30 = now - 30 * 86_400_000
    const d60 = now - 60 * 86_400_000
    const recent: number[] = []
    const prior: number[] = []
    for (const s of tracked) {
      const t = new Date(s.completed_at).getTime()
      if (t >= d30) recent.push(s.score)
      else if (t >= d60) prior.push(s.score)
    }
    const mean = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
    if (recent.length < 3) return null
    return {
      avg: mean(recent),
      n: recent.length,
      delta: prior.length >= 3 ? mean(recent) - mean(prior) : null,
    }
  }, [tracked])

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="progress" />
      <div className="dx-main">
        <div className="dx-content">

          <div>
            <h1 className="heading-display text-[22px]"><span className="heading-accent">Progress</span> over time</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              {!loaded ? ' ' : totalCases > 0 ? `${totalCases} case${totalCases !== 1 ? 's' : ''} tracked` : 'Complete your first case to start tracking progress'}
            </p>
          </div>

          {/* Reasoning & mastery — sourced from localStorage, independent of synced sessions */}
          <ReasoningProgress tier={tier} />

          {!loaded ? (
            <div className="dx-card">
              <div className="dx-card-body dx-progress-locked">
                <p>Loading your progress…</p>
              </div>
            </div>
          ) : loadError ? (
            <div className="dx-card">
              <div className="dx-card-body dx-progress-locked">
                <p>Couldn&apos;t load your progress. Refresh the page to try again.</p>
              </div>
            </div>
          ) : totalCases === 0 ? (
            <div className="dx-card">
              <EmptyState
                variant="no-cases"
                title="No progress to show yet"
                body="Complete your first case and this page fills in with score trends, per-system breakdowns, and your training activity."
                actionLabel="Start a case →"
                actionHref="/trainer"
              />
            </div>
          ) : (
            <>
              <div className="dx-stats-row">
                {[
                  { label: 'Total Cases',  value: String(totalCases), color: 'var(--text)',    tip: 'Total completed cases with a recognized system', note: undefined },
                  { label: 'Avg Rubric Score', value: `${avgScore}/100`, color: cssScore(avgScore), tip: 'Mean rubric score (0–100): combines history, test ordering, diagnosis accuracy & completeness — a wrong diagnosis can still earn partial workup credit', note: medianScore !== null ? `· median ${medianScore}` : undefined },
                  { label: 'Dx Accuracy',    value: `${correctRate}%`, color: cssScore(correctRate), tip: 'Percent of cases where the submitted diagnosis was correct — distinct from rubric score', note: undefined },
                  { label: 'Avg Time',     value: avgTimeStr,         color: 'var(--muted)',  tip: 'Average time spent per case from first question to diagnosis', note: medianTimeStr ? `· median ${medianTimeStr}` : undefined },
                  ...(growth ? [{
                    label: 'Last 30 Days',
                    value: `${growth.avg}/100`,
                    color: cssScore(growth.avg),
                    tip: `Average score over your last 30 days (${growth.n} cases)${growth.delta !== null ? ', compared with the 30 days before' : ''}`,
                    note: growth.delta === null ? `· ${growth.n} cases`
                      : growth.delta >= 0 ? `▲ +${growth.delta} vs prior 30d` : `▼ ${growth.delta} vs prior 30d`,
                  }] : []),
                ].map(({ label, value, color, tip, note }) => (
                  <div key={label} className="dx-stat-card">
                    <div className="dx-stat-label" title={tip}>{label}</div>
                    <div className="dx-stat-value" style={{ color }}>{value}</div>
                    {note && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{note}</div>}
                  </div>
                ))}
              </div>
              <ScoreOverTime sessions={tracked} />
              <ComponentScoreTrends sessions={tracked} />
              <PerformanceBreakdown sessions={tracked} tier={tier} breakdown={summary?.bySystem} />
            </>
          )}

        </div>
      </div>
    </div>
  )
}

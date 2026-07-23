'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import '@/app/dashboard.css'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { createClient } from '@/app/lib/supabase/client'
import type { GradingResult } from '@/app/grading/types'

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
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      const [{ data: p }, { data: rows, error: rowsError }] = await Promise.all([
        supabase.from('profiles').select('display_name,tier').eq('id', user.id).single(),
        supabase.from('case_sessions')
          .select('id, score, correct, system, difficulty, completed_at, elapsed_seconds, grading_result')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false }),
      ])
      if (p) {
        setDisplayName(p.display_name ?? user.email?.split('@')[0] ?? 'User')
        setTier(p.tier ?? 'free')
      }
      if (rowsError) setLoadError(true)
      setSessions((rows ?? []) as Session[])
      setLoaded(true)
    }).catch(() => {
      setLoadError(true)
      setLoaded(true)
    })
  }, [])

  // All header stats are computed over the same population: sessions with a recognized system.
  const tracked = useMemo(() => sessions.filter(s => s.system), [sessions])
  const totalCases = tracked.length

  const avgScore = useMemo(() =>
    totalCases ? Math.round(tracked.reduce((a, s) => a + s.score, 0) / totalCases) : 0,
  [tracked, totalCases])
  const medianScore = useMemo(() =>
    totalCases ? median(tracked.map(s => s.score)) : null,
  [tracked, totalCases])
  const correctRate = useMemo(() =>
    totalCases ? Math.round(tracked.filter(s => s.correct).length / totalCases * 100) : 0,
  [tracked, totalCases])
  const avgTimeStr = useMemo(() => {
    if (!totalCases) return '—'
    return fmtSeconds(Math.round(tracked.reduce((a, s) => a + s.elapsed_seconds, 0) / totalCases))
  }, [tracked, totalCases])
  const medianTimeStr = useMemo(() => {
    if (!totalCases) return ''
    return `${Math.floor(median(tracked.map(s => s.elapsed_seconds)) / 60)}m`
  }, [tracked, totalCases])

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
              <div className="dx-card-body dx-progress-locked">
                <p>Complete your first case to start seeing your progress.</p>
                <a href="/trainer" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                  Start a case →
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="dx-stats-row">
                {[
                  { label: 'Total Cases',  value: String(totalCases), color: 'var(--text)',    tip: 'Total completed cases with a recognized system', note: undefined },
                  { label: 'Avg Rubric Score', value: `${avgScore}/100`, color: cssScore(avgScore), tip: 'Mean rubric score (0–100): combines history, test ordering, diagnosis accuracy & completeness — a wrong diagnosis can still earn partial workup credit', note: medianScore !== null ? `· median ${medianScore}` : undefined },
                  { label: 'Dx Accuracy',    value: `${correctRate}%`, color: cssScore(correctRate), tip: 'Percent of cases where the submitted diagnosis was correct — distinct from rubric score', note: undefined },
                  { label: 'Avg Time',     value: avgTimeStr,         color: 'var(--muted)',  tip: 'Average time spent per case from first question to diagnosis', note: medianTimeStr ? `· median ${medianTimeStr}` : undefined },
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
              <PerformanceBreakdown sessions={tracked} tier={tier} />
            </>
          )}

        </div>
      </div>
    </div>
  )
}

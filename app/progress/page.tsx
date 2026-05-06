'use client'

import { useState, useEffect, useMemo } from 'react'
import '@/app/dashboard.css'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { createClient } from '@/app/lib/supabase/client'
import type { GradingResult } from '@/app/grading/types'
import ScoreOverTime from '@/app/components/progress/ScoreOverTime'
import ComponentScoreTrends from '@/app/components/progress/ComponentScoreTrends'
import PerformanceBreakdown from '@/app/components/progress/PerformanceBreakdown'
import ActivityCalendar from '@/app/components/progress/ActivityCalendar'

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

export default function ProgressPage() {
  const [displayName, setDisplayName] = useState('User')
  const [tier, setTier] = useState('free')
  const [sessions, setSessions] = useState<Session[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any
      const [{ data: p }, { data: rows }] = await Promise.all([
        sb.from('profiles').select('display_name,tier').eq('id', user.id).single(),
        sb.from('case_sessions')
          .select('id, score, correct, system, difficulty, completed_at, elapsed_seconds, grading_result')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false }),
      ])
      if (p) {
        setDisplayName(p.display_name ?? user.email?.split('@')[0] ?? 'User')
        setTier(p.tier ?? 'free')
      }
      setSessions(rows ?? [])
      setLoaded(true)
    })
  }, [])

  const totalCases = sessions.length
  const avgScore = useMemo(() =>
    totalCases ? Math.round(sessions.reduce((a, s) => a + s.score, 0) / totalCases) : 0,
  [sessions, totalCases])
  const correctRate = useMemo(() =>
    totalCases ? Math.round(sessions.filter(s => s.correct).length / totalCases * 100) : 0,
  [sessions, totalCases])
  const avgTimeStr = useMemo(() => {
    if (!totalCases) return '—'
    return fmtSeconds(Math.round(sessions.reduce((a, s) => a + s.elapsed_seconds, 0) / totalCases))
  }, [sessions, totalCases])

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="progress" />
      <div className="dx-main">
        <div className="dx-content">

          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Serif Display, serif' }}>
              Progress
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>Your learning trajectory over time</p>
          </div>

          {loaded && totalCases === 0 ? (
            <div className="dx-card">
              <div className="dx-card-body dx-progress-locked">
                <p>Complete your first case to start seeing your progress.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="dx-stats-row">
                {[
                  { label: 'Total Cases',  value: String(totalCases), color: 'var(--text)' },
                  { label: 'Avg Score',    value: String(avgScore),   color: cssScore(avgScore) },
                  { label: 'Correct Rate', value: `${correctRate}%`,  color: 'var(--green)' },
                  { label: 'Avg Time',     value: avgTimeStr,         color: 'var(--muted)' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="dx-stat-card">
                    <div className="dx-stat-label">{label}</div>
                    <div className="dx-stat-value" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
              <ScoreOverTime sessions={sessions} />
              <ComponentScoreTrends sessions={sessions} />
              <PerformanceBreakdown sessions={sessions} />
              <ActivityCalendar sessions={sessions} />
            </>
          )}

        </div>
      </div>
    </div>
  )
}

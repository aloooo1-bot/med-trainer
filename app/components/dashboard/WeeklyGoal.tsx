'use client'

import { useState, useEffect } from 'react'
import { DEFAULT_FOCUS_SETTINGS, loadFocusSettings, saveFocusSettings } from '@/app/lib/focusSettings'

type Session = { completed_at: string; score: number }

// Pre-consolidation the dashboard kept its own goal under this key; the single
// source of truth is now focusSettings.weeklyVolume (synced to the profile).
const LEGACY_GOAL_KEY = 'medtrainer_weekly_goal'

const DAY_MS = 86_400_000
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function thisWeekStart(): number {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diffToMon)
  mon.setHours(0, 0, 0, 0)
  return mon.getTime()
}

/** 0 = Monday … 6 = Sunday */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

function scoreColor(s: number) {
  return s < 60 ? 'var(--red)' : s < 75 ? 'var(--amber)' : 'var(--green)'
}

export default function WeeklyGoal({ sessions }: { sessions: Session[] }) {
  const [goal, setGoal] = useState(5)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('5')
  // Body renders only after the stored goal is read and the clock is the
  // client's — avoids the default-goal flash and SSR/client date mismatches.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const fs = loadFocusSettings()
    let goalValue = fs.weeklyVolume
    try {
      // One-time adoption of the legacy dashboard-only goal key: it wins only
      // if the consolidated value was never customized.
      const legacy = localStorage.getItem(LEGACY_GOAL_KEY)
      if (legacy) {
        const n = parseInt(legacy, 10)
        if (n > 0 && fs.weeklyVolume === DEFAULT_FOCUS_SETTINGS.weeklyVolume && n !== fs.weeklyVolume) {
          goalValue = n
          saveFocusSettings({ ...fs, weeklyVolume: n })
        }
        localStorage.removeItem(LEGACY_GOAL_KEY)
      }
    } catch {}
    // Mount-only hydration of the persisted weekly goal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoal(goalValue)
    setDraft(String(goalValue))
    setReady(true)
  }, [])

  const weekStart = thisWeekStart()
  const thisWeek = sessions.filter(s => new Date(s.completed_at).getTime() >= weekStart)
  const done = thisWeek.length
  const pct = Math.min(1, goal > 0 ? done / goal : 0)

  // Pace-adjusted: only count last week's sessions up to this same point in the week,
  // so a partial current week isn't compared against all of last week.
  // eslint-disable-next-line react-hooks/purity
  const samePointLastWeek = Date.now() - 7 * DAY_MS
  const lastWeekCount = sessions.filter(s => {
    const t = new Date(s.completed_at).getTime()
    return t >= weekStart - 7 * DAY_MS && t <= samePointLastWeek
  }).length
  const delta = done - lastWeekCount

  const dayCounts = Array(7).fill(0) as number[]
  for (const s of thisWeek) dayCounts[mondayIndex(new Date(s.completed_at))]++
  const todayIdx = mondayIndex(new Date())
  const activeDays = dayCounts.filter(c => c > 0).length

  const weekAvg = done ? Math.round(thisWeek.reduce((a, s) => a + s.score, 0) / done) : null

  function commit() {
    const n = parseInt(draft, 10)
    if (n > 0 && n <= 50) {
      setGoal(n)
      saveFocusSettings({ ...loadFocusSettings(), weeklyVolume: n })
      // Best-effort profile sync; adopt any server-side (free-tier) clamp so
      // this card, Settings, and the Focus week plan all agree.
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_volume: n }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then((body: { stored?: { weekly_volume?: number } } | null) => {
          const stored = body?.stored?.weekly_volume
          if (typeof stored === 'number' && stored !== n) {
            setGoal(stored)
            setDraft(String(stored))
            saveFocusSettings({ ...loadFocusSettings(), weeklyVolume: stored })
          }
        })
        .catch(() => {})
    } else {
      setDraft(String(goal))
    }
    setEditing(false)
  }

  const goalMet = done >= goal
  const doneColor = goalMet ? 'var(--green)' : done > 0 ? 'var(--accent)' : 'var(--muted)'
  const barColor  = goalMet ? 'var(--green)' : 'var(--accent)'

  return (
    <div className="dx-card dx-weekly-goal">
      <div className="dx-card-header">
        <span className="dx-card-hicon" style={{ background: 'rgba(61,152,144,0.14)', color: 'var(--accent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
          </svg>
        </span>
        Weekly goal
        {editing ? (
          <input
            className="dx-weekly-edit"
            type="number" min={1} max={50}
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit() }}
          />
        ) : (
          <button className="dx-weekly-edit-btn" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>
      {!ready ? (
        <div className="dx-card-body" style={{ minHeight: 180 }} />
      ) : (
      <div className="dx-card-body">
        <div className="dx-weekly-count">
          <span className="dx-weekly-done" style={{ color: doneColor }}>{done}</span>
          <span className="dx-weekly-sep"> / {goal}</span>
          <span className="dx-weekly-label">{goalMet ? ' cases — goal met! 🎉' : ' cases this week'}</span>
        </div>
        <div className="dx-weekly-bar">
          <div className="dx-weekly-bar-fill" style={{ width: `${pct * 100}%`, background: barColor }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 16 }}>
          {dayCounts.map((count, i) => {
            const isToday = i === todayIdx
            const isFuture = i > todayIdx
            return (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  height: 30,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  background: count > 0 ? 'rgba(61,152,144,0.14)' : 'var(--surface2)',
                  color: count > 0 ? 'var(--accent)' : 'var(--muted)',
                  border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                  opacity: isFuture ? 0.45 : 1,
                }}>
                  {count > 0 ? count : ''}
                </div>
                <div style={{
                  fontSize: 10,
                  color: isToday ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: isToday ? 700 : 400,
                  marginTop: 3,
                }}>{WEEKDAY_INITIALS[i]}</div>
              </div>
            )
          })}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--muted)',
        }}>
          <span>
            Avg score{' '}
            <strong style={{ color: weekAvg !== null ? scoreColor(weekAvg) : 'var(--muted)', fontSize: 13 }}>
              {weekAvg !== null ? weekAvg : '—'}
            </strong>
          </span>
          <span>
            Active days{' '}
            <strong style={{ color: 'var(--text)', fontSize: 13 }}>{activeDays}/7</strong>
          </span>
          <span title="Compared to last week up to this same point in the week">
            vs last week pace{' '}
            <strong style={{
              fontSize: 13,
              color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text)',
            }}>
              {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : '—'}
            </strong>
          </span>
        </div>
      </div>
      )}
    </div>
  )
}

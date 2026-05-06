'use client'

import { useState, useEffect } from 'react'

type Session = { completed_at: string }

function thisWeekStart(): number {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diffToMon)
  mon.setHours(0, 0, 0, 0)
  return mon.getTime()
}

export default function WeeklyGoal({ sessions }: { sessions: Session[] }) {
  // Phase 7 will migrate this key to profiles.weekly_case_goal
  const [goal, setGoal] = useState(5)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('5')

  useEffect(() => {
    const stored = localStorage.getItem('medtrainer_weekly_goal')
    if (stored) {
      const n = parseInt(stored, 10)
      if (n > 0) { setGoal(n); setDraft(String(n)) }
    }
  }, [])

  const weekStart = thisWeekStart()
  const done = sessions.filter(s => new Date(s.completed_at).getTime() >= weekStart).length
  const pct = Math.min(1, goal > 0 ? done / goal : 0)

  function commit() {
    const n = parseInt(draft, 10)
    if (n > 0 && n <= 50) {
      setGoal(n)
      localStorage.setItem('medtrainer_weekly_goal', String(n))
    } else {
      setDraft(String(goal))
    }
    setEditing(false)
  }

  return (
    <div className="dx-card dx-weekly-goal">
      <div className="dx-card-header">
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
      <div className="dx-card-body">
        <div className="dx-weekly-count">
          <span className="dx-weekly-done">{done}</span>
          <span className="dx-weekly-sep"> / {goal}</span>
          <span className="dx-weekly-label"> cases this week</span>
        </div>
        <div className="dx-weekly-bar">
          <div className="dx-weekly-bar-fill" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

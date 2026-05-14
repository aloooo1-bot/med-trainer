'use client'

import { useMemo } from 'react'
import { useChartTheme } from '@/app/lib/useChartTheme'

type Session = { score: number; completed_at: string }

const MIN_DAYS = 14

function dayKey(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ActivityCalendar({ sessions }: { sessions: Session[] }) {
  const theme = useChartTheme()

  const { activeMap, distinctDays } = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const s of sessions) {
      const k = dayKey(new Date(s.completed_at))
      if (!m[k]) m[k] = []
      m[k].push(s.score)
    }
    const avgMap: Record<string, number> = {}
    for (const [k, scores] of Object.entries(m)) {
      avgMap[k] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    }
    return { activeMap: avgMap, distinctDays: Object.keys(m).length }
  }, [sessions])

  if (distinctDays < MIN_DAYS) return null

  const today = new Date()
  const calDays = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (83 - i))
    return d
  })

  function hexScore(s: number) {
    return s < 60 ? theme.critical : s < 75 ? theme.caution : theme.confirmed
  }

  return (
    <div className="dx-card">
      <div className="dx-card-header">Training Activity</div>
      <div className="dx-card-body">
        <div style={{ overflowX: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 14px)',
            gridTemplateRows: 'repeat(7, 14px)',
            gap: 3,
            width: 'max-content',
          }}>
            {calDays.map((d, i) => {
              const key = dayKey(d)
              const score = activeMap[key]
              const col = Math.floor(i / 7) + 1
              const row = (i % 7) + 1
              return (
                <div
                  key={i}
                  title={score != null ? `${key}: avg ${score}` : key}
                  style={{
                    gridColumn: col,
                    gridRow: row,
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: score != null ? hexScore(score) : theme.surfaceFaint,
                    opacity: score != null ? 0.85 : 0.35,
                    cursor: score != null ? 'pointer' : 'default',
                  }}
                />
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14, fontSize: 11, color: 'var(--muted)' }}>
          <span>Less</span>
          {([theme.surfaceFaint, theme.critical, theme.caution, theme.confirmed] as const).map((bg, i) => (
            <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: bg, display: 'inline-block', opacity: i === 0 ? 0.35 : 0.85 }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

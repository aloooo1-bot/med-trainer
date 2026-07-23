'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChartTheme } from '@/app/lib/useChartTheme'
import { localDayKey } from '@/app/lib/localDay'

type Session = { score: number; completed_at: string }
type DayStats = { avg: number; count: number }

const MIN_DAYS = 14
const WEEKS = 12

function dayKey(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}


export default function ActivityCalendar({ sessions }: { sessions: Session[] }) {
  const theme = useChartTheme()
  const router = useRouter()
  // The grid is anchored to "today", so render it only on the client — the
  // server's clock/timezone could disagree and cause a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const { activeMap, distinctDays } = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const s of sessions) {
      const k = dayKey(new Date(s.completed_at))
      if (!m[k]) m[k] = []
      m[k].push(s.score)
    }
    const statsMap: Record<string, DayStats> = {}
    for (const [k, scores] of Object.entries(m)) {
      statsMap[k] = {
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        count: scores.length,
      }
    }
    return { activeMap: statsMap, distinctDays: Object.keys(m).length }
  }, [sessions])

  if (!mounted) {
    return (
      <div className="dx-card">
        <div className="dx-card-header">Training Activity</div>
        <div className="dx-card-body" style={{ minHeight: 140 }} />
      </div>
    )
  }

  if (distinctDays < MIN_DAYS) {
    const remaining = MIN_DAYS - distinctDays
    return (
      <div className="dx-card">
        <div className="dx-card-header">Training Activity</div>
        <div className="dx-card-body dx-progress-locked">
          <p>Train on {remaining} more day{remaining !== 1 ? 's' : ''} to unlock the activity calendar.</p>
        </div>
      </div>
    )
  }

  // Weekday-aligned like a contribution graph: columns are Sun-start weeks,
  // rows are days of the week, ending on today (last column is partial).
  const today = new Date()
  const totalDays = WEEKS * 7 + today.getDay() + 1
  const calDays = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (totalDays - 1 - i))
    return d
  })
  const weekCount = Math.ceil(totalDays / 7)

  const monthLabels = Array.from({ length: weekCount }, (_, w) => {
    const label = calDays[w * 7].toLocaleDateString('en-US', { month: 'short' })
    const prev = w > 0 ? calDays[(w - 1) * 7].toLocaleDateString('en-US', { month: 'short' }) : null
    return label !== prev ? label : null
  })

  const activeInWindow = calDays.some(d => activeMap[dayKey(d)] != null)

  function hexScore(s: number) {
    return s < 60 ? theme.critical : s < 75 ? theme.caution : theme.confirmed
  }

  const legendItems = [
    { bg: theme.critical, faint: false, label: '<60' },
    { bg: theme.caution, faint: false, label: '60–74' },
    { bg: theme.confirmed, faint: false, label: '≥75' },
    { bg: theme.surfaceFaint, faint: true, label: 'no cases' },
  ]

  return (
    <div className="dx-card">
      <div className="dx-card-header">Training Activity</div>
      <div className="dx-card-body">
        <div style={{
          display: 'grid',
          gridTemplateColumns: `auto repeat(${weekCount}, 1fr)`,
          gap: 4,
          alignItems: 'center',
        }}>
          {monthLabels.map((label, w) => label && (
            <span key={`m${w}`} style={{
              gridColumn: w + 2,
              gridRow: 1,
              fontSize: 10,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
            }}>{label}</span>
          ))}
          {['Mon', 'Wed', 'Fri'].map(label => (
            <span key={label} style={{
              gridColumn: 1,
              gridRow: label === 'Mon' ? 3 : label === 'Wed' ? 5 : 7,
              fontSize: 10,
              color: 'var(--muted)',
              paddingRight: 4,
            }}>{label}</span>
          ))}
          {calDays.map((d, i) => {
            const key = dayKey(d)
            const day = activeMap[key]
            const pos = {
              gridColumn: Math.floor(i / 7) + 2,
              gridRow: d.getDay() + 2,
            }
            if (!day) {
              return (
                <div
                  key={i}
                  title={key}
                  style={{
                    ...pos,
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 4,
                    background: theme.surfaceFaint,
                    opacity: 0.35,
                  }}
                />
              )
            }
            const avgLabel = `${day.avg.toFixed(1)}%`
            const tip = `${key} — avg ${avgLabel} (${day.count} case${day.count !== 1 ? 's' : ''})`
            return (
              <button
                key={i}
                type="button"
                title={tip}
                aria-label={`${tip}. View this day's history.`}
                onClick={() => router.push(`/history?date=${localDayKey(d)}`)}
                style={{
                  ...pos,
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 4,
                  border: 'none',
                  padding: 0,
                  background: hexScore(day.avg),
                  opacity: 0.85,
                  cursor: 'pointer',
                }}
              />
            )
          })}
        </div>
        {!activeInWindow && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0' }}>
            No training in the last {WEEKS} weeks — complete a case to light up the calendar.
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 11, color: 'var(--muted)' }}>
          <span>Avg score:</span>
          {legendItems.map(({ bg, faint, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, display: 'inline-block', opacity: faint ? 0.35 : 0.85 }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

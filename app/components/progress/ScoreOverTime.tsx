'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip,
} from 'chart.js'
import { useChartTheme } from '@/app/lib/useChartTheme'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip)

type Session = { score: number; system: string; completed_at: string }

const MIN_CASES = 10

function rollingAvg(scores: number[]): number[] {
  return scores.map((_, i) => {
    const w = scores.slice(Math.max(0, i - 2), i + 1)
    return Math.round(w.reduce((s, v) => s + v, 0) / w.length)
  })
}

type Range = '30d' | '90d' | 'all'

export default function ScoreOverTime({ sessions }: { sessions: Session[] }) {
  const [range, setRange] = useState<Range>('90d')
  const chronoAll = useMemo(() => [...sessions].reverse(), [sessions])
  const chronoCases = useMemo(() => {
    if (range === 'all') return chronoAll
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - (range === '30d' ? 30 : 90) * 86400_000
    return chronoAll.filter(c => new Date(c.completed_at).getTime() >= cutoff)
  }, [chronoAll, range])
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const theme = useChartTheme()

  useEffect(() => {
    if (!ref.current || chronoCases.length < MIN_CASES) return
    chartRef.current?.destroy()
    const scores = chronoCases.map(c => c.score)
    const pointColors = scores.map(s =>
      s < 60 ? theme.critical : s < 75 ? theme.caution : theme.confirmed
    )
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: chronoCases.map((_, i) => `Case ${i + 1}`),
        datasets: [
          {
            data: scores,
            borderColor: theme.primary,
            backgroundColor: theme.isDark ? 'rgba(184,196,222,0.10)' : 'rgba(19,28,40,0.10)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          {
            data: rollingAvg(scores),
            borderColor: theme.confirmed + '80',
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.4,
            backgroundColor: 'transparent',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: theme.inkTertiary, font: { size: 10 } }, grid: { color: theme.gridLine } },
          y: { min: 0, max: 100, ticks: { color: theme.inkTertiary, stepSize: 25 }, grid: { color: theme.gridLine } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => ` Score: ${ctx.parsed.y}  ·  ${chronoCases[ctx.dataIndex]?.system ?? ''}`,
          }},
        },
      },
    })
    return () => chartRef.current?.destroy()
  }, [chronoCases, theme])

  const allScores = chronoAll.map(c => c.score)
  const minScore = allScores.length ? Math.min(...allScores) : 0
  const maxScore = allScores.length ? Math.max(...allScores) : 100

  if (chronoAll.length < MIN_CASES) {
    const remaining = MIN_CASES - chronoAll.length
    return (
      <div className="dx-card">
        <div className="dx-card-header">Score Over Time</div>
        <div className="dx-card-body dx-progress-locked">
          <p>Complete {remaining} more case{remaining !== 1 ? 's' : ''} to unlock trend analysis.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dx-card">
      <div className="dx-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Score Over Time</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['30d', '90d', 'all'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)',
                  background: range === r ? 'var(--accent)' : 'transparent',
                  color: range === r ? '#fff' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                {r === 'all' ? 'All' : r}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />
              Individual score
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 18, borderTop: '2px dashed rgba(45,122,74,0.6)', display: 'inline-block' }} />
              3-case avg
            </span>
          </div>
        </div>
      </div>
      <div className="dx-card-body">
        <div style={{ position: 'relative', height: 240 }}>
          <canvas
            ref={ref}
            aria-label={`Score over time across ${chronoCases.length} cases, range ${minScore}–${maxScore}`}
          />
        </div>
      </div>
    </div>
  )
}

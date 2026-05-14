'use client'

import { useEffect, useRef, useMemo } from 'react'
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

export default function ScoreOverTime({ sessions }: { sessions: Session[] }) {
  const chronoCases = useMemo(() => [...sessions].reverse(), [sessions])
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            data: scores,
            borderColor: theme.primary,
            backgroundColor: theme.isDark ? 'rgba(184,196,222,0.10)' : 'rgba(19,28,40,0.10)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
          } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            data: rollingAvg(scores),
            borderColor: theme.confirmed + '80',
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.4,
            backgroundColor: 'transparent',
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

  if (chronoCases.length < MIN_CASES) {
    const remaining = MIN_CASES - chronoCases.length
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
      <div className="dx-card-body">
        <div style={{ position: 'relative', height: 240 }}>
          <canvas ref={ref} />
        </div>
      </div>
    </div>
  )
}

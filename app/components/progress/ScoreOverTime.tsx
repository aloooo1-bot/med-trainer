'use client'

import { useEffect, useRef, useMemo } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip,
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip)

type Session = { score: number; system: string; completed_at: string }

const MIN_CASES = 10

function rollingAvg(scores: number[]): number[] {
  return scores.map((_, i) => {
    const w = scores.slice(Math.max(0, i - 2), i + 1)
    return Math.round(w.reduce((s, v) => s + v, 0) / w.length)
  })
}

function hexScore(s: number) {
  return s < 60 ? '#f43f5e' : s < 75 ? '#f59e0b' : '#22c87d'
}

export default function ScoreOverTime({ sessions }: { sessions: Session[] }) {
  const chronoCases = useMemo(() => [...sessions].reverse(), [sessions])
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!ref.current || chronoCases.length < MIN_CASES) return
    chartRef.current?.destroy()
    const scores = chronoCases.map(c => c.score)
    const pointColors = scores.map(hexScore)
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: chronoCases.map((_, i) => `Case ${i + 1}`),
        datasets: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            data: scores,
            borderColor: '#4f9cf9',
            backgroundColor: 'rgba(79,156,249,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
          } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            data: rollingAvg(scores),
            borderColor: 'rgba(34,200,125,0.5)',
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
          x: { ticks: { color: '#6b7080', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { min: 0, max: 100, ticks: { color: '#6b7080', stepSize: 25 }, grid: { color: 'rgba(255,255,255,0.05)' } },
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
  }, [chronoCases])

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
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f9cf9', display: 'inline-block' }} />
            Individual score
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 18, borderTop: '2px dashed rgba(34,200,125,0.6)', display: 'inline-block' }} />
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

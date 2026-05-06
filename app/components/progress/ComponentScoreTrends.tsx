'use client'

import { useEffect, useRef, useMemo } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js'
import type { GradingResult } from '@/app/grading/types'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend)

type Session = { score: number; completed_at: string; grading_result: GradingResult | null }

const MIN_CASES = 10

const DIM_META = [
  { key: 'historyInterview'      as const, label: 'History & Interview', max: 18, color: '#4f9cf9' },
  { key: 'testOrdering'          as const, label: 'Test Ordering',       max: 18, color: '#f59e0b' },
  { key: 'diagnosisAccuracy'     as const, label: 'Diagnosis Accuracy',  max: 27, color: '#f43f5e' },
  { key: 'diagnosisCompleteness' as const, label: 'Completeness',        max: 13, color: '#22c87d' },
  { key: 'clinicalReasoning'     as const, label: 'Clinical Reasoning',  max: 14, color: '#a78bfa' },
]

export default function ComponentScoreTrends({ sessions }: { sessions: Session[] }) {
  const chrono = useMemo(
    () => [...sessions].reverse().filter(s => s.grading_result?.dimensions),
    [sessions]
  )
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!ref.current || sessions.length < MIN_CASES || chrono.length === 0) return
    chartRef.current?.destroy()
    const datasets = DIM_META.map(({ key, label, max, color }) => ({
      label,
      data: chrono.map(s => Math.round((s.grading_result!.dimensions![key].score / max) * 100)),
      borderColor: color,
      backgroundColor: color + '20',
      tension: 0.35,
      pointRadius: 3,
      borderWidth: 2,
      fill: false,
    }))
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: chrono.map((_, i) => `Case ${i + 1}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        datasets: datasets as any,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#6b7080', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { min: 0, max: 100, ticks: { color: '#6b7080', stepSize: 25, callback: v => `${v}%` }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { color: '#e8eaf0', font: { size: 11 }, boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true },
          },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } },
        },
      },
    })
    return () => chartRef.current?.destroy()
  }, [chrono, sessions.length])

  if (sessions.length < MIN_CASES) {
    const remaining = MIN_CASES - sessions.length
    return (
      <div className="dx-card">
        <div className="dx-card-header">Component Score Trends</div>
        <div className="dx-card-body dx-progress-locked">
          <p>Complete {remaining} more case{remaining !== 1 ? 's' : ''} to see how each scoring component is trending.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dx-card">
      <div className="dx-card-header">Component Score Trends</div>
      <div className="dx-card-body">
        <div style={{ position: 'relative', height: 280 }}>
          <canvas ref={ref} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
          Click legend items to toggle visibility.
        </p>
      </div>
    </div>
  )
}

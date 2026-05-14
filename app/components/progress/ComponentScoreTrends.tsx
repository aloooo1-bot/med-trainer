'use client'

import { useEffect, useRef, useMemo } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js'
import type { GradingResult } from '@/app/grading/types'
import { getRubric, type DimensionKey } from '@/app/grading/rubric'
import { useChartTheme } from '@/app/lib/useChartTheme'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend)

type Session = { score: number; completed_at: string; difficulty: string; grading_result: GradingResult | null }

const MIN_CASES = 10

export default function ComponentScoreTrends({ sessions }: { sessions: Session[] }) {
  const chrono = useMemo(
    () => [...sessions].reverse().filter(s => s.grading_result?.dimensions),
    [sessions]
  )
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const theme = useChartTheme()

  useEffect(() => {
    if (!ref.current || sessions.length < MIN_CASES || chrono.length === 0) return
    chartRef.current?.destroy()

    const dimColors: Record<DimensionKey, string> = {
      historyInterview:      theme.primary,
      testOrdering:          theme.caution,
      diagnosisAccuracy:     theme.critical,
      diagnosisCompleteness: theme.confirmed,
      clinicalReasoning:     theme.purple,
    }

    const allDims = getRubric('Clinical')
    const datasets = allDims.map(({ key, label }) => {
      const color = dimColors[key]
      return {
        label,
        data: chrono.map(s => {
          const rubric = getRubric(s.difficulty)
          const dimDef = rubric.find(d => d.key === key)
          if (!dimDef) return null
          const dim = s.grading_result!.dimensions![key]
          if (!dim) return null
          return Math.round((dim.score / dimDef.max) * 100)
        }),
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.35,
        pointRadius: 3,
        borderWidth: 2,
        fill: false,
        spanGaps: true,
      }
    })
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
          x: { ticks: { color: theme.inkTertiary, font: { size: 10 } }, grid: { color: theme.gridLine } },
          y: { min: 0, max: 100, ticks: { color: theme.inkTertiary, stepSize: 25, callback: v => `${v}%` }, grid: { color: theme.gridLine } },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { color: theme.inkPrimary, font: { size: 11 }, boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true },
          },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } },
        },
      },
    })
    return () => chartRef.current?.destroy()
  }, [chrono, sessions.length, theme])

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

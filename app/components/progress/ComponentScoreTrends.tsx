'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js'
import type { GradingResult } from '@/app/grading/types'
import { getRubric, type DimensionKey } from '@/app/grading/rubric'
import { useChartTheme } from '@/app/lib/useChartTheme'
import { fmtDate, dateTickIndices } from '@/app/lib/chartAxis'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend)

type Session = { score: number; system: string; completed_at: string; difficulty: string; grading_result: GradingResult | null }

const MIN_CASES = 10

export default function ComponentScoreTrends({ sessions }: { sessions: Session[] }) {
  const [system, setSystem] = useState('all')
  const chrono = useMemo(
    () => [...sessions].reverse().filter(s => s.grading_result?.dimensions),
    [sessions]
  )
  const systems = useMemo(
    () => [...new Set(chrono.map(s => s.system).filter(Boolean))].sort(),
    [chrono]
  )
  const filtered = useMemo(
    () => system === 'all' ? chrono : chrono.filter(s => s.system === system),
    [chrono, system]
  )
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const theme = useChartTheme()

  useEffect(() => {
    if (!ref.current || chrono.length < MIN_CASES || filtered.length < 2) return
    chartRef.current?.destroy()
    const labels = filtered.map(s => fmtDate(s.completed_at))
    const visibleTicks = dateTickIndices(filtered)

    const dimColors: Record<DimensionKey, string> = {
      historyInterview:      theme.primary,
      testOrdering:          theme.caution,
      diagnosisAccuracy:     theme.critical,
      diagnosisCompleteness: theme.confirmed,
      clinicalReasoning:     theme.purple,
      examinationFocus:      theme.insight,
    }

    const allDims = getRubric('Clinical')
    const datasets = allDims.map(({ key, label }) => {
      const color = dimColors[key]
      return {
        label,
        data: filtered.map(s => {
          const rubric = getRubric(s.difficulty)
          const dimDef = rubric.find(d => d.key === key)
          if (!dimDef) return null
          const dim = s.grading_result!.dimensions![key]
          if (!dim) return null
          return Math.round((dim.score / dimDef.max) * 100)
        }),
        borderColor: color,
        backgroundColor: color + '20',
        cubicInterpolationMode: 'monotone' as const,
        pointRadius: 3,
        borderWidth: 2,
        fill: false,
        spanGaps: true,
        clip: false,
      }
    })
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        datasets: datasets as any,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              color: theme.inkTertiary,
              font: { size: 10 },
              autoSkip: false,
              maxRotation: 0,
              callback: (_v, i) => visibleTicks.has(i) ? labels[i] : '',
            },
            grid: { color: theme.gridLine },
          },
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
  }, [chrono.length, filtered, theme])

  if (chrono.length < MIN_CASES) {
    const remaining = MIN_CASES - chrono.length
    return (
      <div className="dx-card">
        <div className="dx-card-header">Component Score Trends</div>
        <div className="dx-card-body dx-progress-locked">
          <p>
            Complete {remaining} more case{remaining !== 1 ? 's' : ''} with component grading to see how each scoring component is trending.
            {sessions.length >= MIN_CASES ? ' Older cases without per-component scores don’t count toward this.' : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dx-card">
      <div className="dx-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Component Score Trends</span>
        <select
          value={system}
          onChange={e => setSystem(e.target.value)}
          aria-label="Filter by system"
          style={{
            fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)',
            background: 'transparent', color: system === 'all' ? 'var(--muted)' : 'var(--text)',
            cursor: 'pointer', maxWidth: 150, fontWeight: 400,
          }}
        >
          <option value="all">All systems</option>
          {systems.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="dx-card-body">
        {filtered.length < 2 ? (
          <div className="dx-progress-locked" style={{ height: 280 }}>
            <p>Not enough {system} cases with component grading — try another system.</p>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', height: 280 }}>
              <canvas ref={ref} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
              Click legend items to toggle visibility.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

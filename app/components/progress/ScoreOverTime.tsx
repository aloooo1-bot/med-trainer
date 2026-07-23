'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import {
  Chart, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip,
} from 'chart.js'
import { useChartTheme } from '@/app/lib/useChartTheme'
import { fmtDate, dateTickIndices } from '@/app/lib/chartAxis'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip)

type Session = { score: number; system: string; completed_at: string }

const MIN_CASES = 10
// Once trends are unlocked, a narrower range only needs enough points to draw a line.
const MIN_RANGE_CASES = 2

function rollingAvg(scores: number[]): number[] {
  return scores.map((_, i) => {
    const w = scores.slice(Math.max(0, i - 2), i + 1)
    return Math.round(w.reduce((s, v) => s + v, 0) / w.length)
  })
}

type Range = '30d' | '90d' | 'all'

export default function ScoreOverTime({ sessions }: { sessions: Session[] }) {
  const [range, setRange] = useState<Range>('90d')
  const [system, setSystem] = useState('all')
  const chronoAll = useMemo(() => [...sessions].reverse(), [sessions])
  const systems = useMemo(
    () => [...new Set(sessions.map(s => s.system).filter(Boolean))].sort(),
    [sessions]
  )
  const chronoCases = useMemo(() => {
    const bySystem = system === 'all' ? chronoAll : chronoAll.filter(c => c.system === system)
    if (range === 'all') return bySystem
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - (range === '30d' ? 30 : 90) * 86400_000
    return bySystem.filter(c => new Date(c.completed_at).getTime() >= cutoff)
  }, [chronoAll, range, system])
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const theme = useChartTheme()

  useEffect(() => {
    if (!ref.current || chronoCases.length < MIN_RANGE_CASES) return
    chartRef.current?.destroy()
    const scores = chronoCases.map(c => c.score)
    const pointColors = scores.map(s =>
      s < 60 ? theme.critical : s < 75 ? theme.caution : theme.confirmed
    )
    const labels = chronoCases.map(c => fmtDate(c.completed_at))
    const visibleTicks = dateTickIndices(chronoCases)
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: scores,
            borderColor: theme.primary,
            backgroundColor: theme.isDark ? 'rgba(184,196,222,0.10)' : 'rgba(19,28,40,0.10)',
            fill: true,
            cubicInterpolationMode: 'monotone',
            pointRadius: 5,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            clip: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          {
            data: rollingAvg(scores),
            borderColor: theme.confirmed + '80',
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            cubicInterpolationMode: 'monotone',
            backgroundColor: 'transparent',
            clip: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
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
          y: { min: 0, max: 100, ticks: { color: theme.inkTertiary, stepSize: 25 }, grid: { color: theme.gridLine } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => ctx.datasetIndex === 1
              ? ` 3-case avg: ${ctx.parsed.y}`
              : ` Score: ${ctx.parsed.y}  ·  ${chronoCases[ctx.dataIndex]?.system ?? ''}`,
          }},
        },
      },
    })
    return () => chartRef.current?.destroy()
  }, [chronoCases, theme])

  const rangeScores = chronoCases.map(c => c.score)
  const minScore = rangeScores.length ? Math.min(...rangeScores) : 0
  const maxScore = rangeScores.length ? Math.max(...rangeScores) : 100

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
          <select
            value={system}
            onChange={e => setSystem(e.target.value)}
            aria-label="Filter by system"
            style={{
              fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)',
              background: 'transparent', color: system === 'all' ? 'var(--muted)' : 'var(--text)',
              cursor: 'pointer', maxWidth: 150,
            }}
          >
            <option value="all">All systems</option>
            {systems.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
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
              <span style={{ width: 18, borderTop: `2px dashed ${theme.confirmed}`, opacity: 0.6, display: 'inline-block' }} />
              3-case avg
            </span>
          </div>
        </div>
      </div>
      <div className="dx-card-body">
        {chronoCases.length < MIN_RANGE_CASES ? (
          <div className="dx-progress-locked" style={{ height: 240 }}>
            <p>
              Not enough {system === 'all' ? '' : `${system} `}cases
              {range === 'all' ? '' : ` in the last ${range === '30d' ? 30 : 90} days`}
              {' '}— try a wider range{system === 'all' ? '' : ' or another system'}.
            </p>
          </div>
        ) : (
          <div style={{ position: 'relative', height: 240 }}>
            <canvas
              ref={ref}
              aria-label={`Score over time across ${chronoCases.length} cases, range ${minScore}–${maxScore}`}
            />
          </div>
        )}
      </div>
    </div>
  )
}

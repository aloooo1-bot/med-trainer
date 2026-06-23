'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadMastery, loadCalibration, type CalibrationEntry } from '@/app/lib/reasoning/store'
import { recommendNext, isMastered, masteryKey } from '@/app/lib/reasoning/mastery'
import { calibrationSummary } from '@/app/lib/reasoning/prediction'
import type { MasteryRecord } from '@/app/lib/reasoning/types'

const SYSTEMS = [
  'Cardiovascular', 'Respiratory', 'Neurologic', 'Gastrointestinal', 'Renal',
  'Endocrine / Metabolic', 'Infectious', 'Hematologic / Oncologic',
  'Musculoskeletal', 'Psychiatric', 'Toxicologic', 'Trauma',
]
const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

function scoreColor(score: number): string {
  if (score < 60) return 'var(--red)'
  if (score < 75) return 'var(--amber)'
  return 'var(--green)'
}

export default function ReasoningProgress() {
  const [mastery, setMastery] = useState<MasteryRecord[]>([])
  const [calibration, setCalibration] = useState<CalibrationEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Mount-only load of reasoning data from localStorage (unavailable during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMastery(loadMastery())
    setCalibration(loadCalibration())
    setLoaded(true)
  }, [])

  const byKey = useMemo(() => new Map(mastery.map(m => [m.key, m])), [mastery])
  const candidates = useMemo(() => SYSTEMS.flatMap(s => DIFFICULTIES.map(d => ({ system: s, difficulty: d }))), [])
  const rec = useMemo(() => (mastery.length ? recommendNext(mastery, candidates) : null), [mastery, candidates])

  const cal = useMemo(() => {
    if (!calibration.length) return null
    return {
      avg: Math.round(calibration.reduce((a, c) => a + c.score, 0) / calibration.length),
      hitRate: Math.round((calibration.filter(c => c.topHit).length / calibration.length) * 100),
      count: calibration.length,
      recent: calibration.slice(-12),
    }
  }, [calibration])

  const confCal = useMemo(
    () => calibrationSummary(
      calibration
        .filter(c => c.confidence != null && c.correct != null)
        .map(c => ({ confidence: c.confidence!, correct: c.correct! })),
    ),
    [calibration],
  )

  const VERDICT_COLOR: Record<string, string> = {
    overconfident: 'var(--red)', underconfident: 'var(--amber)', 'well-calibrated': 'var(--green)',
  }

  if (!loaded) return null

  if (mastery.length === 0 && !cal) {
    return (
      <div className="dx-card">
        <div className="dx-card-header"><div style={{ fontWeight: 700 }}>Reasoning &amp; mastery</div></div>
        <div className="dx-card-body" style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
          Complete cases in the trainer to build per-topic mastery. Rank the differential before ordering tests to start tracking your pre-test calibration here.
        </div>
      </div>
    )
  }

  return (
    <div className="dx-card">
      <div className="dx-card-header">
        <div style={{ fontWeight: 700 }}>Reasoning &amp; mastery</div>
        {rec && (
          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
            Recommended next: <strong style={{ color: 'var(--text)' }}>{rec.system} · {rec.difficulty}</strong> — {rec.reason}
          </div>
        )}
      </div>
      <div className="dx-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Mastery grid */}
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Mastery by topic</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--muted)', fontWeight: 500 }}>System</th>
                  {DIFFICULTIES.map(d => (
                    <th key={d} style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--muted)', fontWeight: 500 }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYSTEMS.map(sys => (
                  <tr key={sys} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{sys}</td>
                    {DIFFICULTIES.map(d => {
                      const m = byKey.get(masteryKey(sys, d))
                      if (!m) return <td key={d} style={{ textAlign: 'center', color: 'var(--muted)' }}>—</td>
                      return (
                        <td key={d} style={{ textAlign: 'center', padding: '6px 8px' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: scoreColor(m.score) }}>{m.score}</span>
                          {isMastered(m) && <span title="Mastered" style={{ marginLeft: 4, color: 'var(--green)' }}>✓</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Calibration */}
        {cal && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>Pre-test calibration</div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(cal.avg) }}>{cal.avg}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/100</span></div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>avg ranking agreement</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{cal.hitRate}%</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>top-pick correct</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{cal.count}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>predictions made</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }} title="Recent prediction scores">
                {cal.recent.map((c, i) => (
                  <div key={i} title={`${c.score}/100${c.topHit ? ' · top pick correct' : ''}`}
                    style={{ width: 8, height: `${Math.max(4, c.score * 0.4)}px`, background: scoreColor(c.score), borderRadius: 2, opacity: 0.85 }} />
                ))}
              </div>
            </div>
            {confCal && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.6 }}>
                Confidence calibration: you average <strong style={{ color: 'var(--text)' }}>{confCal.avgConfidence}%</strong> confidence
                but your top pick is right <strong style={{ color: 'var(--text)' }}>{confCal.actualAccuracy}%</strong> of the time —{' '}
                <strong style={{ color: VERDICT_COLOR[confCal.verdict] }}>{confCal.verdict}</strong>
                {' '}(Brier {confCal.brier}, {confCal.n} rated).
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

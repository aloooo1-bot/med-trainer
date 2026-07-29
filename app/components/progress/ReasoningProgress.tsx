'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { loadMastery, loadCalibration, type CalibrationEntry } from '@/app/lib/reasoning/store'
import { syncReasoning } from '@/app/lib/reasoning/sync'
import { MasteryBodyMap } from './MasteryBodyMap'
import { recommendNext, isMastered, masteryKey } from '@/app/lib/reasoning/mastery'
import { calibrationSummary, reliabilityBuckets, type ReliabilityBucket } from '@/app/lib/reasoning/prediction'
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

/**
 * Reliability diagram: stated confidence (x) against actual accuracy (y),
 * with the perfect-calibration diagonal.
 *
 * The two failure modes are shaded rather than left to be inferred from which
 * side of a dashed line a dot sits on — below the diagonal is overconfidence
 * (the clinically dangerous one: you believed yourself more than the evidence
 * warranted), above it is underconfidence. The curve draws itself and the
 * bands land in confidence order, so the shape of the miscalibration reads as
 * a movement rather than a static scatter.
 */
function ReliabilityDiagram({ buckets, verdict }: { buckets: ReliabilityBucket[]; verdict?: string }) {
  const W = 264, H = 232
  const padL = 34, padR = 12, padT = 12, padB = 30
  const px = (c: number) => padL + (c / 100) * (W - padL - padR)
  const py = (a: number) => H - padB - (a / 100) * (H - padB - padT)

  const pts = buckets.map(b => ({ ...b, x: px(b.mid), y: py(b.accuracy) }))
  // Path length computed arithmetically (no DOM measurement) so the draw-in
  // dash offset is correct on first paint, including during SSR hydration.
  const pathLen = pts.reduce((sum, p, i) =>
    i === 0 ? 0 : sum + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y), 0)

  const summary = buckets.length
    ? `Reliability diagram. ${buckets.map(b => `${b.lo} to ${b.hi} percent confidence: ${b.accuracy} percent accurate over ${b.n} prediction${b.n === 1 ? '' : 's'}`).join('. ')}.${verdict ? ` Overall ${verdict}.` : ''}`
    : 'Reliability diagram: no rated predictions yet.'

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
        Reliability — each dot is a confidence band; dot size is how many predictions it holds.
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label={summary}>
        {/* Failure-mode regions, split by the diagonal. */}
        <polygon
          points={`${px(0)},${py(0)} ${px(100)},${py(0)} ${px(100)},${py(100)}`}
          fill="var(--red)" opacity="0.06"
        />
        <polygon
          points={`${px(0)},${py(0)} ${px(0)},${py(100)} ${px(100)},${py(100)}`}
          fill="var(--amber)" opacity="0.05"
        />
        <text x={px(72)} y={py(28)} fontSize="8" fill="var(--red)" opacity="0.75" textAnchor="middle">overconfident</text>
        <text x={px(28)} y={py(76)} fontSize="8" fill="var(--amber)" opacity="0.8" textAnchor="middle">underconfident</text>

        {/* Ticks */}
        {[0, 50, 100].map(v => (
          <g key={v}>
            <text x={px(v)} y={H - padB + 12} fontSize="8" fill="var(--muted)" textAnchor="middle">{v}</text>
            <text x={padL - 6} y={py(v) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{v}</text>
          </g>
        ))}

        {/* Axes */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--border)" strokeWidth="1" />
        <line x1={padL} y1={H - padB} x2={padL} y2={padT} stroke="var(--border)" strokeWidth="1" />

        {/* Perfect calibration */}
        <line
          x1={px(0)} y1={py(0)} x2={px(100)} y2={py(100)}
          stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 3" opacity="0.55"
        />

        {/* The student's curve, drawing itself in confidence order */}
        {pts.length > 1 && (
          <polyline
            className="animate-draw-in"
            points={pts.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="var(--accent)" strokeWidth="1.75" opacity="0.75"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={pathLen} strokeDashoffset={pathLen}
          />
        )}

        {/* Bands — radius encodes sample size by area (sqrt), not linearly. */}
        {pts.map((p, i) => {
          const calibrated = Math.abs(p.mid - p.accuracy) <= 10
          return (
            <circle
              key={p.lo}
              className="animate-fade-in"
              style={{ animationDelay: `${300 + i * 90}ms` }}
              cx={p.x} cy={p.y} r={3 + Math.min(5, Math.sqrt(p.n) * 1.6)}
              fill={calibrated ? 'var(--green)' : p.accuracy < p.mid ? 'var(--red)' : 'var(--amber)'}
              stroke="var(--surface)" strokeWidth="1.25" opacity="0.9"
            >
              <title>{`${p.lo}-${p.hi}% confidence → ${p.accuracy}% accurate (${p.n} prediction${p.n === 1 ? '' : 's'})`}</title>
            </circle>
          )
        })}

        {/* Axis labels */}
        <text x={(W + padL) / 2} y={H - 4} fontSize="9" fill="var(--muted)" textAnchor="middle">Stated confidence</text>
        <text
          x={11} y={(H - padB + padT) / 2} fontSize="9" fill="var(--muted)" textAnchor="middle"
          transform={`rotate(-90 11 ${(H - padB + padT) / 2})`}
        >Actual accuracy</text>
      </svg>
    </div>
  )
}

export default function ReasoningProgress({ tier = 'free' }: { tier?: string }) {
  const [mastery, setMastery] = useState<MasteryRecord[]>([])
  const [calibration, setCalibration] = useState<CalibrationEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Pull + union-merge the account copy first (no-op signed-out/offline),
    // then read the merged local state.
    ;(async () => {
      await syncReasoning()
      if (cancelled) return
      setMastery(loadMastery())
      setCalibration(loadCalibration())
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [])

  const byKey = useMemo(() => new Map(mastery.map(m => [m.key, m])), [mastery])
  const attemptedSystems = useMemo(
    () => SYSTEMS.filter(sys => DIFFICULTIES.some(d => byKey.has(masteryKey(sys, d)))),
    [byKey]
  )
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

  const buckets = useMemo(
    () => reliabilityBuckets(
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
        {rec && (() => {
          // Free accounts train at Foundations only — recommend what's launchable.
          const recDifficulty = tier === 'pro' ? rec.difficulty : 'Foundations'
          return (
            <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
              Recommended next: <strong style={{ color: 'var(--text)' }}>{rec.system} · {recDifficulty}</strong> — {rec.reason}{' '}
              <Link
                href={`/trainer?system=${encodeURIComponent(rec.system)}&difficulty=${encodeURIComponent(recDifficulty)}`}
                style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
              >
                Start →
              </Link>
            </div>
          )
        })()}
      </div>
      <div className="dx-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Body map — mastery as anatomy. The table below keeps the
            per-difficulty breakdown the figure can't express. */}
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>Coverage</div>
          <MasteryBodyMap records={mastery} tier={tier} />
        </div>

        {/* Mastery grid — only systems with at least one attempt */}
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Mastery by topic</div>
          {attemptedSystems.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              No mastery data yet — complete cases in the trainer to build per-topic mastery.
            </p>
          ) : (
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
                  {attemptedSystems.map(sys => (
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
          )}
          {attemptedSystems.length > 0 && attemptedSystems.length < SYSTEMS.length && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              +{SYSTEMS.length - attemptedSystems.length} system{SYSTEMS.length - attemptedSystems.length !== 1 ? 's' : ''} not yet attempted
            </div>
          )}
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
            {buckets.length > 0 && <ReliabilityDiagram buckets={buckets} verdict={confCal?.verdict} />}
          </div>
        )}

        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
          Reasoning data syncs to your account when signed in; signed out it lives only in this browser.
        </div>

      </div>
    </div>
  )
}

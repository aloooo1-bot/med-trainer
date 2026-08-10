'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { loadMastery, loadCalibration, loadReviewItems, loadStreak, type CalibrationEntry } from '@/app/lib/reasoning/store'
import { syncReasoning } from '@/app/lib/reasoning/sync'
import { MasteryBodyMap } from './MasteryBodyMap'
import { isMastered } from '@/app/lib/reasoning/mastery'
import { calibrationSummary, reliabilityBuckets, type ReliabilityBucket } from '@/app/lib/reasoning/prediction'
import { dueCount } from '@/app/lib/reasoning/spacedRepetition'
import { localDayKey, localDayKeyOffset } from '@/app/lib/localDay'
import type { MasteryRecord, ReviewItem } from '@/app/lib/reasoning/types'

const SYSTEMS = [
  'Cardiovascular', 'Respiratory', 'Neurologic', 'Gastrointestinal', 'Renal',
  'Endocrine / Metabolic', 'Infectious', 'Hematologic / Oncologic',
  'Musculoskeletal', 'Psychiatric', 'Toxicologic', 'Trauma',
]
const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

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
  const [deck, setDeck] = useState<ReviewItem[]>([])
  const [due, setDue] = useState(0)
  const [streak, setStreak] = useState(0)
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
      const items = loadReviewItems()
      const now = Date.now()
      setDeck(items)
      setDue(dueCount(items, now))
      // A streak is only alive if the last review was today or yesterday.
      const s = loadStreak()
      setStreak(s.lastDay === localDayKey(now) || s.lastDay === localDayKeyOffset(now, 1) ? s.streak : 0)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [])

  const masteredCount = useMemo(() => mastery.filter(isMastered).length, [mastery])
  const totalSlots = SYSTEMS.length * DIFFICULTIES.length

  const retention = useMemo(() => {
    if (!deck.length) return null
    return {
      total: deck.length,
      mature: deck.filter(i => i.intervalDays >= 21).length, // same bar as the deck browser
      due,
    }
  }, [deck, due])

  const cal = useMemo(() => {
    if (!calibration.length) return null
    return {
      hitRate: Math.round((calibration.filter(c => c.topHit).length / calibration.length) * 100),
      count: calibration.length,
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
      </div>
      <div className="dx-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Body map — mastery as anatomy. Per-system mastered slots live in its
            tooltips; per-difficulty averages live in Performance Breakdown. */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Coverage</div>
            <div
              title="Mastered = score ≥ 80 with 3+ attempts and a 2+ correct streak at that system × difficulty"
              style={{ fontSize: 11, color: masteredCount > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}
            >
              {masteredCount} of {totalSlots} topic-tiers mastered
            </div>
          </div>
          <MasteryBodyMap records={mastery} tier={tier} />
        </div>

        {/* Retention — the deck is the durable-learning evidence */}
        {retention && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Retention</div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{retention.total}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>cards in deck</div>
              </div>
              <div title="Review interval of 3+ weeks — reliably remembered">
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{retention.mature}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>mature</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: retention.due > 0 ? 'var(--amber)' : 'var(--text)' }}>{retention.due}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>due now</div>
              </div>
              <div title="Consecutive days with at least one review">
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{streak}<span style={{ fontSize: 12, color: 'var(--muted)' }}> day{streak !== 1 ? 's' : ''}</span></div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>review streak</div>
              </div>
              <Link
                href="/recall"
                style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
                  background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.2)',
                  borderRadius: 6, padding: '5px 12px', alignSelf: 'center',
                }}
              >
                Review →
              </Link>
            </div>
          </div>
        )}

        {/* Calibration — one verdict sentence + the reliability diagram */}
        {cal && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>Pre-test calibration</div>
            {confCal ? (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
                You average <strong style={{ color: 'var(--text)' }}>{confCal.avgConfidence}%</strong> confidence
                and your top pick is right <strong style={{ color: 'var(--text)' }}>{confCal.actualAccuracy}%</strong> of the time —{' '}
                <strong style={{ color: VERDICT_COLOR[confCal.verdict] }}>{confCal.verdict}</strong>.
                Top pick correct on <strong style={{ color: 'var(--text)' }}>{cal.hitRate}%</strong> of {cal.count} prediction{cal.count !== 1 ? 's' : ''} overall
                {' '}(Brier {confCal.brier}, {confCal.n} rated).
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
                Top pick correct on <strong style={{ color: 'var(--text)' }}>{cal.hitRate}%</strong> of {cal.count} prediction{cal.count !== 1 ? 's' : ''}.
                Rate your confidence when committing a prediction to unlock the reliability diagram.
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

'use client'

import { useState, useEffect, useMemo } from 'react'
import '@/app/dashboard.css'
import { MOCK_CASES, MOCK_SYSTEMS } from '@/app/lib/dashboardData'
import { fractionToPercent } from '@/app/lib/scoreColor'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { createClient } from '@/app/lib/supabase/client'
import {
  DEFAULT_FOCUS_SETTINGS,
  type FocusSettings,
  type FocusSkips,
  estimateMinutes,
  generateWeekPlan,
  isSkipped,
  loadFocusSettings,
  loadFocusSkips,
  saveFocusSkip,
} from '@/app/lib/focusSettings'
import { useChartTheme } from '@/app/lib/useChartTheme'
import { useRouter } from 'next/navigation'

function cssScore(score: number): string {
  if (score < 60) return 'var(--red)'
  if (score < 75) return 'var(--amber)'
  return 'var(--green)'
}

const CAT_KEYS = ['history', 'testing', 'diagnosis', 'completeness', 'reasoning'] as const
const CAT_LABELS: Record<typeof CAT_KEYS[number], string> = {
  history: 'History & Interview',
  testing: 'Test Ordering',
  diagnosis: 'Diagnosis Accuracy',
  completeness: 'Completeness',
  reasoning: 'Clinical Reasoning',
}
const CAT_INSIGHT: Record<typeof CAT_KEYS[number], string> = {
  history:      'You miss asking about bone pain, prior fractures, and infection history',
  testing:      'Missing SPEP/UPEP, skeletal survey, and staging workup',
  diagnosis:    'Correct organ system but wrong primary etiology in 3 of 6 cases',
  completeness: 'Diagnoses lack downstream complications and staging',
  reasoning:    'Malignancy dismissed too quickly when WBC is normal',
}

const MISSED_PATTERNS = [
  { theme: 'Bone & skeletal symptoms',    count: 3, example: '"Pain in ribs, hips, or other bones?"',  systems: ['Neurologic', 'Hematologic'] },
  { theme: 'Infection susceptibility',    count: 2, example: '"Unusually susceptible to infections?"',  systems: ['Hematologic'] },
  { theme: 'Fluid/electrolyte symptoms',  count: 2, example: '"Increased thirst or urination?"',        systems: ['Hematologic', 'Endocrine'] },
  { theme: 'Bipolar / prior mood episodes', count: 1, example: '"Prior manic episodes?"',               systems: ['Psychiatric'] },
  { theme: 'DVT/PE risk factors',         count: 1, example: '"Leg swelling or calf tenderness?"',     systems: ['Respiratory'] },
  { theme: 'Prior cardiac procedures',    count: 1, example: '"Prior PCI or CABG history?"',            systems: ['Cardiovascular'] },
]

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export default function FocusAreasPage() {
  const router = useRouter()
  const theme = useChartTheme()
  const LEVEL_COLOR: Record<string, string> = {
    Foundations: theme.primary,
    Clinical: theme.caution,
    Advanced: theme.purple,
  }
  const [displayName, setDisplayName] = useState('User')
  const [tier, setTier] = useState('free')
  const [settings, setSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS)
  const [skips, setSkips] = useState<FocusSkips>({})

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('display_name,tier').eq('id', user.id).single()
        .then(({ data: p }) => {
          if (!p) return
          setDisplayName(p.display_name ?? user.email?.split('@')[0] ?? 'User')
          setTier(p.tier ?? 'free')
        })
    })
  }, [])

  useEffect(() => {
    setSettings(loadFocusSettings())
    setSkips(loadFocusSkips())
  }, [])

  const prioritized = useMemo(() =>
    MOCK_SYSTEMS
      .filter(s => s.count > 0)
      .filter(s => !isSkipped(s.name, skips))
      .map(s => ({
        ...s,
        urgency: Math.round((100 - s.score) * (s.count === 1 ? 1.2 : 1)),
      }))
      .sort((a, b) => b.urgency - a.urgency),
    [skips]
  )

  const weekPlan = useMemo(() => generateWeekPlan(prioritized, settings), [prioritized, settings])

  function handleSkip(systemName: string) {
    if (!window.confirm(`Skip ${systemName} from your queue for 14 days?`)) return
    saveFocusSkip(systemName)
    setSkips(loadFocusSkips())
  }

  const categoryLoss = useMemo(() =>
    CAT_KEYS.map(key => {
      const losses = MOCK_CASES.map(c => 100 - fractionToPercent(c.scorecard[key]))
      return {
        key,
        label: CAT_LABELS[key],
        avgLoss: Math.round(losses.reduce((s, v) => s + v, 0) / losses.length),
      }
    }).sort((a, b) => b.avgLoss - a.avgLoss),
    []
  )

  const missedDiagnoses = useMemo(() =>
    MOCK_CASES.filter(c => !c.correct).map(c => ({
      correctDx: c.correctDx,
      yourDx: c.yourDx,
      system: c.system,
      score: c.score,
      teaching: c.teaching,
    })),
    []
  )

  const todayDay = new Date().getDay() // 0=Sun

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="focus-areas" />
      <div className="dx-main">
        <div className="dx-content">

          {/* Title */}
          <div>
            <h1 className="heading-display text-[22px]"><span className="heading-accent">Focus</span> areas</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>What to study next and why</p>
          </div>

          {/* Priority Queue */}
          <div className="dx-card">
            <div className="dx-card-header">
              <div style={{ fontWeight: 700 }}>Your Study Queue</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                Systems ranked by urgency — gap from 100, boosted if only one case on record.
                Tier shown is the recommended next attempt based on your current score.
              </div>
            </div>
            <div style={{ padding: '4px 0' }}>
              {prioritized.map((s, i) => {
                const urgency = s.urgency > 50 ? 'HIGH' : s.urgency > 25 ? 'MED' : 'LOW'
                const urgencyLabel = urgency === 'LOW' ? 'STRONG' : urgency
                const urgencyColor = urgency === 'HIGH' ? 'var(--red)' : urgency === 'MED' ? 'var(--amber)' : 'var(--green)'
                const urgencyBg   = urgency === 'HIGH' ? 'var(--critical-bg)' : urgency === 'MED' ? 'var(--caution-bg)' : 'var(--confirmed-bg)'
                const recLevel = s.score < 60 ? 'Foundations' : s.score < 80 ? 'Clinical' : 'Advanced'
                const recCases = Math.min(3, Math.max(1, Math.ceil(s.urgency / 30)))
                const recMinutes = estimateMinutes(s.name, recCases)
                return (
                  <div key={s.name} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 24px', borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--muted)', width: 28, flexShrink: 0 }}>
                      #{i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
                        ~{recCases} {recCases === 1 ? 'case' : 'cases'}, ~{recMinutes} min
                      </div>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: urgencyColor, flexShrink: 0 }}>
                      {s.score}
                    </span>
                    <span
                      title={urgency === 'HIGH' ? 'Urgency > 50 — high priority' : urgency === 'MED' ? 'Urgency 25–50 — medium priority' : 'Urgency ≤ 25 — strong; minimal practice need'}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                        color: urgencyColor, background: urgencyBg, flexShrink: 0,
                      }}>
                      {urgencyLabel}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                      color: 'var(--text-secondary)', background: 'var(--surface3)', flexShrink: 0,
                    }}>
                      {recLevel}
                    </span>
                    <button
                      onClick={() => router.push('/trainer')}
                      style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--accent)',
                        background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.2)',
                        borderRadius: 6, padding: '5px 12px', cursor: 'pointer', flexShrink: 0,
                        fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      Start Case →
                    </button>
                    <button
                      onClick={() => handleSkip(s.name)}
                      title={`Skip ${s.name} for 14 days`}
                      aria-label={`Skip ${s.name} for 14 days`}
                      style={{
                        fontSize: 16, lineHeight: 1, fontWeight: 500, color: 'var(--muted)',
                        background: 'transparent', border: '1px solid var(--border)',
                        borderRadius: 6, width: 26, height: 26, padding: 0, cursor: 'pointer',
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
              {prioritized.length === 0 && (
                <div style={{ padding: '20px 24px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  No systems in your queue right now.
                </div>
              )}
            </div>
          </div>

          {/* Two-column */}
          <div className="dx-grid2">
            {/* Failure Mode Analysis */}
            <div className="dx-card">
              <div className="dx-card-header">Where You&apos;re Losing Points</div>
              <div style={{ padding: '8px 0' }}>
                {categoryLoss.map(({ key, label, avgLoss }) => {
                  const lossColor = avgLoss > 40 ? theme.critical : avgLoss > 20 ? theme.caution : theme.confirmed
                  return (
                    <div key={key} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: lossColor }}>
                          {avgLoss < 5 ? 'Good — minimal loss' : `Avg loss: ${avgLoss}%`}
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--surface3)', overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', width: `${avgLoss}%`, borderRadius: 3, background: lossColor }} />
                      </div>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        {CAT_INSIGHT[key as typeof CAT_KEYS[number]]}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Missed Questions */}
            <div className="dx-card">
              <div className="dx-card-header">Patterns in What You Miss</div>
              <div style={{ padding: '8px 0' }}>
                {MISSED_PATTERNS.map((p, i) => (
                  <div key={i} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.theme}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginLeft: 8,
                        color: p.count >= 2 ? theme.critical : theme.caution,
                        background: p.count >= 2 ? 'var(--critical-bg)' : 'var(--caution-bg)',
                      }}>
                        Missed {p.count}×
                      </span>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--muted)', fontStyle: 'italic', marginBottom: 6 }}>
                      {p.example}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {p.systems.map(sys => (
                        <span key={sys} style={{
                          fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4,
                          color: 'var(--muted)', background: 'var(--surface3)',
                        }}>
                          {sys.split(' / ')[0]}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Differential Gaps */}
          <div className="dx-card">
            <div className="dx-card-header">
              <div style={{ fontWeight: 700 }}>Diagnoses You&apos;ve Never Landed</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                Correct diagnoses from your incorrect cases — recognize these patterns
              </div>
            </div>
            <div className="dx-card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {missedDiagnoses.map((d, i) => (
                  <div key={i} style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{d.correctDx}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, color: 'var(--muted)', background: 'var(--surface3)', flexShrink: 0, marginLeft: 8 }}>
                        {d.system.split(' / ')[0]}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>
                      You said: <span style={{ fontStyle: 'italic' }}>{d.yourDx}</span>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {d.teaching}
                    </p>
                    <button
                      onClick={() => router.push('/trainer')}
                      style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                        background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.2)',
                        borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      Study this →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Weekly Plan */}
          <div className="dx-card">
            <div className="dx-card-header">
              <div style={{ fontWeight: 700 }}>This Week&apos;s Training Plan</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                Generated from your weak areas + preferences
              </div>
            </div>
            <div className="dx-card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
                {weekPlan.map(({ day, task, level, reason }) => {
                  const isToday = DAY_INDEX[day] === todayDay
                  return (
                    <div key={day} style={{
                      border: isToday ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 8, overflow: 'hidden',
                    }}>
                      <div style={{
                        padding: '6px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                        color: isToday ? 'var(--accent)' : 'var(--muted)',
                        background: isToday ? 'rgba(79,156,249,0.08)' : 'var(--surface2)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        {day}
                      </div>
                      <div style={{ padding: '10px 8px', background: 'var(--surface2)' }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: task === 'Rest day' || task === 'Free choice' ? 'var(--muted)' : 'var(--text)',
                          marginBottom: level ? 6 : 4,
                        }}>
                          {task}
                        </div>
                        {level && (
                          <div style={{
                            fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 3, display: 'inline-block',
                            color: LEVEL_COLOR[level], background: 'var(--surface3)', marginBottom: 6,
                          }}>
                            {level}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.4 }}>{reason}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Complete 5+ cases this week to unlock Advanced-level Neurologic cases.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

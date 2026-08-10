'use client'

import { useState, useEffect, useMemo } from 'react'
import '@/app/dashboard.css'
import { scoreColor } from '@/app/lib/scoreColor'
import type { SystemEntry } from '@/app/lib/dashboardData'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { EmptyState } from '@/app/components/EmptyState'
import { createClient } from '@/app/lib/supabase/client'
import { normalizeMissedQuestions, type GradingResult } from '@/app/grading/types'
import { getRubric, type DimensionKey } from '@/app/grading/rubric'
import {
  DEFAULT_FOCUS_SETTINGS,
  type FocusSettings,
  type FocusSkips,
  isSkipped,
  loadFocusSettings,
  loadFocusSkips,
  saveFocusSkip,
} from '@/app/lib/focusSettings'
import { recommendedTier, urgencyOf } from '@/app/lib/nextCase'
import { loadReviewItems } from '@/app/lib/reasoning/store'
import { dueItems } from '@/app/lib/reasoning/spacedRepetition'
import type { ReviewItem } from '@/app/lib/reasoning/types'
import { useChartTheme } from '@/app/lib/useChartTheme'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Session = {
  id: string
  score: number
  correct: boolean
  system: string
  difficulty: string
  completed_at: string
  elapsed_seconds: number
  user_diagnosis: string | null
  diagnosis: string
  grading_result: GradingResult | null
}

const DIM_DESCRIPTION: Record<DimensionKey, string> = {
  historyInterview:      'Symptom, risk-factor, and background questions elicited during the interview',
  testOrdering:          'Choosing the right labs and imaging without shotgunning',
  diagnosisAccuracy:     'Landing the correct primary diagnosis',
  diagnosisCompleteness: 'Specificity, staging, and downstream complications in the submitted diagnosis',
  clinicalReasoning:     'How well the written reasoning ties findings to the differential',
  examinationFocus:      'Examining the body regions the presentation actually points to',
}

function computeSystems(sessions: Session[]): SystemEntry[] {
  const map: Record<string, { scoreSum: number; count: number }> = {}
  for (const s of sessions) {
    if (!s.system) continue
    if (!map[s.system]) map[s.system] = { scoreSum: 0, count: 0 }
    map[s.system].scoreSum += s.score
    map[s.system].count++
  }
  return Object.entries(map).map(([name, { scoreSum, count }]) => ({
    name, count, score: Math.round(scoreSum / count),
  }))
}

export default function FocusAreasPage() {
  const router = useRouter()
  const theme = useChartTheme()
  const [displayName, setDisplayName] = useState('User')
  const [tier, setTier] = useState('free')
  const [settings, setSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS)
  const [skips, setSkips] = useState<FocusSkips>({})
  const [sessions, setSessions] = useState<Session[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState<string | null>(null)
  const [dueCards, setDueCards] = useState<ReviewItem[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      const [{ data: p }, { data: rows, error: rowsError }] = await Promise.all([
        supabase.from('profiles').select('display_name,tier').eq('id', user.id).single(),
        supabase.from('case_sessions')
          .select('id, score, correct, system, difficulty, completed_at, elapsed_seconds, user_diagnosis, diagnosis, grading_result')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false }),
      ])
      if (p) {
        setDisplayName(p.display_name ?? user.email?.split('@')[0] ?? 'User')
        setTier(p.tier ?? 'free')
      }
      if (rowsError) setLoadError(true)
      setSessions((rows ?? []) as Session[])
      setLoaded(true)
    }).catch(() => {
      setLoadError(true)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    // Mount-only load of focus settings/skips/due cards from localStorage (unavailable during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadFocusSettings())
    setSkips(loadFocusSkips())
    setDueCards(dueItems(loadReviewItems(), Date.now()))
  }, [])

  const systems = useMemo(() => computeSystems(sessions), [sessions])

  const prioritized = useMemo(() =>
    systems
      .filter(s => s.count > 0)
      .filter(s => !isSkipped(s.name, skips))
      .map(s => ({ ...s, urgency: urgencyOf(s) }))
      .sort((a, b) => b.urgency - a.urgency),
    [systems, skips]
  )

  const isPro = tier === 'pro'

  // Cases completed since the start of the current week (Monday), for the
  // Up-next pace counter — same week boundary as the dashboard WeeklyGoal.
  const completedThisWeek = useMemo(() => {
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    return sessions.filter(s => new Date(s.completed_at).getTime() >= monday.getTime()).length
  }, [sessions])

  // Due recall cards grouped by system, weak-queue systems first so the
  // breakdown leads with what this page already says needs work.
  const dueBySystem = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of dueCards) counts.set(c.system, (counts.get(c.system) ?? 0) + 1)
    const queueRank = new Map(prioritized.map((s, i) => [s.name, i]))
    return [...counts.entries()]
      .sort((a, b) => (queueRank.get(a[0]) ?? 99) - (queueRank.get(b[0]) ?? 99) || b[1] - a[1])
  }, [dueCards, prioritized])

  function handleSkip(systemName: string) {
    if (confirmSkip !== systemName) {
      setConfirmSkip(systemName)
      setTimeout(() => setConfirmSkip(c => (c === systemName ? null : c)), 4000)
      return
    }
    saveFocusSkip(systemName)
    setSkips(loadFocusSkips())
    setConfirmSkip(null)
  }

  // Average points lost per rubric dimension, over graded sessions whose
  // difficulty actually includes that dimension.
  const categoryLoss = useMemo(() => {
    const acc: Partial<Record<DimensionKey, { lossSum: number; n: number; label: string }>> = {}
    for (const s of sessions) {
      const dims = s.grading_result?.dimensions
      if (!dims) continue
      for (const { key, label, max } of getRubric(s.difficulty)) {
        const dim = dims[key]
        if (!dim || max <= 0) continue
        if (!acc[key]) acc[key] = { lossSum: 0, n: 0, label }
        acc[key]!.lossSum += ((max - dim.score) / max) * 100
        acc[key]!.n++
      }
    }
    return (Object.entries(acc) as [DimensionKey, { lossSum: number; n: number; label: string }][])
      .map(([key, { lossSum, n, label }]) => ({ key, label, n, avgLoss: Math.round(lossSum / n) }))
      .sort((a, b) => b.avgLoss - a.avgLoss)
  }, [sessions])

  // Most recent missed interview questions, with recurrence counts.
  const missedPatterns = useMemo(() => {
    const seen = new Map<string, { question: string; count: number; systems: Set<string> }>()
    for (const s of sessions) {
      // Normalised because older grades stored bare strings and newer ones
      // carry the nearest thing the student asked. Recurrence is keyed on the
      // question alone — the same gap is the same gap however it was phrased
      // back to them.
      for (const { question } of normalizeMissedQuestions(s.grading_result?.missedQuestions)) {
        const key = question.toLowerCase().trim()
        if (!seen.has(key)) seen.set(key, { question, count: 0, systems: new Set() })
        const e = seen.get(key)!
        e.count++
        if (s.system) e.systems.add(s.system)
      }
    }
    return [...seen.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(e => ({ question: e.question, count: e.count, systems: [...e.systems] }))
  }, [sessions])

  // Correct diagnoses from incorrect cases, deduped, most recent first.
  const missedDiagnoses = useMemo(() => {
    const seen = new Set<string>()
    const out: { correctDx: string; yourDx: string; system: string; difficulty: string; teaching: string | null }[] = []
    for (const s of sessions) {
      if (s.correct || !s.diagnosis || seen.has(s.diagnosis)) continue
      seen.add(s.diagnosis)
      out.push({
        correctDx: s.diagnosis,
        yourDx: s.user_diagnosis ?? '—',
        system: s.system,
        difficulty: s.difficulty,
        teaching: s.grading_result?.teachingPoints?.[0] ?? null,
      })
      if (out.length >= 8) break
    }
    return out
  }, [sessions])

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="focus-areas" />
      <div className="dx-main">
        <div className="dx-content">

          {/* Title */}
          <div>
            <h1 className="heading-display text-[22px]"><span className="heading-accent">Focus</span> areas</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              What to study next and why — computed from your completed cases
            </p>
          </div>

          {!loaded ? (
            <div className="dx-card">
              <div className="dx-card-body dx-progress-locked">
                <p>Analyzing your cases…</p>
              </div>
            </div>
          ) : loadError ? (
            <div className="dx-card">
              <div className="dx-card-body dx-progress-locked">
                <p>Couldn&apos;t load your case data. Refresh the page to try again.</p>
              </div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="dx-card">
              <EmptyState
                variant="not-enough-data"
                title="Nothing to focus on yet"
                body="Complete your first case and this page starts ranking your weakest systems, the questions you miss, and what to study next."
                actionLabel="Start a case →"
                actionHref="/trainer"
              />
            </div>
          ) : (
            <>
          {/* Up next — single most actionable recommendation + weekly pace */}
          {prioritized.length > 0 && (() => {
            const top = prioritized[0]
            const recLevel = recommendedTier(top.score, isPro)
            return (
              <div className="dx-card">
                <div className="dx-card-body" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      Up next
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      {top.name} · {recLevel}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Weakest system — avg {top.score}/100 over {top.count} case{top.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span
                    title="Cases completed since Monday vs your weekly goal (set in Settings)"
                    style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}
                  >
                    {completedThisWeek} of {settings.weeklyVolume} cases this week
                  </span>
                  <button
                    onClick={() => router.push(`/trainer?system=${encodeURIComponent(top.name)}&difficulty=${encodeURIComponent(recLevel)}`)}
                    style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--accent)',
                      background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.2)',
                      borderRadius: 6, padding: '7px 16px', cursor: 'pointer', flexShrink: 0,
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    Start Case →
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Priority Queue */}
          <div className="dx-card">
            <div className="dx-card-header">
              <div style={{ fontWeight: 700 }}>Your Study Queue</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginTop: 2 }}>
                Systems ranked by urgency — gap from 100, boosted if only one case on record.
                {isPro
                  ? ' Tier shown is the recommended next attempt based on your current score.'
                  : ' Free plan trains at Foundations level — upgrade to Pro for Clinical and Advanced cases.'}
              </div>
            </div>
            <div style={{ padding: '4px 0' }}>
              {prioritized.map((s, i) => {
                const recLevel = recommendedTier(s.score, isPro)
                const isConfirming = confirmSkip === s.name
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
                        {s.count} completed
                      </div>
                    </div>
                    <span
                      title={`Average rubric score in this system — ${s.urgency > 50 ? 'high priority' : s.urgency > 25 ? 'medium priority' : 'strong; minimal practice need'}`}
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: scoreColor(s.score), flexShrink: 0 }}
                    >
                      {s.score}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                      color: 'var(--text-secondary)', background: 'var(--surface3)', flexShrink: 0,
                    }}>
                      {recLevel}
                    </span>
                    <button
                      onClick={() => router.push(`/trainer?system=${encodeURIComponent(s.name)}&difficulty=${encodeURIComponent(recLevel)}`)}
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
                      title={isConfirming ? `Click again to skip ${s.name} for 14 days` : `Skip ${s.name} for 14 days`}
                      aria-label={isConfirming ? `Confirm: skip ${s.name} for 14 days` : `Skip ${s.name} for 14 days`}
                      style={{
                        fontSize: isConfirming ? 10 : 16, lineHeight: 1, fontWeight: isConfirming ? 700 : 500,
                        color: isConfirming ? 'var(--red)' : 'var(--muted)',
                        background: 'transparent', border: `1px solid ${isConfirming ? 'var(--red)' : 'var(--border)'}`,
                        borderRadius: 6, minWidth: 26, height: 26, padding: isConfirming ? '0 8px' : 0, cursor: 'pointer',
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isConfirming ? 'Skip 14d?' : '×'}
                    </button>
                  </div>
                )
              })}
              {prioritized.length === 0 && (
                <div style={{ padding: '20px 24px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  No systems in your queue right now — everything is either skipped or not yet attempted.
                </div>
              )}
            </div>
          </div>

          {/* Due recall cards — the retention half of "what to study now" */}
          {dueCards.length > 0 && (
            <div className="dx-card">
              <div className="dx-card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                  {dueCards.length} recall card{dueCards.length !== 1 ? 's' : ''} due
                </span>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 160 }}>
                  {dueBySystem.map(([sys, n]) => (
                    <span key={sys} style={{
                      fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
                      color: 'var(--muted)', background: 'var(--surface3)',
                    }}>
                      {sys.split(' / ')[0]} {n}
                    </span>
                  ))}
                </div>
                <Link
                  href="/recall"
                  style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
                    background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.2)',
                    borderRadius: 6, padding: '5px 12px', flexShrink: 0,
                  }}
                >
                  Review now →
                </Link>
              </div>
            </div>
          )}

          {/* Two-column */}
          <div className="dx-grid2">
            {/* Failure Mode Analysis */}
            <div className="dx-card">
              <div className="dx-card-header">Where You&apos;re Losing Points</div>
              <div style={{ padding: '8px 0' }}>
                {categoryLoss.length === 0 ? (
                  <div style={{ padding: '20px 24px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Component-level grading will appear here once you complete graded cases.
                  </div>
                ) : categoryLoss.map(({ key, label, avgLoss, n }) => {
                  const lossColor = avgLoss > 40 ? theme.critical : avgLoss > 20 ? theme.caution : theme.confirmed
                  return (
                    <div key={key} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                        <span title={`Across ${n} graded case${n !== 1 ? 's' : ''}`} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: lossColor }}>
                          {avgLoss < 5 ? 'Good — minimal loss' : `Avg loss: ${avgLoss}%`}
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--surface3)', overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, avgLoss)}%`, borderRadius: 3, background: lossColor }} />
                      </div>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        {DIM_DESCRIPTION[key]}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Missed Questions */}
            <div className="dx-card">
              <div className="dx-card-header">Questions You Didn&apos;t Ask</div>
              <div style={{ padding: '8px 0' }}>
                {!isPro ? (
                  <div style={{ padding: '20px 24px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Missed-question analysis is part of Pro grading detail.{' '}
                    <a href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none', fontStyle: 'normal', fontWeight: 600 }}>Upgrade →</a>
                  </div>
                ) : missedPatterns.length === 0 ? (
                  <div style={{ padding: '20px 24px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Missed interview questions from graded cases will appear here.
                  </div>
                ) : missedPatterns.map((p, i) => (
                  <div key={i} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)', fontStyle: 'italic' }}>
                        {p.question}
                      </span>
                      {p.count > 1 && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginLeft: 8,
                          color: theme.critical, background: 'var(--critical-bg)',
                        }}>
                          Missed {p.count}×
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
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
              {missedDiagnoses.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  No missed diagnoses on record — every submitted diagnosis so far has been correct.
                </p>
              ) : (
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
                      {isPro && d.teaching && (
                        <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {d.teaching}
                        </p>
                      )}
                      <button
                        onClick={() => router.push(`/trainer?system=${encodeURIComponent(d.system)}&difficulty=${encodeURIComponent(isPro ? d.difficulty : 'Foundations')}&diagnosis=${encodeURIComponent(d.correctDx)}`)}
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
              )}
            </div>
          </div>

            </>
          )}

        </div>
      </div>
    </div>
  )
}

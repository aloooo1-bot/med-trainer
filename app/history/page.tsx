'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import '@/app/dashboard.css'
import { type CaseSessionRecord, type APICallRecord, loadSessionRecords } from '../lib/analytics'
import type { GradingResult } from '../grading/types'
import { createClient } from '../lib/supabase/client'
import Sidebar from '@/app/components/dashboard/Sidebar'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), sec = s % 60
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

function scoreColorVar(score: number): string {
  if (score >= 75) return 'var(--green)'
  if (score >= 60) return 'var(--amber)'
  return 'var(--red)'
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundations: 'var(--green)',
  Clinical: 'var(--amber)',
  Advanced: 'var(--red)',
}

const DIM_META: { key: keyof NonNullable<GradingResult['dimensions']>; label: string; max: number }[] = [
  { key: 'historyInterview',      label: 'History & Interview',    max: 18 },
  { key: 'testOrdering',          label: 'Test Ordering',          max: 18 },
  { key: 'diagnosisAccuracy',     label: 'Diagnosis Accuracy',     max: 27 },
  { key: 'diagnosisCompleteness', label: 'Completeness',           max: 13 },
  { key: 'clinicalReasoning',     label: 'Clinical Reasoning',     max: 14 },
]

// ── Scorecard detail ──────────────────────────────────────────────────────────

function ScoreDetail({ session, isPro }: { session: CaseSessionRecord; isPro: boolean }) {
  const gr = session.gradingResult

  if (!gr) {
    return (
      <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
        Detailed scorecard not available for this session.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {gr.feedback && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{gr.feedback}</p>
        )}

        {gr.dimensions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
              Scorecard
            </div>
            {DIM_META.map(({ key, label, max }) => {
              const dim = gr.dimensions![key]
              const pct = (dim.score / max) * 100
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontWeight: 600, fontFamily: 'DM Mono, monospace', color: scoreColorVar(dim.score / max * 100) }}>
                      {dim.score}<span style={{ color: 'var(--muted)' }}>/{max}</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: scoreColorVar(pct) }} />
                  </div>
                  {dim.feedback && (
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{dim.feedback}</p>
                  )}
                </div>
              )
            })}

            {gr.efficiency && gr.efficiency.score > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Efficiency</span>
                  <span style={{ fontWeight: 600, fontFamily: 'DM Mono, monospace', color: scoreColorVar(gr.efficiency.score * 10) }}>
                    {gr.efficiency.score}<span style={{ color: 'var(--muted)' }}>/10</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${gr.efficiency.score * 10}%`, borderRadius: 3, background: scoreColorVar(gr.efficiency.score * 10) }} />
                </div>
                {gr.efficiency.feedback && (
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{gr.efficiency.feedback}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isPro && (gr.strengths?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Strengths</div>
            {gr.strengths.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--green)' }}>
                <span style={{ flexShrink: 0 }}>✓</span><span>{s}</span>
              </div>
            ))}
          </div>
        )}

        {isPro && (gr.missedQuestions?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Missed Questions</div>
            {gr.missedQuestions.map((q, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--amber)' }}>
                <span style={{ flexShrink: 0 }}>·</span><span>{q}</span>
              </div>
            ))}
          </div>
        )}

        {isPro && (gr.teachingPoints?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Teaching Points</div>
            {gr.teachingPoints.map((tp, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--accent)' }}>
                <span style={{ flexShrink: 0 }}>·</span><span>{tp}</span>
              </div>
            ))}
          </div>
        )}

        {isPro && (gr.differentials?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Differentials</div>
            {gr.differentials.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ flexShrink: 0, color: 'var(--muted)' }}>·</span><span>{d}</span>
              </div>
            ))}
          </div>
        )}

        {!isPro && (
          <div style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', padding: 12, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Teaching points, strengths &amp; differentials available on Pro.</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span>Time: {fmtElapsed(session.elapsedSeconds)}</span>
          <span>Questions: {session.questionCount}</span>
        </div>
      </div>
    </div>
  )
}

// ── Supabase row → CaseSessionRecord ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRecord(row: any): CaseSessionRecord {
  return {
    id: row.id,
    startedAt: new Date(row.started_at).getTime(),
    completedAt: new Date(row.completed_at).getTime(),
    system: row.system,
    difficulty: row.difficulty,
    diagnosis: row.diagnosis,
    userDiagnosis: row.user_diagnosis,
    correct: row.correct,
    score: row.score,
    questionCount: row.question_count,
    elapsedSeconds: row.elapsed_seconds,
    totalCostUSD: row.total_cost_usd ?? 0,
    totalInputTokens: row.total_input_tokens ?? 0,
    totalOutputTokens: row.total_output_tokens ?? 0,
    apiCalls: (row.api_calls as APICallRecord[]) ?? [],
    gradingResult: row.grading_result as GradingResult | undefined,
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DIFF_FILTERS = ['All', 'Foundations', 'Clinical', 'Advanced'] as const
type DiffFilter = typeof DIFF_FILTERS[number]

export default function HistoryPage() {
  const [sessions, setSessions]     = useState<CaseSessionRecord[]>([])
  const [loaded, setLoaded]         = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [source, setSource]         = useState<'cloud' | 'local'>('local')
  const [isPro, setIsPro]           = useState(false)
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('All')
  const [displayName, setDisplayName] = useState('User')
  const [tier, setTier]             = useState('free')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase as any).from('profiles').select('tier, display_name').eq('id', user.id).single()
        setIsPro(profile?.tier === 'pro')
        setTier(profile?.tier ?? 'free')
        setDisplayName(profile?.display_name ?? user.email?.split('@')[0] ?? 'User')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('case_sessions')
          .select('*')
          .order('completed_at', { ascending: false })
          .limit(50)
        if (data && data.length > 0) {
          setSessions(data.map(rowToRecord))
          setSource('cloud')
          setLoaded(true)
          return
        }
      }

      const all = loadSessionRecords()
      setSessions([...all].reverse().slice(0, 50))
      setSource('local')
      setLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!loaded || !sessions.length) return
    const target = new URLSearchParams(window.location.search).get('expand')
    if (!target || !sessions.some(s => s.id === target)) return
    setExpandedId(target)
    requestAnimationFrame(() =>
      document.getElementById(`session-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    )
  }, [loaded, sessions.length])

  const filtered = useMemo(
    () => diffFilter === 'All' ? sessions : sessions.filter(s => s.difficulty === diffFilter),
    [sessions, diffFilter]
  )

  const diffCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) counts[s.difficulty] = (counts[s.difficulty] ?? 0) + 1
    return counts
  }, [sessions])

  const stats = useMemo(() => {
    if (filtered.length === 0) return null
    const avgScore = filtered.reduce((a, s) => a + s.score, 0) / filtered.length
    const sysCount: Record<string, number> = {}
    for (const s of filtered) sysCount[s.system] = (sysCount[s.system] ?? 0) + 1
    const mostPracticed = Object.entries(sysCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    return { total: filtered.length, avgScore, mostPracticed }
  }, [filtered])

  if (!loaded) {
    return (
      <div className="dx-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Sidebar displayName={displayName} tier={tier} activePage="case-history" />
        <div className="dx-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</span>
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="dx-root">
        <Sidebar displayName={displayName} tier={tier} activePage="case-history" />
        <div className="dx-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 4px' }}>No completed cases yet.</p>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 24px' }}>
              Complete a case to start building your history.
            </p>
            <a href="/trainer" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              Start a case →
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="case-history" />

      <div className="dx-main">
        <div className="dx-content" style={{ paddingTop: 32 }}>

          {/* Page title */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'DM Serif Display, serif' }}>
              Case History
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              {sessions.length === 50 ? 'Last 50 completed cases' : `${sessions.length} completed case${sessions.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Stats row */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Completed', value: stats.total.toString() },
                { label: 'Avg Score', value: stats.avgScore.toFixed(1), color: scoreColorVar(stats.avgScore) },
                { label: 'Most Practiced', value: stats.mostPracticed },
              ].map(({ label, value, color }) => (
                <div key={label} className="dx-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text-primary)', fontFamily: 'DM Mono, monospace' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Difficulty filter chips */}
          <div className="dx-filter-chips" style={{ marginBottom: 20 }}>
            {DIFF_FILTERS.map(d => {
              const count = d === 'All' ? sessions.length : (diffCounts[d] ?? 0)
              return (
                <button
                  key={d}
                  className={`dx-chip${diffFilter === d ? ' active' : ''}`}
                  onClick={() => { setDiffFilter(d); setExpandedId(null) }}
                >
                  {d}{count > 0 && ` (${count})`}
                </button>
              )
            })}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="dx-card" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 8px' }}>No {diffFilter} cases yet.</p>
              <a href={`/trainer?difficulty=${encodeURIComponent(diffFilter)}`}
                style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
                Start a {diffFilter} case →
              </a>
            </div>
          ) : (
            <div className="dx-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Table header */}
              <div className="dx-table-header">
                <span>Date</span>
                <span>System</span>
                <span>Level</span>
                <span>Score</span>
                <span>Result</span>
                <span>Your Diagnosis</span>
                <span>Correct Diagnosis</span>
                <span />
              </div>

              {filtered.map(session => {
                const isExpanded = expandedId === session.id
                return (
                  <Fragment key={session.id}>
                    <div
                      id={`session-${session.id}`}
                      className="dx-table-row"
                      onClick={() => setExpandedId(isExpanded ? null : session.id)}
                    >
                      <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDate(session.startedAt)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {session.system}
                      </span>
                      <span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          color: DIFFICULTY_COLOR[session.difficulty] ?? 'var(--text-secondary)',
                          background: 'var(--border)',
                        }}>
                          {session.difficulty.slice(0, 4)}
                        </span>
                      </span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: scoreColorVar(session.score) }}>
                        {session.score}
                      </span>
                      <span>
                        <span className={`dx-result-badge ${session.correct ? 'correct' : 'incorrect'}`}>
                          {session.correct ? 'Correct' : 'Incorrect'}
                        </span>
                      </span>
                      <span className="dx-diagnosis-cell">{session.userDiagnosis}</span>
                      <span className="dx-diagnosis-cell">{session.diagnosis}</span>
                      <button
                        className={`dx-expand-btn${isExpanded ? ' open' : ''}`}
                        onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : session.id) }}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <ScoreDetail session={session} isPro={isPro} />
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 16, opacity: 0.6 }}>
            {source === 'cloud'
              ? 'Showing your saved cases from all devices'
              : 'Showing cases stored in this browser · Sign in to sync across devices'
            }
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import '@/app/dashboard.css'
import { type CaseSessionRecord, type APICallRecord, loadSessionRecords } from '../lib/analytics'
import type { GradingResult } from '../grading/types'
import { getRubric } from '../grading/rubric'
import { createClient } from '../lib/supabase/client'
import Sidebar from '@/app/components/dashboard/Sidebar'
import ReportCaseModal from '@/app/components/dashboard/ReportCaseModal'

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

function scoreBucketFor(score: number): string {
  if (score < 60) return '<60'
  if (score < 70) return '60-69'
  if (score < 80) return '70-79'
  if (score < 90) return '80-89'
  return '90+'
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundations: 'var(--green)',
  Clinical: 'var(--amber)',
  Advanced: 'var(--red)',
}


// ── Scorecard detail ──────────────────────────────────────────────────────────

function ScoreDetail({
  session, isPro, onNotesChange,
}: {
  session: CaseSessionRecord
  isPro: boolean
  onNotesChange: (id: string, notes: string) => void
}) {
  const gr = session.gradingResult
  const [localNotes, setLocalNotes] = useState(session.notes ?? '')
  const [showReport, setShowReport] = useState(false)

  const redoHref = `/trainer?system=${encodeURIComponent(session.system)}&difficulty=${encodeURIComponent(session.difficulty)}&diagnosis=${encodeURIComponent(session.diagnosis)}&redoOf=${session.id}`

  function saveNotes() {
    onNotesChange(session.id, localNotes)
  }

  if (!gr) {
    return (
      <>
        <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
          Detailed scorecard not available for this session.
        </p>
        <div className="dx-notes-section" style={{ marginTop: 12 }}>
          <div className="dx-notes-label">Your notes</div>
          <textarea
            className="dx-notes-textarea"
            placeholder="Add notes about this case…"
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
            onBlur={saveNotes}
            rows={2}
          />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="dx-redo-link" href={redoHref}>↻ Redo this case</a>
          <button className="dx-report-link" onClick={() => setShowReport(true)}>⚑ Report this case</button>
        </div>
        <ReportCaseModal
          open={showReport}
          onClose={() => setShowReport(false)}
          sessionId={session.id}
          system={session.system}
          difficulty={session.difficulty}
          diagnosis={session.diagnosis}
        />
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              {getRubric(session.difficulty).map(({ key, label, max }) => {
                const dim = gr.dimensions![key]
                if (!dim) return null
                const pct = (dim.score / max) * 100
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: scoreColorVar(dim.score / max * 100) }}>
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
                    <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: scoreColorVar(gr.efficiency.score * 10) }}>
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

      {/* Notes */}
      <div className="dx-notes-section">
        <div className="dx-notes-label">Your notes</div>
        <textarea
          className="dx-notes-textarea"
          placeholder="Add notes about this case…"
          value={localNotes}
          onChange={e => setLocalNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
        />
      </div>

      {/* Actions */}
      <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <a className="dx-redo-link" href={redoHref}>↻ Redo this case</a>
        <button className="dx-report-link" onClick={() => setShowReport(true)}>⚑ Report this case</button>
      </div>

      <ReportCaseModal
        open={showReport}
        onClose={() => setShowReport(false)}
        sessionId={session.id}
        system={session.system}
        difficulty={session.difficulty}
        diagnosis={session.diagnosis}
      />
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
    bookmarked: row.bookmarked ?? false,
    parentSessionId: row.parent_session_id ?? null,
    notes: row.notes ?? '',
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DIFF_FILTERS = ['All', 'Foundations', 'Clinical', 'Advanced'] as const
type DiffFilter = typeof DIFF_FILTERS[number]
const SCORE_BUCKETS = ['<60', '60-69', '70-79', '80-89', '90+'] as const
type DateRange = 'all' | '7d' | '30d' | '90d'

export default function HistoryPage() {
  const [sessions, setSessions]         = useState<CaseSessionRecord[]>([])
  const [loaded, setLoaded]             = useState(false)
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [source, setSource]             = useState<'cloud' | 'local'>('local')
  const [isPro, setIsPro]               = useState(false)
  const [diffFilter, setDiffFilter]     = useState<DiffFilter>('All')
  const [displayName, setDisplayName]   = useState('User')
  const [tier, setTier]                 = useState('free')

  // Phase 4b: additional filter state
  const [searchRaw, setSearchRaw]         = useState('')
  const [searchQuery, setSearchQuery]     = useState('')
  const [systemFilter, setSystemFilter]   = useState<Set<string>>(new Set())
  const [scoreBuckets, setScoreBuckets]   = useState<Set<string>>(new Set())
  const [dateRange, setDateRange]         = useState<DateRange>('all')
  const [onlyBookmarked, setOnlyBookmarked] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase.from('profiles').select('tier, display_name').eq('id', user.id).single()
        setIsPro(profile?.tier === 'pro')
        setTier(profile?.tier ?? 'free')
        setDisplayName(profile?.display_name ?? user.email?.split('@')[0] ?? 'User')

        const { data } = await supabase
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

  // Deep-link expand from ?expand=<id>
  useEffect(() => {
    if (!loaded || !sessions.length) return
    const target = new URLSearchParams(window.location.search).get('expand')
    if (!target || !sessions.some(s => s.id === target)) return
    setExpandedId(target)
    requestAnimationFrame(() =>
      document.getElementById(`session-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    )
  }, [loaded, sessions.length])

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchRaw.toLowerCase().trim()), 200)
    return () => clearTimeout(t)
  }, [searchRaw])

  // Systems list for multi-select chips
  const systemList = useMemo(
    () => Array.from(new Set(sessions.map(s => s.system))).sort(),
    [sessions]
  )

  const dateCutoff = useMemo(() => {
    if (dateRange === 'all') return 0
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
    return Date.now() - days * 24 * 60 * 60 * 1000
  }, [dateRange])

  const filtered = useMemo(() => {
    const q = searchQuery
    return sessions.filter(s => {
      if (diffFilter !== 'All' && s.difficulty !== diffFilter) return false
      if (systemFilter.size > 0 && !systemFilter.has(s.system)) return false
      if (scoreBuckets.size > 0 && !scoreBuckets.has(scoreBucketFor(s.score))) return false
      if (dateCutoff > 0 && s.completedAt < dateCutoff) return false
      if (onlyBookmarked && !s.bookmarked) return false
      if (q && !(s.userDiagnosis ?? '').toLowerCase().includes(q) && !s.diagnosis.toLowerCase().includes(q) && !(s.notes ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [sessions, diffFilter, systemFilter, scoreBuckets, dateCutoff, onlyBookmarked, searchQuery])

  const isFiltered = diffFilter !== 'All' || systemFilter.size > 0 || scoreBuckets.size > 0 || dateRange !== 'all' || onlyBookmarked || searchQuery.length > 0

  function clearAllFilters() {
    setDiffFilter('All')
    setSystemFilter(new Set())
    setScoreBuckets(new Set())
    setDateRange('all')
    setOnlyBookmarked(false)
    setSearchRaw('')
    setExpandedId(null)
  }

  function toggleSystem(sys: string) {
    setSystemFilter(prev => {
      const next = new Set(prev)
      if (next.has(sys)) next.delete(sys)
      else next.add(sys)
      return next
    })
    setExpandedId(null)
  }

  function toggleBucket(b: string) {
    setScoreBuckets(prev => {
      const next = new Set(prev)
      if (next.has(b)) next.delete(b)
      else next.add(b)
      return next
    })
    setExpandedId(null)
  }

  const diffCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) counts[s.difficulty] = (counts[s.difficulty] ?? 0) + 1
    return counts
  }, [sessions])

  // Phase 4a: recent trend (last 5 vs prior 5)
  const recentTrend = useMemo(() => {
    if (sessions.length < 10) return null
    const avg = (arr: CaseSessionRecord[]) => arr.reduce((a, s) => a + s.score, 0) / arr.length
    return Math.round(avg(sessions.slice(0, 5)) - avg(sessions.slice(5, 10)))
  }, [sessions])

  const stats = useMemo(() => {
    if (filtered.length === 0) return null
    const avgScore = filtered.reduce((a, s) => a + s.score, 0) / filtered.length
    return { total: filtered.length, avgScore }
  }, [filtered])

  // Phase 4c: optimistic bookmark toggle
  const toggleBookmark = useCallback((session: CaseSessionRecord) => {
    const next = !session.bookmarked
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, bookmarked: next } : s))
    fetch('/api/sessions/bookmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.id, bookmarked: next }),
    }).then(r => {
      if (!r.ok) setSessions(prev => prev.map(s => s.id === session.id ? { ...s, bookmarked: !next } : s))
    }).catch(() => {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, bookmarked: !next } : s))
    })
  }, [])

  // Phase 7e: notes auto-save
  const handleNotesChange = useCallback((id: string, notes: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, notes } : s))
    fetch('/api/sessions/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, notes }),
    }).then(r => {
      if (!r.ok) setSessions(prev => prev.map(s => s.id === id ? { ...s, notes: s.notes } : s))
    }).catch(() => {})
  }, [])

  // Phase 4d: scroll to parent session
  const scrollToParent = useCallback((parentId: string) => {
    setExpandedId(parentId)
    requestAnimationFrame(() =>
      document.getElementById(`session-${parentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    )
  }, [])

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
            <h1 className="heading-display text-[22px]">Case <span className="heading-accent">history</span></h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              {sessions.length === 50 ? 'Last 50 completed cases' : `${sessions.length} completed case${sessions.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Stats row */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              <div className="dx-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Completed</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{stats.total}</div>
              </div>
              <div className="dx-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Avg Score</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: scoreColorVar(stats.avgScore), fontFamily: 'JetBrains Mono, monospace' }}>{stats.avgScore.toFixed(1)}</div>
              </div>
              <div className="dx-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recent trend</div>
                {recentTrend === null ? (
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    —<span style={{ fontSize: 11, marginLeft: 6, fontWeight: 400 }}>(need 10)</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: recentTrend > 0 ? 'var(--green)' : recentTrend < 0 ? 'var(--red)' : 'var(--muted)' }}>
                    {recentTrend > 0 ? `+${recentTrend}` : recentTrend} pts
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="dx-history-filters">
            {/* Search + bookmarked + clear */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="dx-search"
                type="search"
                placeholder="Search by diagnosis or notes…"
                value={searchRaw}
                onChange={e => setSearchRaw(e.target.value)}
                style={{ flex: '1 1 200px', minWidth: 0 }}
              />
              <button
                className={`dx-chip${onlyBookmarked ? ' active' : ''}`}
                onClick={() => { setOnlyBookmarked(v => !v); setExpandedId(null) }}
              >
                {onlyBookmarked ? '★' : '☆'} Bookmarked
              </button>
              {isFiltered && (
                <button className="dx-chip" onClick={clearAllFilters} style={{ color: 'var(--muted)' }}>
                  Clear filters
                </button>
              )}
            </div>

            {/* Difficulty chips */}
            <div className="dx-filter-chips">
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

            {/* System chips (multi-select) */}
            {systemList.length > 1 && (
              <div className="dx-filter-chips">
                {systemList.map(sys => (
                  <button
                    key={sys}
                    className={`dx-chip${systemFilter.has(sys) ? ' active' : ''}`}
                    onClick={() => toggleSystem(sys)}
                  >
                    {sys}
                  </button>
                ))}
              </div>
            )}

            {/* Score buckets + date range */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="dx-filter-chips">
                {SCORE_BUCKETS.map(b => (
                  <button
                    key={b}
                    className={`dx-chip${scoreBuckets.has(b) ? ' active' : ''}`}
                    onClick={() => toggleBucket(b)}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <div className="dx-filter-chips">
                {(['all', '7d', '30d', '90d'] as const).map(r => (
                  <button
                    key={r}
                    className={`dx-chip${dateRange === r ? ' active' : ''}`}
                    onClick={() => { setDateRange(r); setExpandedId(null) }}
                  >
                    {r === 'all' ? 'All time' : `Last ${r}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="dx-card" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 8px' }}>
                {isFiltered ? 'No cases match the current filters.' : `No ${diffFilter} cases yet.`}
              </p>
              {!isFiltered && (
                <a href={`/trainer?difficulty=${encodeURIComponent(diffFilter)}`}
                  style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
                  Start a {diffFilter} case →
                </a>
              )}
              {isFiltered && (
                <button className="dx-chip" onClick={clearAllFilters} style={{ color: 'var(--accent)' }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="dx-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Table header */}
              <div className="dx-table-header">
                <span />
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
                      {/* Bookmark star */}
                      <button
                        className={`dx-bookmark-btn${session.bookmarked ? ' bookmarked' : ''}`}
                        onClick={e => { e.stopPropagation(); toggleBookmark(session) }}
                        title={session.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                        aria-label={session.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                      >
                        {session.bookmarked ? '★' : '☆'}
                      </button>

                      <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDate(session.startedAt)}
                      </span>

                      {/* System + redo badge */}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>
                          {session.system}
                        </span>
                        {session.parentSessionId && (
                          <button
                            className="dx-redo-badge"
                            onClick={e => { e.stopPropagation(); scrollToParent(session.parentSessionId!) }}
                            title="Show original"
                          >
                            ↻ redo
                          </button>
                        )}
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
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', color: scoreColorVar(session.score) }}>
                        {session.score}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.6, marginLeft: 1, verticalAlign: 'top', lineHeight: '2' }}>%</span>
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
                        <ScoreDetail session={session} isPro={isPro} onNotesChange={handleNotesChange} />
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

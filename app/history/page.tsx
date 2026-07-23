'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import '@/app/dashboard.css'
import { type CaseSessionRecord, type APICallRecord, loadSessionRecords, updateSessionRecord } from '../lib/analytics'
import type { GradingResult } from '../grading/types'
import { getRubric } from '../grading/rubric'
import { createClient } from '../lib/supabase/client'
import Sidebar from '@/app/components/dashboard/Sidebar'
import ReportCaseModal from '@/app/components/dashboard/ReportCaseModal'
import { localDayKey } from '@/app/lib/localDay'

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

function diagnosisIsPartial(userDx: string, correctDx: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const userNorm = normalize(userDx)
  const tokens = normalize(correctDx).split(' ').filter(t => t.length > 3)
  return tokens.length > 0 && !tokens.every(t => userNorm.includes(t))
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundations: 'var(--green)',
  Clinical: 'var(--amber)',
  Advanced: 'var(--red)',
}


// ── Notes save chip ───────────────────────────────────────────────────────────

function NotesSaveChip({ status, dirty, onRetry }: {
  status?: 'saving' | 'saved' | 'error'
  dirty: boolean
  onRetry?: () => void
}) {
  if (status === 'saving') return <span className="dx-notes-save-chip saving">Saving…</span>
  if (status === 'saved')  return <span className="dx-notes-save-chip saved">Saved ✓</span>
  if (status === 'error')  return <button className="dx-notes-save-chip error" onClick={onRetry}>Save failed — retry</button>
  if (dirty)               return <span className="dx-notes-save-chip dirty">Unsaved</span>
  return null
}

// ── Scorecard detail ──────────────────────────────────────────────────────────

function ScoreDetail({
  session, isPro, onNotesChange, saveStatus, onRetrySave,
}: {
  session: CaseSessionRecord
  isPro: boolean
  onNotesChange: (id: string, notes: string) => void
  saveStatus?: 'saving' | 'saved' | 'error'
  onRetrySave?: () => void
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="dx-notes-label">Your notes</div>
            <NotesSaveChip status={saveStatus} dirty={localNotes !== (session.notes ?? '')} onRetry={onRetrySave} />
          </div>
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
            <span title="Number of history questions asked">Interview Qs: {session.questionCount}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="dx-notes-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="dx-notes-label">Your notes</div>
          <NotesSaveChip status={saveStatus} dirty={localNotes !== (session.notes ?? '')} onRetry={onRetrySave} />
        </div>
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

const WAVE11_RUBRIC_CUTOFF_MS = Date.parse('2026-05-17T20:36:25Z')
const PAGE_SIZE = 50

function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}


export default function HistoryPage() {
  const [sessions, setSessions]         = useState<CaseSessionRecord[]>([])
  const [loaded, setLoaded]             = useState(false)
  const [loadError, setLoadError]       = useState(false)
  const [hasMore, setHasMore]           = useState(false)
  const [loadingMore, setLoadingMore]   = useState(false)
  const localAllRef                     = useRef<CaseSessionRecord[]>([])
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [source, setSource]             = useState<'cloud' | 'local'>('local')
  const [isPro, setIsPro]               = useState(false)
  const [diffFilter, setDiffFilter]     = useState<DiffFilter>('All')
  const [displayName, setDisplayName]   = useState('User')
  const [noteSaveState, setNoteSaveState] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const noteSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [tier, setTier]                 = useState('free')

  // Phase 4b: additional filter state
  const [searchRaw, setSearchRaw]         = useState('')
  const [searchQuery, setSearchQuery]     = useState('')
  const [systemFilter, setSystemFilter]   = useState<Set<string>>(new Set())
  const [scoreBuckets, setScoreBuckets]   = useState<Set<string>>(new Set())
  const [dateRange, setDateRange]         = useState<DateRange>('all')
  // YYYY-MM-DD (local) from the ?date= deep link; scopes the Supabase fetch to that day.
  const [dayFilter, setDayFilter]         = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const date = new URLSearchParams(window.location.search).get('date')
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
  })
  const [onlyBookmarked, setOnlyBookmarked] = useState(false)
  const [wrongDxOnly, setWrongDxOnly]       = useState(false)

  useEffect(() => {
    async function load() {
      let cloudFailed = false
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data: profile } = await supabase.from('profiles').select('tier, display_name').eq('id', user.id).single()
          setIsPro(profile?.tier === 'pro')
          setTier(profile?.tier ?? 'free')
          setDisplayName(profile?.display_name ?? user.email?.split('@')[0] ?? 'User')

          let query = supabase.from('case_sessions').select('*')
          if (dayFilter) {
            const dayStart = new Date(`${dayFilter}T00:00:00`)
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
            query = query.gte('completed_at', dayStart.toISOString()).lt('completed_at', dayEnd.toISOString())
          }
          const { data, error } = await query
            .order('completed_at', { ascending: false })
            .limit(PAGE_SIZE)
          if (error) {
            cloudFailed = true
          } else if (data && (data.length > 0 || dayFilter)) {
            // With a day-scoped query an empty result is a real answer, not a
            // reason to fall back to unrelated local records.
            setSessions(data.map(rowToRecord))
            setHasMore(data.length === PAGE_SIZE)
            setSource('cloud')
            setLoadError(false)
            setLoaded(true)
            return
          }
        }
      } catch {
        cloudFailed = true
      }

      let records = [...loadSessionRecords()].reverse()
      if (dayFilter) records = records.filter(r => localDayKey(r.completedAt) === dayFilter)
      localAllRef.current = records
      setSessions(records.slice(0, PAGE_SIZE))
      setHasMore(records.length > PAGE_SIZE)
      setSource('local')
      // Only surface an error when the cloud fetch failed AND there is no
      // local data to stand in for it.
      setLoadError(cloudFailed && records.length === 0)
      setLoaded(true)
    }
    // Refetch whenever the day scope changes; reset to the loading screen meanwhile.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false)
    load()
  }, [dayFilter])

  // Deep-link filter from ?system=<name> (?date= is read in the dayFilter initializer)
  useEffect(() => {
    const sys = new URLSearchParams(window.location.search).get('system')
    // Deep-link filters come from the URL query, only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sys) setSystemFilter(new Set([sys]))
  }, [])

  // Deep-link expand from ?expand=<id>
  useEffect(() => {
    if (!loaded || !sessions.length) return
    const target = new URLSearchParams(window.location.search).get('expand')
    if (!target || !sessions.some(s => s.id === target)) return
    // Deep-link expansion is driven by the URL query, only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Systems list for multi-select chips. Includes any active filter values
  // (e.g. a bad ?system= deep link) so a filter matching zero sessions still
  // renders a chip the user can click to remove.
  const systemList = useMemo(
    () => Array.from(new Set([...sessions.map(s => s.system), ...systemFilter])).sort(),
    [sessions, systemFilter]
  )

  const dateCutoff = useMemo(() => {
    if (dateRange === 'all') return 0
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
    // Cutoff is intentionally evaluated relative to "now" when the range changes;
    // day-granularity staleness across a long-open session is harmless here.
    // eslint-disable-next-line react-hooks/purity
    return Date.now() - days * 24 * 60 * 60 * 1000
  }, [dateRange])

  const filtered = useMemo(() => {
    const q = searchQuery
    return sessions.filter(s => {
      if (diffFilter !== 'All' && s.difficulty !== diffFilter) return false
      if (systemFilter.size > 0 && !systemFilter.has(s.system)) return false
      if (scoreBuckets.size > 0 && !scoreBuckets.has(scoreBucketFor(s.score))) return false
      if (dateCutoff > 0 && s.completedAt < dateCutoff) return false
      if (dayFilter && localDayKey(s.completedAt) !== dayFilter) return false
      if (onlyBookmarked && !s.bookmarked) return false
      if (wrongDxOnly && s.correct !== false) return false
      if (q && !(s.userDiagnosis ?? '').toLowerCase().includes(q) && !s.diagnosis.toLowerCase().includes(q) && !(s.notes ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [sessions, diffFilter, systemFilter, scoreBuckets, dateCutoff, dayFilter, onlyBookmarked, searchQuery, wrongDxOnly])

  const isFiltered = diffFilter !== 'All' || systemFilter.size > 0 || scoreBuckets.size > 0 || dateRange !== 'all' || dayFilter !== null || onlyBookmarked || searchQuery.length > 0 || wrongDxOnly

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      if (source === 'cloud') {
        const supabase = createClient()
        let query = supabase.from('case_sessions').select('*')
        if (dayFilter) {
          const dayStart = new Date(`${dayFilter}T00:00:00`)
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
          query = query.gte('completed_at', dayStart.toISOString()).lt('completed_at', dayEnd.toISOString())
        }
        const { data, error } = await query
          .order('completed_at', { ascending: false })
          .range(sessions.length, sessions.length + PAGE_SIZE - 1)
        if (!error && data) {
          setSessions(prev => [...prev, ...data.map(rowToRecord)])
          setHasMore(data.length === PAGE_SIZE)
        }
      } else {
        const next = localAllRef.current.slice(sessions.length, sessions.length + PAGE_SIZE)
        setSessions(prev => [...prev, ...next])
        setHasMore(localAllRef.current.length > sessions.length + next.length)
      }
    } catch {
      // leave hasMore as-is so the user can retry
    }
    setLoadingMore(false)
  }

  function exportFiltered(format: 'csv' | 'json') {
    const stamp = localDayKey(Date.now())
    if (format === 'json') {
      // apiCalls is internal cost telemetry — not useful in an export.
      const rows = filtered.map(({ apiCalls: _apiCalls, ...rest }) => rest)
      downloadBlob(JSON.stringify(rows, null, 2), `medtrainer-history-${stamp}.json`, 'application/json')
      return
    }
    const header = ['completed_at', 'system', 'difficulty', 'score', 'correct', 'your_diagnosis', 'correct_diagnosis', 'elapsed_seconds', 'question_count', 'bookmarked', 'notes']
    const lines = [
      header.join(','),
      ...filtered.map(s => [
        new Date(s.completedAt).toISOString(),
        s.system, s.difficulty, s.score, s.correct,
        s.userDiagnosis, s.diagnosis, s.elapsedSeconds, s.questionCount,
        s.bookmarked ?? false, s.notes ?? '',
      ].map(csvEscape).join(',')),
    ]
    downloadBlob(lines.join('\n'), `medtrainer-history-${stamp}.csv`, 'text/csv')
  }

  function clearDayFilter() {
    setDayFilter(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('date')
    window.history.replaceState(null, '', url)
  }

  function clearAllFilters() {
    setDiffFilter('All')
    setSystemFilter(new Set())
    setScoreBuckets(new Set())
    setDateRange('all')
    clearDayFilter()
    setOnlyBookmarked(false)
    setWrongDxOnly(false)
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

  // Phase 4c: optimistic bookmark toggle. Local-source sessions persist to
  // localStorage (the API would 401 without a signed-in user); cloud sessions
  // POST with an in-flight guard so rapid toggles can't clobber each other.
  const bookmarkInFlight = useRef<Set<string>>(new Set())
  const toggleBookmark = useCallback((session: CaseSessionRecord) => {
    const next = !session.bookmarked
    if (source === 'local') {
      if (updateSessionRecord(session.id, { bookmarked: next })) {
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, bookmarked: next } : s))
      }
      return
    }
    if (bookmarkInFlight.current.has(session.id)) return
    bookmarkInFlight.current.add(session.id)
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, bookmarked: next } : s))
    const revert = () => setSessions(prev => prev.map(s => s.id === session.id ? { ...s, bookmarked: !next } : s))
    fetch('/api/sessions/bookmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.id, bookmarked: next }),
    }).then(r => {
      if (!r.ok) revert()
    }).catch(revert)
      .finally(() => bookmarkInFlight.current.delete(session.id))
  }, [source])

  // Phase 7e: notes auto-save (localStorage for local-source sessions)
  const handleNotesChange = useCallback((id: string, notes: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, notes } : s))
    setNoteSaveState(prev => ({ ...prev, [id]: 'saving' }))
    clearTimeout(noteSaveTimers.current[id])
    const markSaved = () => {
      setNoteSaveState(prev => ({ ...prev, [id]: 'saved' }))
      noteSaveTimers.current[id] = setTimeout(
        () => setNoteSaveState(prev => { const { [id]: _, ...rest } = prev; return rest }),
        2000
      )
    }
    if (source === 'local') {
      if (updateSessionRecord(id, { notes })) markSaved()
      else setNoteSaveState(prev => ({ ...prev, [id]: 'error' }))
      return
    }
    fetch('/api/sessions/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, notes }),
    }).then(r => {
      if (!r.ok) throw new Error()
      markSaved()
    }).catch(() => setNoteSaveState(prev => ({ ...prev, [id]: 'error' })))
  }, [source])

  // Clear any pending "saved ✓" chip timers on unmount.
  useEffect(() => {
    const timers = noteSaveTimers.current
    return () => { Object.values(timers).forEach(clearTimeout) }
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
            {loadError ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 4px' }}>
                Couldn&apos;t load your case history. Refresh the page to try again.
              </p>
            ) : dayFilter ? (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 4px' }}>
                  No cases completed on {new Date(`${dayFilter}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
                </p>
                <button
                  onClick={clearDayFilter}
                  style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginTop: 20 }}
                >
                  Show all history →
                </button>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 4px' }}>No completed cases yet.</p>
                <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 24px' }}>
                  Complete a case to start building your history.
                </p>
                <a href="/trainer" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                  Start a case →
                </a>
              </>
            )}
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
              {`Showing ${sessions.length}${hasMore ? '+' : ''} completed case${sessions.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Stats row */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              <div className="dx-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{isFiltered ? 'Matching' : 'Completed'}</div>
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
                  <div
                    title="Average score of your last 5 cases minus the 5 before them, in points"
                    style={{ fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: recentTrend > 0 ? 'var(--green)' : recentTrend < 0 ? 'var(--red)' : 'var(--muted)' }}
                  >
                    {recentTrend > 0 ? `+${recentTrend}` : recentTrend}<span style={{ fontSize: 12, fontWeight: 500 }}> pts</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="dx-history-filters">
            {/* Search + clear */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="dx-search"
                type="search"
                placeholder="Search by diagnosis or notes…"
                value={searchRaw}
                onChange={e => setSearchRaw(e.target.value)}
                style={{ flex: '1 1 200px', minWidth: 0 }}
              />
              {isFiltered && (
                <button className="dx-chip" onClick={clearAllFilters} style={{ color: 'var(--muted)' }}>
                  Clear filters
                </button>
              )}
              <button className="dx-chip" onClick={() => exportFiltered('csv')} title="Download the currently filtered cases as CSV">
                ⬇ CSV
              </button>
              <button className="dx-chip" onClick={() => exportFiltered('json')} title="Download the currently filtered cases as JSON">
                ⬇ JSON
              </button>
            </div>

            {/* Bookmarked + study filter chips */}
            <div className="dx-filter-chips">
              <button
                className={`dx-chip${onlyBookmarked ? ' active' : ''}`}
                onClick={() => { setOnlyBookmarked(v => !v); setExpandedId(null) }}
              >
                {onlyBookmarked ? '★' : '☆'} Bookmarked
              </button>
              <button
                className={`dx-chip${wrongDxOnly ? ' active' : ''}`}
                onClick={() => { setWrongDxOnly(v => !v); setExpandedId(null) }}
                title="Only show cases where the submitted diagnosis was incorrect"
              >
                Wrong diagnosis
              </button>
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
                    {d} ({count})
                  </button>
                )
              })}
            </div>

            {/* System chips (multi-select) */}
            {(systemList.length > 1 || systemFilter.size > 0) && (
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
                {dayFilter && (
                  <button
                    className="dx-chip active"
                    onClick={() => { clearDayFilter(); setExpandedId(null) }}
                    title="Showing a single day — click to remove this filter"
                  >
                    {new Date(`${dayFilter}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ✕
                  </button>
                )}
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
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : session.id)}
                      onKeyDown={e => {
                        // Only when the row itself is focused — keydown events
                        // bubbling from the inner bookmark/redo/expand buttons
                        // must keep their native activation.
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedId(isExpanded ? null : session.id)
                        }
                      }}
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
                        {fmtDate(session.completedAt)}
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

                      <span style={{ overflow: 'visible' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          color: DIFFICULTY_COLOR[session.difficulty] ?? 'var(--text-secondary)',
                          background: 'var(--border)',
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                        }} title={session.difficulty}>
                          {session.difficulty}
                        </span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', color: scoreColorVar(session.score) }}>
                          {session.score}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.6, marginLeft: 1, verticalAlign: 'top', lineHeight: '2' }}>%</span>
                        </span>
                        {session.completedAt < WAVE11_RUBRIC_CUTOFF_MS && (
                          <span
                            title="Graded before the 2026-05-17 rubric update. Scores reflect prior grading rules and may differ from current rubric."
                            style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--surface3)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}
                          >
                            legacy
                          </span>
                        )}
                      </span>
                      <span>
                        {(() => {
                          const partial = session.correct && diagnosisIsPartial(session.userDiagnosis, session.diagnosis)
                          return (
                            <span className={`dx-result-badge ${partial ? 'partial' : session.correct ? 'correct' : 'incorrect'}`}>
                              {partial ? 'Partial' : session.correct ? 'Correct' : 'Incorrect'}
                            </span>
                          )
                        })()}
                      </span>
                      <span className="dx-diagnosis-cell">{session.userDiagnosis}</span>
                      <span className="dx-diagnosis-cell">{session.diagnosis}</span>
                      <button
                        className={`dx-expand-btn${isExpanded ? ' open' : ''}`}
                        onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : session.id) }}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Collapse case details' : 'Expand case details'}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <ScoreDetail
                          session={session}
                          isPro={isPro}
                          onNotesChange={handleNotesChange}
                          saveStatus={noteSaveState[session.id]}
                          onRetrySave={() => handleNotesChange(session.id, session.notes ?? '')}
                        />
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )}

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                className="dx-chip"
                onClick={loadMore}
                disabled={loadingMore}
                style={{ padding: '8px 20px', fontSize: 13 }}
              >
                {loadingMore ? 'Loading…' : 'Load older cases'}
              </button>
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

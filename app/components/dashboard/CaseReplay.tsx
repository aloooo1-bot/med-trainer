'use client'

import { useEffect, useState } from 'react'
import { splitStageDirections } from '@/app/lib/transcriptText'
import '@/app/dashboard.css'

/**
 * The encounter behind a finished case: the interview transcript and the result
 * of every test ordered, so a completed case can be studied rather than just
 * scored.
 *
 * Fetched lazily — this only mounts when a history row is expanded, and the
 * transcript lives in the event log rather than in the history row precisely so
 * the list fetch stays small.
 */

interface LabComponent {
  name: string
  value: string
  unit?: string
  referenceRange?: string
  status?: string
}

interface ReplayResult {
  test: string
  kind: 'lab' | 'imaging' | 'procedure' | 'pending' | 'ambiguous' | 'none'
  labResult?: {
    value?: string
    unit?: string
    referenceRange?: string
    status?: string
    result?: string
    components?: LabComponent[]
  }
  report?: string
  pendingHours?: string
  specialFindings?: string
  resolvedFrom?: string
}

interface ReplayData {
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>
  exams: Array<{ region: string; finding: string }>
  results: ReplayResult[]
  prediction: { ranking: string[]; confidence: number | null } | null
  patientName: string | null
}

function statusColor(status?: string): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'high' || s === 'critical' || s === 'low' || s === 'abnormal') return 'var(--red)'
  if (s === 'normal') return 'var(--green)'
  return 'var(--muted)'
}

const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--muted)',
}

function Disclosure({ title, count, children }: {
  title: string
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: 'var(--surface2)', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: 'var(--text-secondary)', fontSize: 12,
        }}
      >
        <span style={{ display: 'inline-block', transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none', color: 'var(--muted)' }}>▸</span>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ color: 'var(--muted)' }}>({count})</span>
      </button>
      {open && <div style={{ padding: '14px' }}>{children}</div>}
    </div>
  )
}

function Transcript({ messages, patientName }: {
  messages: ReplayData['transcript']
  patientName: string | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {messages.map((m, i) => {
        const isUser = m.role === 'user'
        const showLabel = i === 0 || messages[i - 1].role !== m.role
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 3 }}>
            {showLabel && (
              <span style={{ ...LABEL, fontSize: 9 }}>{isUser ? 'You' : patientName || 'Patient'}</span>
            )}
            <div
              style={{
                maxWidth: '88%', borderRadius: 8, padding: '8px 11px', fontSize: 12.5,
                lineHeight: 1.55, whiteSpace: 'pre-wrap',
                background: isUser ? 'var(--accent)' : 'var(--surface2)',
                color: isUser ? '#fff' : 'var(--text-primary)',
                border: isUser ? 'none' : '1px solid var(--border)',
              }}
            >
              {splitStageDirections(m.content).map((seg, j) =>
                seg.kind === 'gesture'
                  ? <em key={j} style={{ opacity: 0.75 }}>{seg.text} </em>
                  : <span key={j}>{seg.text}</span>,
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ResultRow({ r }: { r: ReplayResult }) {
  const lab = r.labResult
  const components = lab?.components ?? []
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{r.test}</span>
        {r.resolvedFrom && r.resolvedFrom !== r.test && (
          <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>matched to {r.resolvedFrom}</span>
        )}
      </div>

      {components.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 5 }}>
          {components.map(c => (
            <div key={c.name} style={{ display: 'flex', gap: 8, fontSize: 11.5, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--text-secondary)', minWidth: 150 }}>{c.name}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: statusColor(c.status), fontWeight: 600 }}>
                {c.value}{c.unit ? ` ${c.unit}` : ''}
              </span>
              {c.referenceRange && <span style={{ color: 'var(--muted)', fontSize: 10.5 }}>ref {c.referenceRange}</span>}
            </div>
          ))}
        </div>
      ) : r.kind === 'lab' && lab ? (
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5, marginTop: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: statusColor(lab.status), fontWeight: 600 }}>
            {lab.value ? `${lab.value}${lab.unit ? ` ${lab.unit}` : ''}` : (lab.result ?? '—')}
          </span>
          {lab.referenceRange && <span style={{ color: 'var(--muted)', fontSize: 10.5 }}>ref {lab.referenceRange}</span>}
        </div>
      ) : r.report ? (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{r.report}</p>
      ) : r.specialFindings ? (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{r.specialFindings}</p>
      ) : r.kind === 'pending' ? (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--amber)' }}>
          Still pending at submission{r.pendingHours ? ` (${r.pendingHours}h turnaround)` : ''} — you never saw this result.
        </p>
      ) : (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic' }}>
          No result modeled for this case.
        </p>
      )}
    </div>
  )
}

export default function CaseReplay({ trainerSessionId }: { trainerSessionId: string }) {
  const [data, setData]   = useState<ReplayData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // No state reset up front: this component is mounted by the expanded history
  // row and unmounted when it collapses, so trainerSessionId never changes
  // under a live instance — it always starts from the null initial state.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/sessions/replay?sessionId=${encodeURIComponent(trainerSessionId)}`)
      .then(async r => {
        const body = await r.json()
        if (cancelled) return
        if (!r.ok) throw new Error(body?.error ?? 'Could not load this encounter.')
        setData(body as ReplayData)
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [trainerSessionId])

  if (error) {
    return <p style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>{error}</p>
  }
  if (!data) {
    return <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0 }}>Loading the encounter…</p>
  }

  const questionCount = data.transcript.filter(m => m.role === 'user').length
  const nothingRecorded = questionCount === 0 && data.results.length === 0 && data.exams.length === 0

  if (nothingRecorded) {
    return (
      <p style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', margin: 0 }}>
        No questions, exams or tests were recorded for this case.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={LABEL}>The encounter</div>
      <Disclosure title="Interview transcript" count={questionCount}>
        <Transcript messages={data.transcript} patientName={data.patientName} />
      </Disclosure>
      <Disclosure title="Test results" count={data.results.length}>
        <div>
          {data.results.map((r, i) => <ResultRow key={`${r.test}-${i}`} r={r} />)}
        </div>
      </Disclosure>
      <Disclosure title="Physical exam" count={data.exams.length}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {data.exams.map(e => (
            <div key={e.region}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>{e.region}</div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{e.finding}</p>
            </div>
          ))}
        </div>
      </Disclosure>
    </div>
  )
}

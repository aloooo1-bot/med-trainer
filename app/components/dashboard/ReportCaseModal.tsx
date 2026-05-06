'use client'

import { useState } from 'react'
import Modal from './Modal'
import '@/app/dashboard.css'

type Category = 'incorrect-grading' | 'inaccurate-content' | 'confusing-ui' | 'other'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'incorrect-grading',    label: 'Incorrect grading / score' },
  { value: 'inaccurate-content',   label: 'Inaccurate clinical content' },
  { value: 'confusing-ui',         label: 'Confusing or broken UI' },
  { value: 'other',                label: 'Other' },
]

export default function ReportCaseModal({
  open,
  onClose,
  sessionId,
  caseId,
  system,
  difficulty,
  diagnosis,
}: {
  open: boolean
  onClose: () => void
  sessionId: string
  caseId?: string | null
  system: string
  difficulty: string
  diagnosis: string
}) {
  const [category, setCategory] = useState<Category>('incorrect-grading')
  const [comment, setComment]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  async function submit() {
    setLoading(true)
    try {
      await fetch('/api/case-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, case_id: caseId ?? null, system, difficulty, diagnosis, category, comment }),
      })
    } catch {}
    setDone(true)
    setLoading(false)
    setTimeout(() => { onClose(); setDone(false); setComment(''); setCategory('incorrect-grading') }, 2000)
  }

  return (
    <Modal open={open} onClose={onClose} ariaLabel="Report this case" maxWidth={440}>
      <div className="dx-modal-header">
        <span className="dx-modal-title">Report this case</span>
        <button className="dx-modal-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="dx-modal-body">
        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>Thank you for your report.</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>We review all reports personally.</p>
          </div>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text)' }}>{diagnosis}</strong> · {system} · {difficulty}
            </p>

            <div className="dx-field">
              <label className="dx-label">Category</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <label key={cat.value} className="dx-checkbox-row">
                    <input
                      type="radio"
                      name="report-category"
                      value={cat.value}
                      checked={category === cat.value}
                      onChange={() => setCategory(cat.value)}
                      style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                    />
                    <span className="dx-checkbox-label">{cat.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="dx-field">
              <label className="dx-label">Comment (optional)</label>
              <textarea
                className="dx-notes-textarea"
                placeholder="Describe the issue in more detail…"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </>
        )}
      </div>

      {!done && (
        <div className="dx-modal-footer">
          <button className="dx-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="dx-btn-primary"
            onClick={submit}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Sending…' : 'Submit report'}
          </button>
        </div>
      )}
    </Modal>
  )
}

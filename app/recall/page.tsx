'use client'

import { useState, useEffect } from 'react'
import '@/app/dashboard.css'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { createClient } from '@/app/lib/supabase/client'
import { loadReviewItems, gradeReviewItem } from '@/app/lib/reasoning/store'
import { dueItems } from '@/app/lib/reasoning/spacedRepetition'
import type { ReviewItem, ReviewGrade, ReviewTag } from '@/app/lib/reasoning/types'

const TAG_LABEL: Record<ReviewTag, string> = {
  discriminator: 'Discriminator',
  management: 'Management',
  cutoff: 'Cutoff',
  mechanism: 'Mechanism',
}

const GRADES: { grade: ReviewGrade; label: string; color: string; hint: string }[] = [
  { grade: 'again', label: 'Again', color: 'var(--red)', hint: 'forgot' },
  { grade: 'hard', label: 'Hard', color: 'var(--amber)', hint: 'barely' },
  { grade: 'good', label: 'Good', color: 'var(--green)', hint: 'got it' },
  { grade: 'easy', label: 'Easy', color: 'var(--primary, #6366f1)', hint: 'trivial' },
]

export default function RecallPage() {
  const [displayName, setDisplayName] = useState('User')
  const [tier, setTier] = useState('free')

  // Session state — the due queue is frozen at session start.
  const [loaded, setLoaded] = useState(false)
  const [queue, setQueue] = useState<ReviewItem[]>([])
  const [idx, setIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('display_name,tier').eq('id', user.id).single().then(({ data: p }) => {
        if (!p) return
        setDisplayName(p.display_name ?? user.email?.split('@')[0] ?? 'User')
        setTier(p.tier ?? 'free')
      })
    })
  }, [])

  useEffect(() => {
    // Mount-only load of review cards from localStorage (unavailable during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue(dueItems(loadReviewItems(), Date.now()))
    setLoaded(true)
  }, [])

  const current = queue[idx]

  function grade(g: ReviewGrade, now: number) {
    if (!current) return
    gradeReviewItem(current.id, g, now)
    setReviewedCount(c => c + 1)
    setShowAnswer(false)
    // A lapse re-shows the card later this session.
    if (g === 'again') setQueue(q => [...q, current])
    setIdx(i => i + 1)
  }

  const remaining = queue.length - idx
  const done = loaded && (queue.length === 0 || idx >= queue.length)

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="recall" />
      <div className="dx-main">
        <div className="dx-content">
          <div style={{ padding: '24px 0 8px' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Recall</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Spaced-repetition review of the key concepts from your cases. Cards resurface on a schedule so they stick.
            </p>
          </div>

          {!loaded ? (
            <div className="dx-card"><div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div></div>
          ) : done ? (
            <div className="dx-card">
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
                  {reviewedCount > 0 ? 'Review complete' : 'No cards due right now'}
                </p>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
                  {reviewedCount > 0
                    ? `You reviewed ${reviewedCount} card${reviewedCount === 1 ? '' : 's'}. Come back tomorrow for the next batch.`
                    : 'Complete cases in the trainer to build your review deck, then check back as cards come due.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {remaining} due
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{TAG_LABEL[current.tag]} · {current.diagnosis}</span>
              </div>

              <div className="dx-card">
                <div style={{ padding: '28px 24px', minHeight: 180, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
                    {current.system}
                  </div>
                  <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{current.prompt}</p>

                  {showAnswer ? (
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                      {current.answer}
                    </p>
                  ) : (
                    <button
                      onClick={() => setShowAnswer(true)}
                      style={{ alignSelf: 'flex-start', marginTop: 'auto', padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2, transparent)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Show answer
                    </button>
                  )}
                </div>

                {showAnswer && (
                  <div style={{ display: 'flex', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
                    {GRADES.map(g => (
                      <button
                        key={g.grade}
                        onClick={() => grade(g.grade, Date.now())}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${g.color}`, background: 'transparent', color: g.color, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        title={g.hint}
                      >
                        {g.label}
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{g.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

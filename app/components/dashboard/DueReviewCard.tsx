'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { loadReviewItems, loadStreak } from '@/app/lib/reasoning/store'
import { dueCount } from '@/app/lib/reasoning/spacedRepetition'

/**
 * Dashboard prompt to return for spaced-repetition review. Hidden until the user
 * has built a deck (so it never clutters a new account). Reads localStorage on
 * mount, independent of the synced session data.
 */
export default function DueReviewCard() {
  const [due, setDue] = useState(0)
  const [total, setTotal] = useState(0)
  const [streak, setStreak] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Mount-only load of the review deck from localStorage (unavailable during SSR).
    const items = loadReviewItems()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotal(items.length)
    setDue(dueCount(items, Date.now()))
    setStreak(loadStreak().streak)
    setLoaded(true)
  }, [])

  if (!loaded || total === 0) return null

  const hasDue = due > 0

  return (
    <div
      className="dx-card"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{hasDue ? '🗂️' : '✓'}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {hasDue ? `${due} card${due === 1 ? '' : 's'} due for review` : "You're all caught up"}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {hasDue ? `${total} in your deck` : `${total} card${total === 1 ? '' : 's'} scheduled`}
            {streak > 0 && `  ·  🔥 ${streak}-day streak`}
          </div>
        </div>
      </div>
      {hasDue && (
        <Link href="/recall" className="dx-btn-primary" style={{ flexShrink: 0, textDecoration: 'none', fontSize: 13, padding: '8px 16px' }}>
          Review now →
        </Link>
      )}
    </div>
  )
}

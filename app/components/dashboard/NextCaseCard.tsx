'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { SystemEntry } from '@/app/lib/dashboardData'
import { recommendNextCase } from '@/app/lib/nextCase'
import { loadFocusSkips, type FocusSkips } from '@/app/lib/focusSettings'

export default function NextCaseCard({
  systems, tier,
}: {
  systems: SystemEntry[]; tier: string
}) {
  // Focus-tab skips live in localStorage — read after mount so a system the
  // user snoozed there isn't recommended here in the meantime (SSR renders the
  // no-skips result; the corrected pick swaps in on hydration).
  const [skips, setSkips] = useState<FocusSkips>({})
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSkips(loadFocusSkips())
  }, [])

  const rec = recommendNextCase(systems, tier === 'pro', skips)
  const tierClass = rec.tier.toLowerCase()

  return (
    <div className="dx-next-card">
      <div className="dx-next-eyebrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11" style={{ marginRight: 5, verticalAlign: 'middle', opacity: 0.8 }}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        Recommended next case
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 4px', lineHeight: 1.4 }}
         title="Foundations — classic cases, no timer. Clinical — atypical features, 22-min timer. Advanced — rare/complex, 15-min timer.">
        {tier === 'pro'
          ? 'Foundations → Clinical → Advanced as your score improves.'
          : 'Free plan trains at Foundations level — upgrade to Pro for Clinical and Advanced cases.'}
      </p>
      <h2 className="dx-next-headline">
        {rec.system} <span className={`dx-next-tier ${tierClass}`}>{rec.tier}</span>
      </h2>
      <p className="dx-next-reason">{rec.reason}</p>
      <Link
        href={`/trainer?system=${encodeURIComponent(rec.system)}&difficulty=${rec.tier}`}
        className="dx-btn-primary dx-next-btn"
      >
        Start case →
      </Link>
    </div>
  )
}

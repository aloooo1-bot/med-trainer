'use client'

import { useState, useEffect } from 'react'
import { getScheme, setScheme, resolveScheme, subscribeOSChanges, type Scheme } from '@/app/lib/colorScheme'

function nextScheme(s: Scheme): Scheme {
  return s === 'light' ? 'dark' : s === 'dark' ? 'auto' : 'light'
}

function schemeLabel(s: Scheme): string {
  if (s === 'auto') return `Auto (${resolveScheme('auto') === 'dark' ? 'dark' : 'light'})`
  return s === 'dark' ? 'Dark' : 'Light'
}

function ThemeIcon({ effective }: { effective: 'light' | 'dark' | 'auto' }) {
  if (effective === 'dark') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )
  }
  if (effective === 'auto') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

export default function Topbar({ streakDays, onStartTraining }: { streakDays: number; onStartTraining?: () => void }) {
  const [scheme, setSchemeState] = useState<Scheme>('auto')

  useEffect(() => {
    setSchemeState(getScheme())
    return subscribeOSChanges(() => setSchemeState(s => s))
  }, [])

  function toggle() {
    const next = nextScheme(scheme)
    setScheme(next)
    setSchemeState(next)
  }

  const effective = resolveScheme(scheme)

  return (
    <header className="dx-topbar">
      <div>
        <h1 className="heading-display text-[20px]">Your <span className="heading-accent">diagnostic</span> training</h1>
        <div className="dx-topbar-sub">Performance overview &amp; next case</div>
      </div>
      <div className="dx-topbar-right">
        {streakDays > 0 && (
          <div className="dx-streak" title="A streak day = ≥1 completed case">
            🔥 {streakDays} day{streakDays !== 1 ? 's' : ''} streak
          </div>
        )}
        <button
          onClick={toggle}
          title={`Theme: ${schemeLabel(scheme)} — click to cycle`}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--color-ink-secondary)',
            flexShrink: 0,
          }}
        >
          <ThemeIcon effective={scheme === 'auto' ? 'auto' : effective} />
        </button>
        <button className="dx-btn-primary" onClick={onStartTraining}>
          Start Training
        </button>
      </div>
    </header>
  )
}

'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { loadReviewItems } from '@/app/lib/reasoning/store'
import { dueCount } from '@/app/lib/reasoning/spacedRepetition'

type ActivePage = 'dashboard' | 'case-history' | 'progress' | 'focus-areas' | 'recall' | 'settings' | 'help'

const NAV_ITEMS: { label: string; href: string; page: ActivePage; icon: React.ReactNode }[] = [
  { label: 'Dashboard', href: '/', page: 'dashboard', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )},
  { label: 'Case History', href: '/history', page: 'case-history', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )},
  { label: 'Progress', href: '/progress', page: 'progress', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
    </svg>
  )},
  { label: 'Focus Areas', href: '/focus', page: 'focus-areas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
    </svg>
  )},
  { label: 'Recall', href: '/recall', page: 'recall', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )},
  { label: 'Settings', href: '/settings', page: 'settings', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )},
  { label: 'Help', href: '/help', page: 'help', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )},
]

export default function Sidebar({ displayName, tier, activePage = 'dashboard' }: {
  displayName: string; tier: string; activePage?: ActivePage
}) {
  const initials = displayName.slice(0, 2).toUpperCase()
  const [recallDue, setRecallDue] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    // Mount-only read of the review deck from localStorage (unavailable during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecallDue(dueCount(loadReviewItems(), Date.now()))
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <>
    {/* Mobile-only top bar (the sidebar is hidden ≤900px) */}
    <div className="dx-mobile-topbar">
      <button
        className="dx-mobile-menu-btn"
        onClick={() => setMobileOpen(o => !o)}
        aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <span className="dx-logo-text">MedTrainer</span>
      {recallDue > 0 && (
        <Link
          href="/recall"
          aria-label={`${recallDue} cards due for review`}
          style={{
            marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
            background: 'var(--red)', color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
          }}
        >
          {recallDue > 99 ? '99+' : recallDue}
        </Link>
      )}
    </div>

    {mobileOpen && <div className="dx-mobile-backdrop" onClick={() => setMobileOpen(false)} />}

    <aside className={`dx-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="dx-logo">
        <span className="dx-logo-text">MedTrainer</span>
      </div>

      <nav className="dx-nav">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.label}
            href={item.href}
            className={`dx-nav-item${activePage === item.page ? ' active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            {item.icon}
            {item.label}
            {item.page === 'recall' && recallDue > 0 && (
              <span
                style={{
                  marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                  background: 'var(--red, #ef4444)', color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label={`${recallDue} cards due for review`}
              >
                {recallDue > 99 ? '99+' : recallDue}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="dx-user">
        <div className="dx-avatar">{initials}</div>
        <div className="dx-user-info">
          <div className="dx-username">{displayName}</div>
          <span className={`dx-plan-badge${tier === 'pro' ? ' pro' : ''}`}>{tier === 'pro' ? 'Pro' : 'Free'}</span>
        </div>
      </div>
    </aside>
    </>
  )
}

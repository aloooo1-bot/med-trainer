import Link from 'next/link'

type ActivePage = 'dashboard' | 'case-history' | 'progress' | 'focus-areas'

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
]

export default function Sidebar({ displayName, tier, activePage = 'dashboard' }: {
  displayName: string; tier: string; activePage?: ActivePage
}) {
  const initials = displayName.slice(0, 2).toUpperCase()
  return (
    <aside className="dx-sidebar">
      <div className="dx-logo">
        <span className="dx-logo-text">MedTrainer</span>
      </div>

      <nav className="dx-nav">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.label}
            href={item.href}
            className={`dx-nav-item${activePage === item.page ? ' active' : ''}`}
          >
            {item.icon}
            {item.label}
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
  )
}

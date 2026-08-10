'use client'

import { useState, useEffect } from 'react'
import '@/app/dashboard.css'
import Sidebar from '@/app/components/dashboard/Sidebar'
import { createClient } from '@/app/lib/supabase/client'
import {
  DEFAULT_FOCUS_SETTINGS,
  type FocusSettings,
  loadFocusSettings,
  saveFocusSettings,
} from '@/app/lib/focusSettings'
import { getScheme, setScheme, type Scheme } from '@/app/lib/colorScheme'
import { clearAllLocalData } from '@/app/lib/clearLocalData'

const SUPPORT_EMAIL = 'support@medtrainer.app'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail]             = useState('')
  const [tier, setTier]               = useState('free')
  const [userId, setUserId]           = useState<string | null>(null)

  // Training prefs (localStorage + DB)
  const [focusSettings, setFocusSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS)

  // Notification prefs
  const [emailCaseReminders, setEmailCaseReminders] = useState(true)
  const [emailWeeklySummary, setEmailWeeklySummary] = useState(true)

  // Appearance
  const [colorScheme, setColorScheme] = useState<Scheme>('auto')

  // Save state per section
  const [profileStatus,  setProfileStatus]  = useState<SaveStatus>('idle')
  const [prefStatus,     setPrefStatus]      = useState<SaveStatus>('idle')
  const [notifStatus,    setNotifStatus]     = useState<SaveStatus>('idle')
  const [pwStatus,       setPwStatus]        = useState<SaveStatus>('idle')
  const [deleteStatus,   setDeleteStatus]    = useState<SaveStatus>('idle')

  const [copied, setCopied] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [cleared, setCleared] = useState(false)

  // Last-synced values, so blur-autosave only fires when something changed.
  const [savedName, setSavedName] = useState('')
  const [savedVolume, setSavedVolume] = useState(DEFAULT_FOCUS_SETTINGS.weeklyVolume)

  // Password change
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setProfileLoaded(true); return }
      setUserId(user.id)
      setEmail(user.email ?? '')
      const { data: p, error } = await supabase
        .from('profiles')
        .select('display_name,tier,email_case_reminders,email_weekly_summary,weekly_volume')
        .eq('id', user.id)
        .single()
      if (error || !p) {
        setLoadFailed(true)
      } else {
        const name = (p.display_name as string | null) ?? ''
        setDisplayName(name)
        setSavedName(name)
        setTier((p.tier as string) ?? 'free')
        setEmailCaseReminders((p.email_case_reminders as boolean) ?? true)
        setEmailWeeklySummary((p.email_weekly_summary as boolean) ?? true)

        // Merge DB training prefs with localStorage
        const local = loadFocusSettings()
        const volume = (p.weekly_volume as number | null) ?? local.weeklyVolume
        setFocusSettings({ weeklyVolume: volume })
        setSavedVolume(volume)
      }
      setProfileLoaded(true)
    }).catch(() => {
      setLoadFailed(true)
      setProfileLoaded(true)
    })
    // Mount-only load of locally-persisted settings/scheme (resolved client-side after hydration).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusSettings(loadFocusSettings())
    setColorScheme(getScheme())
  }, [])

  // ── Autosave handlers ──────────────────────────────────────────────────────
  // No Save buttons: display name saves on blur, the weekly goal on
  // blur/Enter, and the notification toggles on change — matching how the rest
  // of the app already behaves (theme, case notes, the dashboard goal editor).

  async function autosaveName() {
    if (!userId || displayName === savedName) return
    setProfileStatus('saving')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      })
      if (res.ok) setSavedName(displayName)
      setProfileStatus(res.ok ? 'saved' : 'error')
    } catch {
      setProfileStatus('error')
    }
    setTimeout(() => setProfileStatus('idle'), 2500)
  }

  async function autosaveVolume() {
    const volume = focusSettings.weeklyVolume
    if (volume === savedVolume) return
    // Local persistence works signed-out too — the dashboard goal editor and
    // Focus pace counter read the same value from localStorage.
    saveFocusSettings({ weeklyVolume: volume })
    setSavedVolume(volume)
    if (!userId) return
    setPrefStatus('saving')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_volume: volume }),
      })
      // Adopt any server-side clamp (free-tier cap) so localStorage, state,
      // and the profile row all hold the same number.
      if (res.ok) {
        const body = await res.json().catch(() => null) as { stored?: { weekly_volume?: number } } | null
        const stored = body?.stored?.weekly_volume
        if (typeof stored === 'number' && stored !== volume) {
          setFocusSettings({ weeklyVolume: stored })
          setSavedVolume(stored)
          saveFocusSettings({ weeklyVolume: stored })
        }
      }
      setPrefStatus(res.ok ? 'saved' : 'error')
    } catch {
      setPrefStatus('error')
    }
    setTimeout(() => setPrefStatus('idle'), 2500)
  }

  async function autosaveNotifications(next: { reminders: boolean; weekly: boolean }) {
    setEmailCaseReminders(next.reminders)
    setEmailWeeklySummary(next.weekly)
    if (!userId) return
    setNotifStatus('saving')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_case_reminders: next.reminders, email_weekly_summary: next.weekly }),
      })
      setNotifStatus(res.ok ? 'saved' : 'error')
    } catch {
      setNotifStatus('error')
    }
    setTimeout(() => setNotifStatus('idle'), 2500)
  }

  function clearLocalData() {
    if (!window.confirm(
      'Clear all MedTrainer data stored in this browser — recall deck, mastery, calibration, local case history, and preferences? '
      + (userId ? 'Your account copies are unaffected and will restore on the next sync.' : 'Signed out, this data has no cloud copy and cannot be recovered.')
    )) return
    clearAllLocalData()
    setCleared(true)
    setTimeout(() => window.location.reload(), 600)
  }

  async function changePassword() {
    if (!currentPw) { setPwStatus('error'); setTimeout(() => setPwStatus('idle'), 3000); return }
    if (newPw.length < 8) { setPwStatus('error'); setTimeout(() => setPwStatus('idle'), 3000); return }
    if (newPw !== confirmPw) { setPwStatus('error'); setTimeout(() => setPwStatus('idle'), 3000); return }
    setPwStatus('saving')
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, password: newPw }),
      })
      if (res.ok) { setPwStatus('saved'); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
      else setPwStatus('error')
    } catch {
      setPwStatus('error')
    }
    setTimeout(() => setPwStatus('idle'), 3000)
  }

  async function deleteAccount() {
    if (deleteConfirm !== email) return
    if (!window.confirm('This will permanently delete your account and all your case history. This cannot be undone. Continue?')) return
    setDeleteStatus('saving')
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (res.ok) {
        clearAllLocalData()
        window.location.href = '/'
        return
      }
      setDeleteStatus('error')
    } catch {
      setDeleteStatus('error')
    }
    setTimeout(() => setDeleteStatus('idle'), 3000)
  }

  function signOut() {
    // Shared-device hygiene: the next user must not inherit this account's
    // local deck/mastery/history. Cloud copies restore on next sign-in.
    clearAllLocalData()
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/auth/logout'
    document.body.appendChild(form)
    form.submit()
  }

  const statusText =(s: SaveStatus, errMsg?: string) =>
    s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved ✓' : s === 'error' ? (errMsg ?? 'Error — try again') : ''

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName || 'User'} tier={tier} activePage="settings" />
      <div className="dx-main">
        <div className="dx-content">

          <div style={{ marginBottom: 24 }}>
            <h1 className="heading-display text-[22px]"><span className="heading-accent">Settings</span></h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              {profileLoaded ? 'Manage your profile and preferences' : 'Loading your profile…'}
            </p>
          </div>

          {loadFailed && (
            <div className="dx-card" style={{ marginBottom: 16 }}>
              <div className="dx-card-body" style={{ fontSize: 13, color: 'var(--red)' }}>
                Couldn&apos;t load your saved settings — the fields below may show defaults. Refresh the page to try again.
              </div>
            </div>
          )}

          {/* ── Profile ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Profile</div>
            <div className="dx-card-body">
              <div className="dx-form-section">
                <div className="dx-field">
                  <label className="dx-label">
                    Display name
                    {statusText(profileStatus) && (
                      <span className="dx-save-status" style={{ marginLeft: 8, color: profileStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
                        {statusText(profileStatus)}
                      </span>
                    )}
                  </label>
                  <input
                    className="dx-input"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    onBlur={autosaveName}
                    onKeyDown={e => { if (e.key === 'Enter') autosaveName() }}
                    maxLength={60}
                    placeholder="Your name"
                    style={{ maxWidth: 320 }}
                  />
                  <p className="dx-help-text" style={{ margin: '4px 0 0' }}>{displayName.length}/60 characters · saves when you click away</p>
                </div>
                <div className="dx-field">
                  <label className="dx-label">Email</label>
                  <input
                    className="dx-input"
                    type="email"
                    value={email}
                    readOnly
                    aria-readonly="true"
                    style={{ maxWidth: 320, cursor: 'default', background: 'var(--surface2)', color: 'var(--text-secondary)' }}
                  />
                  <p className="dx-help-text">Email cannot be changed here. Contact support to update it.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Subscription ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Subscription</div>
            <div className="dx-card-body">
              <div className="dx-form-section" style={{ paddingTop: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`dx-plan-badge${tier === 'pro' ? ' pro' : ''}`} style={{ fontSize: 12 }}>
                    {tier === 'pro' ? 'Pro' : 'Free'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {tier === 'pro'
                      ? 'You have full access to all Pro features.'
                      : 'Free plan — 2 cases per day, basic scorecard.'}
                  </span>
                </div>
                {tier === 'free' ? (
                  <div className="dx-form-actions">
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=MedTrainer Pro upgrade`}
                      className="dx-btn-primary"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 18px' }}
                    >
                      Upgrade to Pro →
                    </a>
                    <p className="dx-help-text" style={{ margin: 0 }}>
                      Opens your email app. No email client?{' '}
                      <button
                        className="underline text-ink-secondary bg-transparent border-0 cursor-pointer p-0 text-[inherit]"
                        onClick={() => {
                          navigator.clipboard?.writeText(SUPPORT_EMAIL)
                            .then(() => {
                              setCopied(true)
                              setTimeout(() => setCopied(false), 2000)
                            })
                            .catch(() => {})
                        }}
                      >
                        {copied ? 'Copied ✓' : 'Copy address'}
                      </button>{' '}
                      ({SUPPORT_EMAIL})
                    </p>
                  </div>
                ) : (
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=MedTrainer subscription`}
                    className="dx-btn-secondary"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontSize: 13 }}
                  >
                    Manage subscription
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ── Training preferences ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Training preferences</div>
            <div className="dx-card-body">

              <div className="dx-form-section" style={{ borderBottom: 'none' }}>
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600 }}>
                  Weekly case goal
                  {statusText(prefStatus) && (
                    <span className="dx-save-status" style={{ marginLeft: 8, fontWeight: 400, color: prefStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
                      {statusText(prefStatus)}
                    </span>
                  )}
                </p>
                {(() => {
                  const effectiveCap = tier === 'free' ? 14 : 49
                  return (
                    <>
                      <input
                        className="dx-input"
                        type="number"
                        min={1}
                        max={effectiveCap}
                        value={focusSettings.weeklyVolume}
                        onChange={e => setFocusSettings({ weeklyVolume: Math.max(1, Math.min(effectiveCap, parseInt(e.target.value, 10) || 1)) })}
                        onBlur={autosaveVolume}
                        onKeyDown={e => { if (e.key === 'Enter') autosaveVolume() }}
                        style={{ maxWidth: 80 }}
                      />
                      <p className="dx-help-text">
                        {tier === 'free' ? `Free plan: up to ${effectiveCap} cases/week. ` : ''}
                        Number of cases you aim to complete each week — drives the weekly goal on your dashboard and the pace on Focus Areas.
                      </p>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* ── Notifications ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Notifications</div>
            <div className="dx-card-body">
              <div className="dx-form-section" style={{ paddingTop: 0 }}>
                <p className="dx-help-text" style={{ marginBottom: 8 }}>
                  Email delivery is not switched on yet. Your choices are saved and will be
                  respected the moment it is — and every email carries a one-click unsubscribe.
                </p>
                <label className="dx-checkbox-row">
                  <input
                    type="checkbox"
                    checked={emailCaseReminders}
                    onChange={e => autosaveNotifications({ reminders: e.target.checked, weekly: emailWeeklySummary })}
                  />
                  <span className="dx-checkbox-label">Case reminders</span>
                </label>
                {/* Copy matches the implementation: buildReminder() fires after
                    REMINDER_AFTER_DAYS idle days and gives up after 45. */}
                <p className="dx-checkbox-desc">A nudge after about five days without a case, and never more than one at a time.</p>
                <label className="dx-checkbox-row" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={emailWeeklySummary}
                    onChange={e => autosaveNotifications({ reminders: emailCaseReminders, weekly: e.target.checked })}
                  />
                  <span className="dx-checkbox-label">Weekly performance summary</span>
                </label>
                <p className="dx-checkbox-desc">
                  Cases completed, your average score, how it compares with last week, and your weakest area.
                  {statusText(notifStatus) && (
                    <span className="dx-save-status" style={{ marginLeft: 8, color: notifStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
                      {statusText(notifStatus)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ── Appearance ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Appearance</div>
            <div className="dx-card-body">
              <div className="dx-form-section" style={{ paddingTop: 0 }}>
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600 }}>Theme</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['light', 'dark', 'auto'] as Scheme[]).map(s => (
                    <button
                      key={s}
                      aria-label={`${s === 'auto' ? 'Auto (system)' : s.charAt(0).toUpperCase() + s.slice(1)} theme`}
                      aria-pressed={colorScheme === s}
                      className={`dx-chip${colorScheme === s ? ' active' : ''}`}
                      onClick={() => {
                        setColorScheme(s)
                        setScheme(s)
                      }}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {s === 'light' ? 'Light' : s === 'dark' ? 'Dark' : 'Auto'}
                    </button>
                  ))}
                </div>
                <p className="dx-help-text">Auto follows your operating system&apos;s dark/light preference.</p>
              </div>
            </div>
          </div>

          {/* ── Data on this device ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Data on this device</div>
            <div className="dx-card-body">
              <div className="dx-form-section" style={{ paddingTop: 0, borderBottom: 'none' }}>
                <p className="dx-help-text" style={{ marginBottom: 10 }}>
                  Your recall deck, mastery, calibration, and local case history live in this browser
                  {userId ? ' and sync to your account.' : '. Signed out, this browser is their only copy.'}
                  {' '}Export from{' '}
                  <a href="/history" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Case History</a> (CSV/JSON) or{' '}
                  <a href="/recall" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Recall</a> (Anki deck).
                </p>
                <div className="dx-form-actions">
                  <button className="dx-btn-secondary" onClick={clearLocalData} disabled={cleared}>
                    {cleared ? 'Cleared ✓' : 'Clear local data'}
                  </button>
                  <p className="dx-help-text" style={{ margin: 0 }}>
                    {userId
                      ? 'Account copies are unaffected and restore on the next sync.'
                      : 'Cannot be undone while signed out.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Account ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Account</div>
            <div className="dx-card-body">

              {/* Sign out */}
              <div className="dx-form-section" style={{ paddingTop: 0 }}>
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600 }}>Sign out</p>
                <div className="dx-form-actions">
                  <button className="dx-btn-secondary" onClick={signOut}>Sign out</button>
                </div>
              </div>

              {/* Change password */}
              <div className="dx-form-section">
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600 }}>Change password</p>
                <div className="dx-field">
                  <label className="dx-label">Current password</label>
                  <input
                    className="dx-input"
                    type="password"
                    autoComplete="current-password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    style={{ maxWidth: 320 }}
                  />
                </div>
                <div className="dx-field">
                  <label className="dx-label">New password</label>
                  <input
                    className="dx-input"
                    type="password"
                    autoComplete="new-password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="At least 8 characters"
                    style={{ maxWidth: 320 }}
                  />
                </div>
                <div className="dx-field">
                  <label className="dx-label">Confirm new password</label>
                  <input
                    className="dx-input"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Re-enter new password"
                    style={{ maxWidth: 320 }}
                  />
                </div>
                <div className="dx-form-actions">
                  <button
                    className="dx-btn-primary"
                    style={{ fontSize: 13, padding: '7px 18px' }}
                    onClick={changePassword}
                    disabled={pwStatus === 'saving' || !currentPw || !newPw}
                  >
                    Update password
                  </button>
                  {statusText(pwStatus) && (
                    <span className="dx-save-status" style={{ color: pwStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
                      {pwStatus === 'error' ? (!currentPw ? 'Enter your current password' : newPw !== confirmPw ? 'Passwords don\'t match' : 'Minimum 8 characters') : statusText(pwStatus)}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete account */}
              <div className="dx-form-section" style={{ borderBottom: 'none' }}>
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>
                  Delete account
                </p>
                <p className="dx-help-text" style={{ color: 'var(--red)', opacity: 0.8 }}>
                  Permanently deletes your account and all case history. This cannot be undone.
                </p>
                <div className="dx-field">
                  <label className="dx-label">Type your email to confirm</label>
                  <input
                    className="dx-input"
                    type="email"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="Type your email address"
                    style={{ maxWidth: 320 }}
                  />
                </div>
                <div className="dx-form-actions">
                  <button
                    className="dx-btn-danger"
                    onClick={deleteAccount}
                    disabled={deleteConfirm !== email || deleteStatus === 'saving'}
                    style={{ opacity: deleteConfirm !== email ? 0.5 : 1 }}
                  >
                    {deleteStatus === 'saving' ? 'Deleting…' : 'Delete my account'}
                  </button>
                  {deleteStatus === 'error' && (
                    <span className="dx-save-status" style={{ color: 'var(--red)' }}>Failed — try again</span>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

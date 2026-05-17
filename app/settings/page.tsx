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

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DIFF_MIX_OPTIONS: { value: FocusSettings['difficultyMix']; label: string }[] = [
  { value: 'balanced',          label: 'Balanced (default)' },
  { value: 'foundations-heavy', label: 'Foundations heavy' },
  { value: 'clinical-heavy',    label: 'Clinical heavy' },
  { value: 'advanced-heavy',    label: 'Advanced heavy' },
]
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

  // Password change
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      setEmail(user.email ?? '')
      supabase
        .from('profiles')
        .select('display_name,tier,email_case_reminders,email_weekly_summary,rest_days,weekly_volume,difficulty_mix,default_system')
        .eq('id', user.id)
        .single()
        .then(({ data: p }) => {
          if (!p) return
          setDisplayName((p.display_name as string | null) ?? '')
          setTier((p.tier as string) ?? 'free')
          setEmailCaseReminders((p.email_case_reminders as boolean) ?? true)
          setEmailWeeklySummary((p.email_weekly_summary as boolean) ?? true)

          // Merge DB training prefs with localStorage
          const local = loadFocusSettings()
          const merged: FocusSettings = {
            restDays:      (p.rest_days as string[] | null) ?? local.restDays,
            weeklyVolume:  (p.weekly_volume as number | null) ?? local.weeklyVolume,
            difficultyMix: ((p.difficulty_mix as FocusSettings['difficultyMix'] | null) ?? local.difficultyMix),
          }
          setFocusSettings(merged)
        })
    })
    setFocusSettings(loadFocusSettings())
    setColorScheme(getScheme())
  }, [])

  async function saveProfile() {
    if (!userId) return
    setProfileStatus('saving')
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName }),
    })
    setProfileStatus(res.ok ? 'saved' : 'error')
    setTimeout(() => setProfileStatus('idle'), 2500)
  }

  async function savePrefs() {
    if (!userId) return
    setPrefStatus('saving')
    saveFocusSettings(focusSettings)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rest_days:      focusSettings.restDays,
        weekly_volume:  focusSettings.weeklyVolume,
        difficulty_mix: focusSettings.difficultyMix,
      }),
    })
    setPrefStatus(res.ok ? 'saved' : 'error')
    setTimeout(() => setPrefStatus('idle'), 2500)
  }

  async function saveNotifications() {
    if (!userId) return
    setNotifStatus('saving')
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_case_reminders: emailCaseReminders, email_weekly_summary: emailWeeklySummary }),
    })
    setNotifStatus(res.ok ? 'saved' : 'error')
    setTimeout(() => setNotifStatus('idle'), 2500)
  }

  async function changePassword() {
    if (!currentPw) { setPwStatus('error'); setTimeout(() => setPwStatus('idle'), 3000); return }
    if (newPw.length < 8) { setPwStatus('error'); setTimeout(() => setPwStatus('idle'), 3000); return }
    if (newPw !== confirmPw) { setPwStatus('error'); setTimeout(() => setPwStatus('idle'), 3000); return }
    setPwStatus('saving')
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPw, password: newPw }),
    })
    if (res.ok) { setPwStatus('saved'); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
    else setPwStatus('error')
    setTimeout(() => setPwStatus('idle'), 3000)
  }

  async function deleteAccount() {
    if (deleteConfirm !== email) return
    if (!window.confirm('This will permanently delete your account and all your case history. This cannot be undone. Continue?')) return
    setDeleteStatus('saving')
    const res = await fetch('/api/account/delete', { method: 'POST' })
    if (res.ok) {
      window.location.href = '/'
    } else {
      setDeleteStatus('error')
      setTimeout(() => setDeleteStatus('idle'), 3000)
    }
  }

  function signOut() {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/auth/logout'
    document.body.appendChild(form)
    form.submit()
  }

  function toggleRestDay(day: string) {
    setFocusSettings(prev => ({
      ...prev,
      restDays: prev.restDays.includes(day)
        ? prev.restDays.filter(d => d !== day)
        : [...prev.restDays, day],
    }))
  }

  const statusText = (s: SaveStatus, errMsg?: string) =>
    s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved ✓' : s === 'error' ? (errMsg ?? 'Error — try again') : ''

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName || 'User'} tier={tier} activePage="settings" />
      <div className="dx-main">
        <div className="dx-content">

          <div style={{ marginBottom: 24 }}>
            <h1 className="heading-display text-[22px]"><span className="heading-accent">Settings</span></h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Manage your profile and preferences
            </p>
          </div>

          {/* ── Profile ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Profile</div>
            <div className="dx-card-body">
              <div className="dx-form-section">
                <div className="dx-field">
                  <label className="dx-label">Display name</label>
                  <input
                    className="dx-input"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    maxLength={60}
                    placeholder="Your name"
                    style={{ maxWidth: 320 }}
                  />
                  <p className="dx-help-text" style={{ margin: '4px 0 0' }}>{displayName.length}/60 characters</p>
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
                <div className="dx-form-actions">
                  <button className="dx-btn-primary" style={{ fontSize: 13, padding: '7px 18px' }} onClick={saveProfile} disabled={profileStatus === 'saving'}>
                    Save profile
                  </button>
                  {statusText(profileStatus) && (
                    <span className="dx-save-status" style={{ color: profileStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
                      {statusText(profileStatus)}
                    </span>
                  )}
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
                      onClick={e => {
                        if (!navigator.userAgent.includes('Mobi') && !document.createElement('a').href.startsWith('mailto')) {
                          e.preventDefault()
                          navigator.clipboard?.writeText(SUPPORT_EMAIL).catch(() => {})
                        }
                      }}
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 18px' }}
                    >
                      Upgrade to Pro →
                    </a>
                    <p className="dx-help-text" style={{ margin: 0 }}>
                      Opens your email app. No email client?{' '}
                      <button
                        className="underline text-ink-secondary bg-transparent border-0 cursor-pointer p-0 text-[inherit]"
                        onClick={() => navigator.clipboard?.writeText(SUPPORT_EMAIL)}
                      >
                        Copy address
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

              <div className="dx-form-section">
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600 }}>Rest days</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day}
                      className={`dx-chip${focusSettings.restDays.includes(day) ? ' active' : ''}`}
                      onClick={() => toggleRestDay(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <p className="dx-help-text">Rest days are skipped in your weekly training plan.</p>
              </div>

              <div className="dx-form-section">
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600 }}>Weekly case goal</p>
                {(() => {
                  const activeDays = 7 - focusSettings.restDays.length
                  const effectiveCap = tier === 'free' ? Math.min(14, activeDays * 2) : 49
                  return (
                    <>
                      <input
                        className="dx-input"
                        type="number"
                        min={1}
                        max={effectiveCap}
                        value={focusSettings.weeklyVolume}
                        onChange={e => setFocusSettings(prev => ({ ...prev, weeklyVolume: Math.max(1, Math.min(effectiveCap, parseInt(e.target.value, 10) || 1)) }))}
                        style={{ maxWidth: 80 }}
                      />
                      <p className="dx-help-text">
                        {tier === 'free'
                          ? `Free plan: up to 2 cases per active day (max ${effectiveCap}/week with your current rest days). `
                          : ''}
                        Number of cases you aim to complete each week.
                      </p>
                    </>
                  )
                })()}
              </div>

              <div className="dx-form-section">
                <p className="dx-form-section-title" style={{ fontSize: 13, fontWeight: 600 }}>Difficulty mix</p>
                <select
                  className="dx-select"
                  value={focusSettings.difficultyMix}
                  onChange={e => setFocusSettings(prev => ({ ...prev, difficultyMix: e.target.value as FocusSettings['difficultyMix'] }))}
                  style={{ maxWidth: 240 }}
                >
                  {DIFF_MIX_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="dx-help-text">Biases your weekly plan toward the selected difficulty tier.</p>
              </div>

              <div className="dx-form-actions">
                <button className="dx-btn-primary" style={{ fontSize: 13, padding: '7px 18px' }} onClick={savePrefs} disabled={prefStatus === 'saving'}>
                  Save preferences
                </button>
                {statusText(prefStatus) && (
                  <span className="dx-save-status" style={{ color: prefStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
                    {statusText(prefStatus)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Notifications ── */}
          <div className="dx-card">
            <div className="dx-card-header" style={{ fontWeight: 700 }}>Notifications</div>
            <div className="dx-card-body">
              <div className="dx-form-section" style={{ paddingTop: 0 }}>
                <p className="dx-help-text" style={{ marginBottom: 8 }}>
                  Email sending is coming soon — your preferences are saved and will take effect when enabled.
                </p>
                <label className="dx-checkbox-row">
                  <input
                    type="checkbox"
                    checked={emailCaseReminders}
                    onChange={e => setEmailCaseReminders(e.target.checked)}
                  />
                  <span className="dx-checkbox-label">Daily case reminders</span>
                </label>
                <p className="dx-checkbox-desc">A nudge if you haven&apos;t started a case by 8 PM.</p>
                <label className="dx-checkbox-row" style={{ marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={emailWeeklySummary}
                    onChange={e => setEmailWeeklySummary(e.target.checked)}
                  />
                  <span className="dx-checkbox-label">Weekly performance summary</span>
                </label>
                <p className="dx-checkbox-desc">Your scores, streaks, and top weak areas every Monday.</p>
                <div className="dx-form-actions">
                  <button className="dx-btn-primary" style={{ fontSize: 13, padding: '7px 18px' }} onClick={saveNotifications} disabled={notifStatus === 'saving'} title="Preferences will take effect once email sending is enabled">
                    Save preferences (pending email activation)
                  </button>
                  {statusText(notifStatus) && (
                    <span className="dx-save-status" style={{ color: notifStatus === 'error' ? 'var(--red)' : 'var(--muted)' }}>
                      {statusText(notifStatus)}
                    </span>
                  )}
                </div>
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

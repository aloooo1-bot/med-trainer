'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/app/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/'

  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
    } else {
      router.push(redirectTo)
      router.refresh()
    }
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
        emailRedirectTo: `${location.origin}/auth/callback?next=${redirectTo}`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a confirmation link.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-2xl font-serif font-semibold text-ink-primary mb-1 tracking-tight">MedTrainer</div>
          <p className="text-xs text-ink-tertiary">Sign in to track your progress across devices</p>
        </div>

        {/* Card */}
        <div className="rounded-[14px] border border-surface-3 bg-surface-1 p-6 shadow-sm">

          {/* Tabs */}
          <div className="flex mb-6 border-b border-surface-3">
            {(['login', 'signup'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setMessage(null) }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                  tab === t
                    ? 'text-ink-primary border-b-2 border-primary-500 -mb-px'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {message ? (
            <div className="rounded-lg bg-confirmed/10 border border-confirmed/25 p-4 text-sm text-confirmed text-center">
              {message}
              <div className="mt-3">
                <button
                  onClick={() => { setMessage(null); setTab('login') }}
                  className="text-xs text-ink-tertiary hover:text-ink-secondary underline"
                >
                  Back to sign in
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={tab === 'login' ? handleLogin : handleSignup} className="space-y-4">

              {tab === 'signup' && (
                <div>
                  <label className="block text-xs font-mono uppercase tracking-[0.10em] text-ink-tertiary mb-1.5">Display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-md border border-surface-3 bg-surface-0 px-3 py-2.5 text-sm text-ink-primary placeholder-ink-muted focus:border-primary-500 focus:outline-none transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.10em] text-ink-tertiary mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-surface-3 bg-surface-0 px-3 py-2.5 text-sm text-ink-primary placeholder-ink-muted focus:border-primary-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.10em] text-ink-tertiary mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-surface-3 bg-surface-0 px-3 py-2.5 text-sm text-ink-primary placeholder-ink-muted focus:border-primary-500 focus:outline-none transition-colors"
                />
              </div>

              {error && (
                <p className="text-xs text-critical rounded-md bg-critical/8 border border-critical/20 px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[10px] bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
              >
                {loading
                  ? (tab === 'login' ? 'Signing in…' : 'Creating account…')
                  : (tab === 'login' ? 'Sign In' : 'Create Account')
                }
              </button>
            </form>
          )}
        </div>

        <p className="text-center mt-4 text-xs text-ink-tertiary">
          <a href="/" className="hover:text-ink-secondary transition-colors">← Continue without signing in</a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

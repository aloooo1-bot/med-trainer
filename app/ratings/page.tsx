import { createAdminClient } from '../lib/supabase/admin'
import type { RatingRow } from '../lib/supabase/types'
import RatingsDashboard from './RatingsDashboard'
import Link from 'next/link'

async function fetchRatings(): Promise<RatingRow[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return []
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('ratings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) { console.error('ratings fetch:', error.message); return [] }
    return data ?? []
  } catch {
    return []
  }
}

export default async function RatingsPage() {
  const rows = await fetchRatings()
  const notConfigured = !process.env.SUPABASE_SERVICE_ROLE_KEY

  return (
    <div className="min-h-screen bg-surface-0 text-ink-primary">
      <header className="border-b border-surface-3 bg-surface-1 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="heading-display text-[18px]">Rating <span className="heading-accent">analysis</span></h1>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {notConfigured
              ? 'Supabase not configured — showing no data'
              : `${rows.length} rating${rows.length !== 1 ? 's' : ''} · all devices · all users`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/ratings" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">
            Admin
          </a>
          <Link href="/review" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">Review</Link>
          <Link href="/history" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">History</Link>
          <Link href="/" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">← Trainer</Link>
        </div>
      </header>

      {notConfigured ? (
        <div className="max-w-xl mx-auto mt-20 px-6 text-center">
          <div className="text-3xl text-ink-muted mb-4">⚙️</div>
          <h2 className="text-base font-semibold text-ink-secondary mb-2">Supabase not configured</h2>
          <p className="text-sm text-ink-tertiary mb-4">
            Add <code className="text-blue-400">NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
            <code className="text-blue-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{' '}
            <code className="text-blue-400">SUPABASE_SERVICE_ROLE_KEY</code> to{' '}
            <code className="text-ink-secondary">.env.local</code> to start collecting ratings.
          </p>
          <Link href="/" className="text-xs text-blue-400 hover:text-blue-300 underline">← Back to trainer</Link>
        </div>
      ) : (
        <main className="p-6 max-w-6xl mx-auto">
          <RatingsDashboard initialRows={rows} />
        </main>
      )}
    </div>
  )
}

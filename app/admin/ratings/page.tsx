import { createAdminClient } from '../../lib/supabase/admin'
import type { RatingRow } from '../../lib/supabase/types'
import RatingsDashboard from '../../ratings/RatingsDashboard'
import Link from 'next/link'

interface CaseSummary {
  id: string
  system: string
  difficulty: string
  diagnosis: string
  variant_index: number
  is_generated: boolean
}

async function fetchAll() {
  const supabase = createAdminClient()

  const [ratingsRes, casesRes, usersRes] = await Promise.all([
    supabase
      .from('ratings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, variant_index, is_generated')
      .order('system')
      .order('difficulty')
      .order('diagnosis'),
    supabase.auth.admin.listUsers(),
  ])

  return {
    ratings: (ratingsRes.data ?? []) as RatingRow[],
    cases:   (casesRes.data ?? []) as CaseSummary[],
    users:   usersRes.data?.users ?? [],
    errors: [ratingsRes.error?.message, casesRes.error?.message, usersRes.error?.message].filter(Boolean),
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function AdminRatingsPage() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-3xl text-ink-muted mb-4">⚙️</div>
          <p className="text-ink-secondary text-sm mb-2">Supabase not configured.</p>
          <p className="text-ink-tertiary text-xs mb-6">Set SUPABASE_SERVICE_ROLE_KEY in .env.local</p>
          <Link href="/" className="text-xs text-blue-400 hover:text-blue-300 underline">← Back to trainer</Link>
        </div>
      </div>
    )
  }

  const { ratings, cases, users, errors } = await fetchAll()

  const totalCases     = cases.length
  const generatedCases = cases.filter(c => c.is_generated).length
  const ratedCases     = new Set(ratings.map(r => r.case_id).filter(Boolean)).size
  const withComments   = ratings.filter(r => r.comment.trim()).length
  const anonRatings    = ratings.filter(r => !r.user_id).length

  // Per-system aggregate
  const systems = [...new Set(cases.map(c => c.system))].sort()
  const bySys = systems.map(sys => {
    const caseIds = new Set(cases.filter(c => c.system === sys).map(c => c.id))
    const sysRatings = ratings.filter(r => r.system === sys)
    const overallVals = sysRatings.map(r => r.overall).filter((v): v is number => v != null)
    const avg = overallVals.length ? overallVals.reduce((a, b) => a + b, 0) / overallVals.length : null
    return {
      sys,
      totalSlots: caseIds.size,
      generatedCount: cases.filter(c => c.system === sys && c.is_generated).length,
      ratingCount: sysRatings.length,
      avg,
    }
  })

  return (
    <div className="min-h-screen bg-surface-0 text-ink-primary">
      <header className="border-b border-surface-3 bg-surface-1 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="heading-display text-[18px]">Admin — <span className="heading-accent">ratings</span></h1>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {ratings.length} rating{ratings.length !== 1 ? 's' : ''} · {users.length} user{users.length !== 1 ? 's' : ''} · {generatedCases}/{totalCases} cases generated
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">Usage Admin</Link>
          <Link href="/admin/cases" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">Cases</Link>
          <Link href="/ratings" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">Ratings</Link>
          <Link href="/" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">← Trainer</Link>
        </div>
      </header>

      <main className="p-6 space-y-8 max-w-6xl mx-auto">

        {errors.length > 0 && (
          <div className="rounded-lg border border-red-900/40 bg-red-900/10 px-5 py-3 text-xs text-red-400">
            DB errors: {errors.join(' | ')}
          </div>
        )}

        {/* Top-level stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: 'Users',            value: users.length.toString() },
            { label: 'Total ratings',    value: ratings.length.toString() },
            { label: 'With comments',    value: withComments.toString() },
            { label: 'Anonymous',        value: anonRatings.toString() },
            { label: 'Cases in library', value: `${generatedCases} / ${totalCases}` },
            { label: 'Cases rated',      value: ratedCases.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-surface-3 bg-surface-1 p-4">
              <div className="text-xs text-ink-tertiary mb-1">{label}</div>
              <div className="text-xl font-bold tabular-nums text-ink-primary">{value}</div>
            </div>
          ))}
        </div>

        {/* Users table */}
        {users.length > 0 && (
          <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
            <div className="border-b border-surface-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Users
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-3 text-ink-tertiary">
                    <th className="px-5 py-2.5 text-left font-medium">Email</th>
                    <th className="px-3 py-2.5 text-left font-medium">Joined</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ratings</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-surface-3/40 hover:bg-surface-2/20">
                      <td className="px-5 py-2.5 text-ink-secondary">{u.email ?? '—'}</td>
                      <td className="px-3 py-2.5 text-ink-tertiary">{fmtDate(u.created_at)}</td>
                      <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">
                        {ratings.filter(r => r.user_id === u.id).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Case library coverage */}
        <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
          <div className="border-b border-surface-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            Case Library Coverage by System
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-3 text-ink-tertiary">
                  <th className="px-5 py-2.5 text-left font-medium">System</th>
                  <th className="px-3 py-2.5 text-right font-medium">Slots</th>
                  <th className="px-3 py-2.5 text-right font-medium">Generated</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ratings</th>
                  <th className="px-4 py-2.5 text-right font-medium">Avg Overall</th>
                </tr>
              </thead>
              <tbody>
                {bySys.map(row => (
                  <tr key={row.sys} className="border-b border-surface-3/40 hover:bg-surface-2/20">
                    <td className="px-5 py-2.5 text-ink-secondary">{row.sys}</td>
                    <td className="px-3 py-2.5 text-right text-ink-tertiary tabular-nums">{row.totalSlots}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={row.generatedCount > 0 ? 'text-green-400' : 'text-ink-tertiary'}>
                        {row.generatedCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">{row.ratingCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.avg != null
                        ? <span className={row.avg >= 4 ? 'text-green-400' : row.avg >= 3 ? 'text-yellow-400' : 'text-red-400'}>
                            {row.avg.toFixed(1)} ★
                          </span>
                        : <span className="text-ink-tertiary">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Full ratings dashboard */}
        {ratings.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-4">All Ratings</div>
            <RatingsDashboard initialRows={ratings} />
          </div>
        )}

      </main>
    </div>
  )
}

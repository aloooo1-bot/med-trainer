import { notFound } from 'next/navigation'
import { createAdminClient } from '../../../lib/supabase/admin'
import type { RatingRow } from '../../../lib/supabase/types'
import CaseActions from './CaseActions'
import CasePreview from './CasePreview'

interface CaseDetail {
  id: string
  system: string
  difficulty: string
  diagnosis: string
  is_generated: boolean
  generated_at: string | null
  case_data: Record<string, unknown> | null
  verified_images: Record<string, unknown> | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtStars(val: number | null) {
  if (val == null) return '—'
  return '★'.repeat(val) + '☆'.repeat(5 - val)
}

function caseSource(id: string) {
  if (id.startsWith('img-')) return 'img'
  if (id.startsWith('local-')) return 'local'
  return 'manifest'
}

async function fetchCase(id: string) {
  const supabase = createAdminClient()
  const [caseRes, ratingsRes, usersRes] = await Promise.all([
    (supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, is_generated, generated_at, case_data, verified_images')
      .eq('id', id)
      .single() as unknown as Promise<{ data: CaseDetail | null; error: { message: string } | null }>),
    supabase
      .from('ratings')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false }),
    supabase.auth.admin.listUsers(),
  ])
  return {
    caseRow: caseRes.data,
    ratings: (ratingsRes.data ?? []) as RatingRow[],
    users:   usersRes.data?.users ?? [],
    error:   caseRes.error?.message,
  }
}

export default async function AdminCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const decodedId = decodeURIComponent(id)

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <p className="text-ink-secondary text-sm">SUPABASE_SERVICE_ROLE_KEY not set.</p>
      </div>
    )
  }

  const { caseRow, ratings, users, error } = await fetchCase(decodedId)

  if (error || !caseRow) {
    notFound()
  }

  const userMap = new Map(users.map(u => [u.id, u.email ?? u.id]))
  const src = caseSource(caseRow.id)
  const verifiedImages = caseRow.verified_images as Record<string, { imageUrl?: string; caption?: string; modality?: string }> | null
  const chiefComplaint =
    (caseRow.case_data as { patientInfo?: { chiefComplaint?: string } } | null)?.patientInfo?.chiefComplaint ?? '—'

  return (
    <div className="min-h-screen bg-surface-0 text-ink-primary">
      <header className="border-b border-surface-3 bg-surface-1 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-ink-primary truncate max-w-xl">{caseRow.diagnosis}</h1>
          <p className="text-xs text-ink-tertiary mt-0.5">{caseRow.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href="/admin/cases" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">← All Cases</a>
          <a href="/"            className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">Trainer</a>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Metadata */}
        <section className="rounded-lg border border-surface-3 bg-surface-1 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 text-xs">
            {[
              { label: 'System',      value: caseRow.system },
              { label: 'Difficulty',  value: caseRow.difficulty },
              { label: 'Chief Complaint', value: chiefComplaint },
              { label: 'Source',      value: src },
              { label: 'Generated',   value: caseRow.generated_at ? fmtDate(caseRow.generated_at) : (caseRow.is_generated ? 'yes' : 'not yet') },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-ink-tertiary mb-1">{label}</div>
                <div className="text-ink-primary font-medium">{value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Action buttons */}
        <CaseActions
          caseId={caseRow.id}
          caseData={caseRow.case_data}
          source={src}
        />

        {/* Verified image (img-* only) */}
        {src === 'img' && verifiedImages && Object.entries(verifiedImages).length > 0 && (
          <section className="rounded-lg border border-surface-3 bg-surface-1 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-4">Verified Image</h2>
            {Object.entries(verifiedImages).map(([testName, img]) => (
              <div key={testName} className="space-y-2">
                <p className="text-xs text-ink-secondary font-medium">{testName}</p>
                {img.imageUrl && (
                  <img
                    src={img.imageUrl}
                    alt={img.caption ?? testName}
                    className="max-h-64 rounded border border-surface-3"
                  />
                )}
                {img.caption && <p className="text-xs text-ink-tertiary">{img.caption}</p>}
              </div>
            ))}
          </section>
        )}

        {/* Rendered case view */}
        <CasePreview caseData={caseRow.case_data} difficulty={caseRow.difficulty} />

        {/* Case JSON (collapsed by default — expand to edit) */}
        <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
          <details>
            <summary className="border-b border-surface-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary cursor-pointer select-none hover:text-ink-secondary">
              Case Data (JSON)
            </summary>
            <pre className="p-5 text-xs text-ink-secondary overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(caseRow.case_data, null, 2)}
            </pre>
          </details>
        </section>

        {/* Student feedback */}
        <section className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
          <div className="border-b border-surface-3 px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Student Feedback ({ratings.length})
            </span>
          </div>
          {ratings.length === 0 ? (
            <div className="px-5 py-8 text-xs text-ink-tertiary text-center">No feedback yet.</div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {ratings.map(r => (
                <div key={r.id} className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-ink-secondary">{r.user_id ? (userMap.get(r.user_id) ?? r.user_id) : 'Anonymous'}</span>
                    <span className="text-xs text-ink-tertiary">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-5">
                    {([
                      ['Overall',          r.overall],
                      ['Clinical realism', r.clinical_realism],
                      ['Grading fairness', r.grading_fairness],
                      ['Patient comm.',    r.patient_communication],
                      ['Difficulty',       r.difficulty_accuracy],
                    ] as [string, number | null][]).map(([label, val]) => (
                      <div key={label}>
                        <span className="text-ink-tertiary">{label}: </span>
                        <span className="text-yellow-400 font-mono">{fmtStars(val)}</span>
                      </div>
                    ))}
                  </div>
                  {r.comment?.trim() && (
                    <p className="text-xs text-ink-secondary bg-surface-2/60 rounded px-3 py-2">{r.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}

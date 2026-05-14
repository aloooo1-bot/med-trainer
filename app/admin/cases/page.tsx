import { createAdminClient } from '../../lib/supabase/admin'
import type { RatingRow } from '../../lib/supabase/types'

interface CaseRow {
  id: string
  system: string
  difficulty: string
  diagnosis: string
  chief_complaint: string | null
  is_generated: boolean
  generated_at: string | null
}

function caseSource(id: string): string {
  if (id.startsWith('img-')) return 'img'
  if (id.startsWith('local-')) return 'local'
  return 'manifest'
}

function diffColor(d: string) {
  if (d === 'Foundations') return 'text-blue-400'
  if (d === 'Clinical')    return 'text-yellow-400'
  return 'text-red-400'
}

async function fetchAll() {
  const supabase = createAdminClient()
  const [casesRes, ratingsRes] = await Promise.all([
    supabase
      .from('cases')
      .select<string, CaseRow>('id, system, difficulty, diagnosis, chief_complaint:case_data->patientInfo->>chiefComplaint, is_generated, generated_at')
      .order('system').order('difficulty').order('diagnosis'),
    supabase
      .from('ratings')
      .select('case_id, overall, comment'),
  ])
  return {
    cases:   (casesRes.data  ?? []) as CaseRow[],
    ratings: (ratingsRes.data ?? []) as Pick<RatingRow, 'case_id' | 'overall' | 'comment'>[],
    errors:  [casesRes.error?.message, ratingsRes.error?.message].filter(Boolean) as string[],
  }
}

type SortKey = 'diagnosis' | 'system' | 'difficulty' | 'source' | 'ratings' | 'avg' | 'comments' | 'date'

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; difficulty?: string; source?: string; feedback?: string; sort?: string; order?: string; q?: string }>
}) {
  const { system: sysFilter, difficulty: diffFilter, source: srcFilter, feedback: feedbackFilter, sort, order, q } = await searchParams
  const qFilter = q?.trim().toLowerCase() || ''
  const sortKey = (sort as SortKey | undefined)
  const sortOrder: 'asc' | 'desc' = order === 'desc' ? 'desc' : 'asc'

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <p className="text-ink-secondary text-sm">SUPABASE_SERVICE_ROLE_KEY not set.</p>
      </div>
    )
  }

  const { cases, ratings, errors } = await fetchAll()

  // Index ratings by case_id
  const ratingsByCaseId = new Map<string, Pick<RatingRow, 'case_id' | 'overall' | 'comment'>[]>()
  for (const r of ratings) {
    if (!r.case_id) continue
    const arr = ratingsByCaseId.get(r.case_id) ?? []
    arr.push(r)
    ratingsByCaseId.set(r.case_id, arr)
  }

  const systems    = [...new Set(cases.map(c => c.system))].sort()
  const difficulties = ['Foundations', 'Clinical', 'Advanced']
  const sources    = ['manifest', 'img', 'local']

  let filtered = cases
  if (sysFilter)              filtered = filtered.filter(c => c.system === sysFilter)
  if (diffFilter)             filtered = filtered.filter(c => c.difficulty === diffFilter)
  if (srcFilter)              filtered = filtered.filter(c => caseSource(c.id) === srcFilter)
  if (feedbackFilter === '1') filtered = filtered.filter(c => (ratingsByCaseId.get(c.id)?.length ?? 0) > 0)
  if (qFilter)                filtered = filtered.filter(c => c.diagnosis.toLowerCase().includes(qFilter))

  if (sortKey) {
    const dir = sortOrder === 'desc' ? -1 : 1
    const cmpStr = (a: string, b: string) => a.localeCompare(b) * dir
    const cmpNum = (a: number, b: number) => (a - b) * dir
    const diffRank: Record<string, number> = { Foundations: 0, Clinical: 1, Advanced: 2 }
    filtered = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'diagnosis':  return cmpStr(a.diagnosis, b.diagnosis)
        case 'system':     return cmpStr(a.system, b.system)
        case 'difficulty': return cmpNum(diffRank[a.difficulty] ?? 99, diffRank[b.difficulty] ?? 99)
        case 'source':     return cmpStr(caseSource(a.id), caseSource(b.id))
        case 'ratings': {
          const ra = ratingsByCaseId.get(a.id)?.length ?? 0
          const rb = ratingsByCaseId.get(b.id)?.length ?? 0
          return cmpNum(ra, rb)
        }
        case 'avg': {
          const getAvg = (id: string) => {
            const vals = (ratingsByCaseId.get(id) ?? []).map(r => r.overall).filter((v): v is number => v != null)
            return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : -Infinity
          }
          return cmpNum(getAvg(a.id), getAvg(b.id))
        }
        case 'comments': {
          const cnt = (id: string) => (ratingsByCaseId.get(id) ?? []).filter(r => r.comment?.trim()).length
          return cmpNum(cnt(a.id), cnt(b.id))
        }
        case 'date': {
          const ts = (c: CaseRow) => c.generated_at ? new Date(c.generated_at).getTime() : 0
          return cmpNum(ts(a), ts(b))
        }
        default: return 0
      }
    })
  }

  const generatedCount = cases.filter(c => c.is_generated).length

  function buildFilter(key: string, value: string, current?: string) {
    const params = new URLSearchParams()
    if (sysFilter  && key !== 'system')     params.set('system',     sysFilter)
    if (diffFilter && key !== 'difficulty') params.set('difficulty', diffFilter)
    if (srcFilter  && key !== 'source')     params.set('source',     srcFilter)
    if (feedbackFilter === '1' && key !== 'feedback') params.set('feedback', '1')
    if (qFilter)      params.set('q',     qFilter)
    if (sortKey)      params.set('sort',  sortKey)
    if (sortOrder && sortKey) params.set('order', sortOrder)
    if (value && current !== value) params.set(key, value)
    const qs = params.toString()
    return `/admin/cases${qs ? `?${qs}` : ''}`
  }

  function buildSort(col: SortKey) {
    const params = new URLSearchParams()
    if (sysFilter)              params.set('system',     sysFilter)
    if (diffFilter)             params.set('difficulty', diffFilter)
    if (srcFilter)              params.set('source',     srcFilter)
    if (feedbackFilter === '1') params.set('feedback',   '1')
    if (qFilter)                params.set('q',          qFilter)
    const numeric = col === 'ratings' || col === 'avg' || col === 'comments'
    const defaultOrder: 'asc' | 'desc' = numeric ? 'desc' : 'asc'
    const nextOrder = sortKey === col
      ? (sortOrder === 'asc' ? 'desc' : 'asc')
      : defaultOrder
    params.set('sort', col)
    params.set('order', nextOrder)
    return `/admin/cases?${params.toString()}`
  }

  function SortHeader({ col, label, align }: { col: SortKey; label: string; align?: 'right' }) {
    const active = sortKey === col
    const arrow = active ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'
    return (
      <th className={`px-3 py-3 font-medium${align === 'right' ? ' text-right' : ''}`}>
        <a href={buildSort(col)}
           className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-blue-300' : 'text-ink-tertiary hover:text-ink-secondary'}`}>
          {label} <span className="text-[10px] opacity-60">{arrow}</span>
        </a>
      </th>
    )
  }

  return (
    <div className="min-h-screen bg-surface-0 text-ink-primary">
      <header className="border-b border-surface-3 bg-surface-1 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="heading-display text-[18px]">Admin — <span className="heading-accent">cases</span></h1>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {generatedCount} generated · {cases.length} total slots · {filtered.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/ratings" className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">Ratings</a>
          <a href="/admin"         className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">Usage Admin</a>
          <a href="/"              className="text-xs text-ink-tertiary hover:text-ink-secondary border border-surface-3 rounded px-3 py-1.5 transition-colors">← Trainer</a>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-4">

        {errors.length > 0 && (
          <div className="rounded-lg border border-red-900/40 bg-red-900/10 px-5 py-3 text-xs text-red-400">
            DB errors: {errors.join(' | ')}
          </div>
        )}

        {/* Search */}
        <form method="GET" action="/admin/cases" className="flex items-center gap-2">
          {sysFilter        && <input type="hidden" name="system"     value={sysFilter} />}
          {diffFilter       && <input type="hidden" name="difficulty" value={diffFilter} />}
          {srcFilter        && <input type="hidden" name="source"     value={srcFilter} />}
          {feedbackFilter === '1' && <input type="hidden" name="feedback" value="1" />}
          {sortKey          && <input type="hidden" name="sort"       value={sortKey} />}
          {sortKey          && <input type="hidden" name="order"      value={sortOrder} />}
          <input
            type="text"
            name="q"
            defaultValue={qFilter}
            placeholder="Search diagnosis…"
            className="w-64 rounded border border-surface-3 bg-surface-2 px-3 py-1.5 text-xs text-ink-primary placeholder-gray-600 focus:border-primary-500 focus:outline-none"
          />
          {qFilter && (
            <a href={buildFilter('q', '', qFilter)} className="text-xs text-ink-tertiary hover:text-ink-secondary underline">clear</a>
          )}
        </form>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-ink-tertiary">System:</span>
          {systems.map(s => (
            <a key={s} href={buildFilter('system', s, sysFilter)}
               className={`border rounded px-2 py-1 transition-colors ${sysFilter === s ? 'border-blue-500 text-blue-300 bg-blue-900/20' : 'border-surface-3 text-ink-secondary hover:text-ink-primary'}`}>
              {s}
            </a>
          ))}
          {sysFilter && (
            <a href={buildFilter('system', '', sysFilter)} className="text-ink-tertiary hover:text-ink-secondary underline">clear</a>
          )}
          <span className="text-ink-tertiary mx-1">|</span>
          <span className="text-ink-tertiary">Difficulty:</span>
          {difficulties.map(d => (
            <a key={d} href={buildFilter('difficulty', d, diffFilter)}
               className={`border rounded px-2 py-1 transition-colors ${diffFilter === d ? 'border-blue-500 text-blue-300 bg-blue-900/20' : 'border-surface-3 text-ink-secondary hover:text-ink-primary'}`}>
              {d}
            </a>
          ))}
          {diffFilter && (
            <a href={buildFilter('difficulty', '', diffFilter)} className="text-ink-tertiary hover:text-ink-secondary underline">clear</a>
          )}
          <span className="text-ink-tertiary mx-1">|</span>
          <span className="text-ink-tertiary">Source:</span>
          {sources.map(s => (
            <a key={s} href={buildFilter('source', s, srcFilter)}
               className={`border rounded px-2 py-1 transition-colors ${srcFilter === s ? 'border-blue-500 text-blue-300 bg-blue-900/20' : 'border-surface-3 text-ink-secondary hover:text-ink-primary'}`}>
              {s}
            </a>
          ))}
          {srcFilter && (
            <a href={buildFilter('source', '', srcFilter)} className="text-ink-tertiary hover:text-ink-secondary underline">clear</a>
          )}
          <span className="text-ink-tertiary mx-1">|</span>
          <a href={buildFilter('feedback', '1', feedbackFilter)}
             className={`border rounded px-2 py-1 transition-colors ${feedbackFilter === '1' ? 'border-blue-500 text-blue-300 bg-blue-900/20' : 'border-surface-3 text-ink-secondary hover:text-ink-primary'}`}>
            Has feedback
          </a>
          {feedbackFilter === '1' && (
            <a href={buildFilter('feedback', '', feedbackFilter)} className="text-ink-tertiary hover:text-ink-secondary underline">clear</a>
          )}
        </div>

        {/* Cases table */}
        <div className="rounded-lg border border-surface-3 bg-surface-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-3 text-left">
                  <SortHeader col="date"       label="Added" />
                  <th className="px-4 py-3 font-medium">
                    <a href={buildSort('diagnosis')}
                       className={`inline-flex items-center gap-1 transition-colors ${sortKey === 'diagnosis' ? 'text-blue-300' : 'text-ink-tertiary hover:text-ink-secondary'}`}>
                      Diagnosis <span className="text-[10px] opacity-60">{sortKey === 'diagnosis' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </a>
                  </th>
                  <SortHeader col="system"     label="System" />
                  <SortHeader col="difficulty" label="Diff" />
                  <SortHeader col="source"     label="Source" />
                  <SortHeader col="ratings"    label="Ratings"  align="right" />
                  <SortHeader col="avg"        label="Avg ★"    align="right" />
                  <SortHeader col="comments"   label="Comments" align="right" />
                  <th className="px-3 py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const caseRatings = ratingsByCaseId.get(c.id) ?? []
                  const overallVals = caseRatings.map(r => r.overall).filter((v): v is number => v != null)
                  const avg = overallVals.length ? overallVals.reduce((a, b) => a + b, 0) / overallVals.length : null
                  const commentCount = caseRatings.filter(r => r.comment?.trim()).length
                  const src = caseSource(c.id)
                  return (
                    <tr key={c.id} className="border-b border-surface-3/40 hover:bg-surface-2/20">
                      <td className="px-3 py-2.5 text-ink-tertiary tabular-nums whitespace-nowrap">
                        {c.generated_at
                          ? new Date(c.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className={`font-medium ${c.is_generated ? 'text-ink-primary' : 'text-ink-tertiary'}`}>{c.diagnosis}</div>
                        {c.chief_complaint && <div className="text-ink-tertiary mt-0.5 truncate max-w-md">{c.chief_complaint}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-ink-secondary">{c.system}</td>
                      <td className={`px-3 py-2.5 ${diffColor(c.difficulty)}`}>{c.difficulty}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${
                          src === 'img'      ? 'bg-purple-900/30 text-purple-300' :
                          src === 'local'    ? 'bg-green-900/30 text-green-300' :
                                               'bg-surface-2 text-ink-secondary'
                        }`}>{src}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">{caseRatings.length || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {avg != null
                          ? <span className={avg >= 4 ? 'text-green-400' : avg >= 3 ? 'text-yellow-400' : 'text-red-400'}>
                              {avg.toFixed(1)} ★
                            </span>
                          : <span className="text-ink-tertiary">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-secondary tabular-nums">{commentCount || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <a href={`/admin/cases/${encodeURIComponent(c.id)}`}
                           className="text-blue-400 hover:text-blue-300 underline">View →</a>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-ink-tertiary">No cases match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}

import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { createAdminClient } from '../supabase/admin'
import { buildCasePrompt, buildCaseSystemPrompt } from '../casePrompt'
import { reconcileHistoryConsistency, sanitizePmhLeak } from '../generators/shared'
import { MANIFEST, makeCaseId } from '../caseManifest'
import { callModel } from './llm'
import { splitCase, joinCase } from './caseTiers'
import type { CaseData } from '../../trainer/_lib/types'
import type { RawUsage } from '../analytics'

/**
 * Server-side case acquisition: Supabase cache → live generation.
 * All of this used to run in the browser, which meant the full case (answer
 * included) transited the network and the generation prompt was client-forgeable.
 */

export interface AcquiredCase {
  caseId: string | null
  caseData: CaseData
  imagingCache?: Record<string, unknown[]>
  generated: boolean
  usage?: RawUsage
}

const LOCAL_CASE_DIR = path.join(process.cwd(), '.data', 'cases')

function dbTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('db timeout')), ms)),
  ])
}

function supabaseAvailable(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SESSION_STORE !== 'file'
}

// Column sets: the tiered columns exist only after migration 0001. Reads try
// the tiered set first and fall back to legacy case_data so the app works
// whether or not 0001 has been run.
const TIERED_COLS = 'id, case_data, presentation_data, patient_knowledge, clinical_findings, ground_truth, imaging_cache, verified_images, is_generated'
const LEGACY_COLS = 'id, case_data, imaging_cache, verified_images, is_generated'
const MISSING_COL_RE = /column .* does not exist|could not find the .* column|schema cache/i

// Memoized once per process: whether the tiered columns exist. Avoids a
// guaranteed-failing tiered query on every pull before migration 0001 is run
// (that doubling is what made pre-0001 pulls ~5s instead of ~sub-second).
// Restart the server after running 0001 to re-detect.
let tieredColumnsExist: boolean | undefined

/**
 * Run a cases query built with a given column-select string, retrying with the
 * legacy column set if the tiered columns don't exist yet (pre-migration 0001).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryCasesWithFallback<T = any>(build: (cols: string) => PromiseLike<{ data: T; error: { message?: string } | null }>): Promise<{ data: T | null; error: { message?: string } | null }> {
  if (tieredColumnsExist === false) {
    return dbTimeout(build(LEGACY_COLS), 8000)
  }
  const res = await dbTimeout(build(TIERED_COLS), 8000)
  if (res.error && MISSING_COL_RE.test(res.error.message ?? '')) {
    tieredColumnsExist = false
    return dbTimeout(build(LEGACY_COLS), 8000)
  }
  if (!res.error) tieredColumnsExist = true
  return res
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCaseData(row: any): CaseData | null {
  if (row?.presentation_data) {
    return joinCase({
      presentation: row.presentation_data,
      patientKnowledge: row.patient_knowledge ?? {},
      clinicalFindings: row.clinical_findings ?? {},
      groundTruth: row.ground_truth ?? {},
    })
  }
  return (row?.case_data as CaseData | null) ?? null
}

/** Read a cached case by id — tiered columns preferred, legacy case_data fallback. */
export async function lookupCachedCase(caseId: string): Promise<AcquiredCase | null> {
  if (supabaseAvailable()) {
    try {
      const db = createAdminClient()
      const { data, error } = await queryCasesWithFallback(cols =>
        db.from('cases').select(cols).eq('id', caseId).maybeSingle())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data as any
      if (!error && row?.is_generated) {
        const caseData = rowToCaseData(row)
        if (caseData) {
          return {
            caseId,
            caseData,
            imagingCache: mergeImagingCache(row.imaging_cache, row.verified_images),
            generated: false,
          }
        }
      }
    } catch { /* unreachable DB → fall through */ }
  }

  // Dev file cache
  try {
    const raw = await fs.readFile(path.join(LOCAL_CASE_DIR, `${sanitizeId(caseId)}.json`), 'utf8')
    const parsed = JSON.parse(raw) as { caseData: CaseData; imagingCache?: Record<string, unknown[]> }
    return { caseId, caseData: parsed.caseData, imagingCache: parsed.imagingCache, generated: false }
  } catch {
    return null
  }
}

/** Random image-anchored case for system+difficulty (verified images pre-attached). */
export async function pickImageFirstCase(system: string, difficulty: string): Promise<AcquiredCase | null> {
  if (!supabaseAvailable()) return null
  try {
    const db = createAdminClient()
    const { data, error } = await queryCasesWithFallback(cols =>
      db.from('cases').select(cols)
        .eq('system', system).eq('difficulty', difficulty)
        .like('id', 'img-%').not('verified_images', 'is', null)
        .eq('is_generated', true).limit(20))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[] | null
    if (error || !rows?.length) return null
    const picked = rows[Math.floor(Math.random() * rows.length)]
    const caseData = rowToCaseData(picked)
    if (!caseData) return null
    return {
      caseId: picked.id,
      caseData,
      imagingCache: mergeImagingCache(null, picked.verified_images),
      generated: false,
    }
  } catch {
    return null
  }
}

/** Pick a manifest diagnosis server-side (the client never learns which). */
export function pickManifestDiagnosis(system: string, difficulty: string): string | null {
  const list = MANIFEST[system]?.[difficulty] ?? []
  if (!list.length) return null
  return list[Math.floor(Math.random() * list.length)]
}

/** Generate a case live with the LLM (server-side prompt construction only). */
export async function generateCaseLive(
  system: string,
  difficulty: string,
  diagnosis: string | null,
  opts: { redo?: boolean } = {},
): Promise<AcquiredCase> {
  const systemPrompt = buildCaseSystemPrompt(null)
  let prompt = buildCasePrompt(system, difficulty, diagnosis ?? undefined)
  if (opts.redo) {
    prompt += '\nUse a fresh patient demographic profile and a different clinical presentation than a typical textbook case for this diagnosis.'
  }

  const { text, usage } = await callModel('case_generation', {
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 12000,
  })
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in case-generation response')
  const rawParsed = JSON.parse(match[0]) as CaseData
  const parsed = sanitizePmhLeak(
    reconcileHistoryConsistency(rawParsed as unknown as Record<string, unknown>),
  ) as unknown as CaseData

  // Merge relevantTests results into the orderable pools, same as before.
  if (Array.isArray(parsed.relevantTests)) {
    for (const rt of parsed.relevantTests) {
      if (!rt.name) continue
      if (rt.isImaging && rt.imagingResult) {
        parsed.imagingResults[rt.name] = rt.imagingResult
        if (!parsed.availableImaging.includes(rt.name)) parsed.availableImaging.push(rt.name)
      } else if (!rt.isImaging && rt.labResult) {
        parsed.labResults[rt.name] = rt.labResult
        if (!parsed.availableLabs.includes(rt.name)) parsed.availableLabs.push(rt.name)
      }
    }
  }

  const caseId = diagnosis ? makeCaseId(system, difficulty, diagnosis, 0) : null
  return { caseId, caseData: parsed, generated: true, usage }
}

/** Persist a freshly generated case (tiered columns; dev file cache fallback). */
export async function saveGeneratedCase(
  caseId: string,
  system: string,
  difficulty: string,
  diagnosis: string,
  caseData: CaseData,
): Promise<void> {
  const enriched = { ...caseData, nativeDifficulty: difficulty } as CaseData & { nativeDifficulty: string }
  const tiers = splitCase(enriched)

  if (supabaseAvailable()) {
    try {
      const db = createAdminClient()
      const { error } = await dbTimeout(
        db.from('cases').upsert({
          id: caseId,
          system,
          difficulty,
          diagnosis,
          variant_index: 0,
          // Legacy column retained during migration; see supabase/migrations/0001.
          case_data: enriched as unknown as Record<string, unknown>,
          presentation_data: tiers.presentation,
          patient_knowledge: tiers.patientKnowledge,
          clinical_findings: tiers.clinicalFindings,
          ground_truth: tiers.groundTruth,
          is_generated: true,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'id' }),
        8000,
      )
      if (!error) return
      console.error('[caseSource] tiered save failed:', error.message)
    } catch (e) {
      console.error('[caseSource] tiered save unreachable:', (e as Error).message)
    }
  }

  try {
    await fs.mkdir(LOCAL_CASE_DIR, { recursive: true })
    await fs.writeFile(
      path.join(LOCAL_CASE_DIR, `${sanitizeId(caseId)}.json`),
      JSON.stringify({ caseData: enriched }, null, 2),
      'utf8',
    )
  } catch { /* best-effort */ }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function mergeImagingCache(
  imagingCache: unknown,
  verifiedImages: unknown,
): Record<string, unknown[]> | undefined {
  const out: Record<string, unknown[]> = {}
  if (imagingCache && typeof imagingCache === 'object') {
    for (const [k, v] of Object.entries(imagingCache as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length > 0) out[k] = v
    }
  }
  if (verifiedImages && typeof verifiedImages === 'object') {
    for (const [k, v] of Object.entries(verifiedImages as Record<string, unknown>)) {
      out[k] = [v]
    }
  }
  return Object.keys(out).length ? out : undefined
}

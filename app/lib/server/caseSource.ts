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

/** Read a cached case by id — tiered columns preferred, legacy case_data fallback. */
export async function lookupCachedCase(caseId: string): Promise<AcquiredCase | null> {
  if (supabaseAvailable()) {
    try {
      const db = createAdminClient()
      const { data, error } = await dbTimeout(
        db.from('cases')
          .select('id, case_data, presentation_data, patient_knowledge, clinical_findings, ground_truth, imaging_cache, verified_images, is_generated')
          .eq('id', caseId).maybeSingle(),
        8000,
      )
      if (!error && data?.is_generated) {
        const caseData = data.presentation_data
          ? joinCase({
              presentation: data.presentation_data,
              patientKnowledge: data.patient_knowledge ?? {},
              clinicalFindings: data.clinical_findings ?? {},
              groundTruth: data.ground_truth ?? {},
            })
          : (data.case_data as CaseData | null)
        if (caseData) {
          return {
            caseId,
            caseData,
            imagingCache: mergeImagingCache(data.imaging_cache, data.verified_images),
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
    const { data, error } = await dbTimeout(
      db.from('cases')
        .select('id, case_data, presentation_data, patient_knowledge, clinical_findings, ground_truth, verified_images')
        .eq('system', system).eq('difficulty', difficulty)
        .like('id', 'img-%').not('verified_images', 'is', null)
        .eq('is_generated', true).limit(20),
      8000,
    )
    if (error || !data?.length) return null
    const picked = data[Math.floor(Math.random() * data.length)]
    const caseData = picked.presentation_data
      ? joinCase({
          presentation: picked.presentation_data,
          patientKnowledge: picked.patient_knowledge ?? {},
          clinicalFindings: picked.clinical_findings ?? {},
          groundTruth: picked.ground_truth ?? {},
        })
      : (picked.case_data as CaseData | null)
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

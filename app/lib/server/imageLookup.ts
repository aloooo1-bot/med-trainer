import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { getECGCategory, scoreEcgMatch, type ECGImage } from '../ecgImageLookup'
import { getSpecialCategory, type SpecialModality, type SpecialImage } from '../specialImageLookup'
import {
  caseLaterality, selectByLaterality,
  type ImageAttributes, type ImageMatch, type LateralityPolicy,
} from '../imageAttributes'

/**
 * Server-side image selection. The client libs load their JSON indexes with
 * relative fetch(); here we read the same files from public/ via fs so the
 * selection (which needs the case diagnosis) can stay off the client.
 *
 * Selection is laterality-aware (see imageAttributes.ts): an image is served
 * only when it is confirmed to match the case's specified side, or when the
 * case is non-lateralized. Attributes come from an optional per-dataset
 * `attributes.json` sidecar produced by the review pass; a `blocklist.json`
 * sidecar drops images a reviewer rejected. Both default to empty, so an
 * un-reviewed dataset simply falls back to report-only for lateralized cases.
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public')
const jsonCache = new Map<string, unknown>()

/** Default policy — strict: a wrong-side image is worse than no image. */
const LATERALITY_POLICY: LateralityPolicy =
  process.env.IMAGE_LATERALITY_POLICY === 'lenient' ? 'lenient' : 'strict'

async function readPublicJson<T>(relPath: string): Promise<T | null> {
  if (jsonCache.has(relPath)) return jsonCache.get(relPath) as T
  try {
    const data = JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, relPath), 'utf8')) as T
    jsonCache.set(relPath, data)
    return data
  } catch {
    jsonCache.set(relPath, null)
    return null
  }
}

/** Per-image attributes ({ "category/file": ImageAttributes }); {} if unreviewed. */
async function loadAttributes(datasetDir: string): Promise<Record<string, ImageAttributes>> {
  return (await readPublicJson<Record<string, ImageAttributes>>(`${datasetDir}/attributes.json`)) ?? {}
}

/** Reviewer-rejected keys ("category/file"); [] if none. */
async function loadBlocklist(datasetDir: string): Promise<Set<string>> {
  const list = await readPublicJson<string[]>(`${datasetDir}/blocklist.json`)
  return new Set(list ?? [])
}

export interface PickedECG { ecg: ECGImage | null; match: ImageMatch }
export interface PickedSpecial { special: SpecialImage | null; match: ImageMatch }

export async function pickECGImage(diagnosis: string, ecgFindings?: string): Promise<PickedECG> {
  const category = getECGCategory(diagnosis, ecgFindings)
  const index = await readPublicJson<Record<string, string[]>>('ecg/index.json')
  const meta = (await readPublicJson<Record<string, string>>('ecg/metadata.json')) ?? {}
  const blocked = await loadBlocklist('ecg')
  const files = (index?.[category] ?? []).filter(f => !blocked.has(`${category}/${f}`))
  if (!files.length) return { ecg: null, match: { required: 'unknown', status: 'suppressed', reason: 'no ECG image for this category' } }

  // ECG matching is by lead territory (not laterality); scoreEcgMatch drives it.
  if (ecgFindings) {
    let best = files[0]
    let bestScore = -1
    for (const file of files) {
      const s = scoreEcgMatch(meta[`${category}/${file}`] ?? '', ecgFindings)
      if (s > bestScore) { bestScore = s; best = file }
    }
    if (bestScore > 0) {
      return {
        ecg: { path: `/ecg/${category}/${best}`, report: meta[`${category}/${best}`] ?? '' },
        match: { required: 'unknown', status: 'confirmed' },
      }
    }
  }
  const file = files[Math.floor(Math.random() * files.length)]
  return {
    ecg: { path: `/ecg/${category}/${file}`, report: meta[`${category}/${file}`] ?? '' },
    match: { required: 'unknown', status: 'unconfirmed', reason: 'representative tracing for this rhythm category' },
  }
}

export async function pickSpecialImage(
  modality: SpecialModality,
  diagnosis: string,
  finding?: string,
): Promise<PickedSpecial> {
  const dataset = `images/${modality}`
  const category = getSpecialCategory(modality, diagnosis, finding)
  const index = await readPublicJson<Record<string, string[]>>(`${dataset}/index.json`)
  const meta = (await readPublicJson<Record<string, { label: string; source: string }>>(`${dataset}/metadata.json`)) ?? {}
  const attrs = await loadAttributes(dataset)
  const blocked = await loadBlocklist(dataset)

  const files = (index?.[category] ?? []).filter(f => !blocked.has(`${category}/${f}`))
  // The case's required side is read from the finding text (the diagnosis is a
  // weak fallback); most modalities (smear/urine/biopsy) are non-lateralized.
  const required = caseLaterality(finding, diagnosis)

  const candidates = files.map(file => {
    const key = `${category}/${file}`
    return {
      item: {
        path: `/images/${modality}/${key}`,
        label: meta[key]?.label ?? '',
        source: meta[key]?.source ?? '',
      } satisfies SpecialImage,
      laterality: attrs[key]?.laterality,
    }
  })

  const { item, match } = selectByLaterality(candidates, required, LATERALITY_POLICY)
  return { special: item, match }
}

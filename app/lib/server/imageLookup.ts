import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { getECGCategory, scoreEcgMatch, contradictsFindings, isInterpretableReport, type ECGImage } from '../ecgImageLookup'
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

/**
 * Image-first chest binding: a case generated from a specific local NIH film
 * carries that film's public path in `localChestImage`. There is no matching to
 * do — the case was authored FROM this exact image (laterality included), so we
 * return it directly, marked verified. Returns null if the bound file is absent
 * (deleted/moved) so the caller falls through to Open-i.
 */
export async function boundChestImage(localChestImage: string): Promise<OpenIResultLike | null> {
  if (!localChestImage.startsWith('/imaging/')) return null
  const rel = localChestImage.replace(/^\//, '')
  try {
    await fs.access(path.join(PUBLIC_DIR, rel))
  } catch {
    return null // bound file missing — let the route fall back
  }
  return {
    uid: path.basename(localChestImage).replace(/\.[^.]+$/, ''),
    imageUrl: localChestImage,
    thumbnailUrl: localChestImage,
    caption: 'Chest radiograph (case reference image)',
    modality: 'X-Ray',
    agentVerified: true,
    confidence: 1,
    verificationReason: 'Case authored from this exact image (image-first)',
  }
}

/** Minimal shape shared with OpenIResult so the route can return a uniform list. */
export interface OpenIResultLike {
  uid: string
  imageUrl: string
  thumbnailUrl: string
  caption: string
  modality: string
  abstract?: string
  agentVerified?: boolean
  confidence?: number
  verificationReason?: string
}

/**
 * Choose a tracing that is faithful to the case, or none at all.
 *
 * This used to fall back to a RANDOM tracing from the category and label it
 * "representative" — but nothing downstream distinguishes that from a real
 * match, so an arbitrary strip was rendered as though it were this patient's.
 * A wrong ECG is worse than no ECG: the student reads findings off it, and
 * they are graded against a case that says something else. When no candidate
 * both matches and fails to contradict, we return null and the panel shows the
 * machine read instead — honest, and still interpretable.
 */
export async function pickECGImage(diagnosis: string, ecgFindings?: string): Promise<PickedECG> {
  const suppress = (reason: string): PickedECG =>
    ({ ecg: null, match: { required: 'unknown', status: 'suppressed', reason } })

  const category = getECGCategory(diagnosis, ecgFindings)
  if (!category) return suppress('no tracing category faithfully represents this ECG')
  if (!ecgFindings) return suppress('case states no ECG findings to match a tracing against')

  const index = await readPublicJson<Record<string, string[]>>('ecg/index.json')
  const meta = (await readPublicJson<Record<string, string>>('ecg/metadata.json')) ?? {}
  const blocked = await loadBlocklist('ecg')
  const files = (index?.[category] ?? []).filter(f => !blocked.has(`${category}/${f}`))
  if (!files.length) return suppress('no ECG image for this category')

  // Compatibility is the hard requirement; lexical overlap only ranks. Much of
  // the PTB-XL corpus is reported in German, so a faithful tracing can score
  // zero against English findings — refusing those would drop ~12% of cases
  // for no correctness gain. Category membership already carries the clinical
  // match, so a non-contradicting candidate is servable even at score zero.
  //
  // Iteration order decides ties, NOT Math.random() as before: a case must show
  // the same tracing every time, or a student who reloads is quietly handed a
  // different ECG for the same patient.
  let best: string | null = null
  let bestScore = -1
  let conflict: string | null = null
  for (const file of files) {
    const report = meta[`${category}/${file}`] ?? ''
    // A stub report ("trace only requested.") states nothing to check the strip
    // against, so it can never be shown to be faithful. Unusable, not neutral.
    if (!isInterpretableReport(report)) continue
    const c = contradictsFindings(report, ecgFindings)
    if (c) { conflict ??= c; continue }
    const s = scoreEcgMatch(report, ecgFindings)
    if (s > bestScore) { bestScore = s; best = file }
  }
  if (!best) {
    return suppress(conflict
      ? `every candidate tracing contradicts the case (${conflict})`
      : 'no usable tracing in this category')
  }

  return {
    ecg: { path: `/ecg/${category}/${best}`, report: meta[`${category}/${best}`] ?? '' },
    match: bestScore > 0
      ? { required: 'unknown', status: 'confirmed' }
      : { required: 'unknown', status: 'unconfirmed', reason: 'compatible tracing for this rhythm category; no shared descriptive detail' },
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

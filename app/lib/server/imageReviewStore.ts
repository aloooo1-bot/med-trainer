import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import type { ImageAttributes, Laterality } from '../imageAttributes'

/**
 * Server-side read/write of the image review sidecars (attributes.json +
 * blocklist.json) that the serve-time fail-safe consumes. Powers the admin
 * review page's confirm/reject/edit actions.
 *
 * NOTE: sidecars live under public/ — writable in local dev only (Vercel's
 * runtime FS is read-only). Review is an offline curation step: run the app
 * locally, review, then commit the updated sidecars. applyVerdict throws a
 * clear message if the write fails (e.g. read-only prod FS).
 *
 * Dataset registry mirrors scripts/lib/imageReview.mjs — keep the two in sync.
 */
const DATASETS = {
  smear:  { dir: 'public/images/smear',  publicBase: '/images/smear',  keyed: 'category-file' },
  biopsy: { dir: 'public/images/biopsy', publicBase: '/images/biopsy', keyed: 'category-file' },
  fundus: { dir: 'public/images/fundus', publicBase: '/images/fundus', keyed: 'category-file' },
  derm:   { dir: 'public/images/derm',   publicBase: '/images/derm',   keyed: 'category-file' },
  urine:  { dir: 'public/images/urine',  publicBase: '/images/urine',  keyed: 'category-file' },
  chest:  { dir: 'public/imaging',        publicBase: '/imaging',       keyed: 'file' },
} as const

export type DatasetName = keyof typeof DATASETS
export const DATASET_NAMES = Object.keys(DATASETS) as DatasetName[]

function indexRel(name: DatasetName): string {
  return name === 'chest' ? 'public/imaging-lookup.json' : `${DATASETS[name].dir}/index.json`
}
const attributesRel = (name: DatasetName) => `${DATASETS[name].dir}/attributes.json`
const blocklistRel = (name: DatasetName) => `${DATASETS[name].dir}/blocklist.json`

async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(path.join(process.cwd(), rel), 'utf8')) as T }
  catch { return fallback }
}
async function writeJson(rel: string, obj: unknown): Promise<void> {
  try {
    await fs.writeFile(path.join(process.cwd(), rel), JSON.stringify(obj, null, 2) + '\n', 'utf8')
  } catch (e) {
    throw new Error(`Could not write ${rel} (review sidecars are writable in local dev only): ${(e as Error).message}`)
  }
}

export interface ReviewImage {
  key: string
  category: string
  file: string
  publicPath: string
  attribute?: ImageAttributes
  blocked: boolean
}

export async function listImages(name: DatasetName): Promise<ReviewImage[]> {
  const ds = DATASETS[name]
  const index = await readJson<Record<string, string[]>>(indexRel(name), {})
  const attrs = await getAttributes(name)
  const blocked = new Set(await getBlocklist(name))
  const out: ReviewImage[] = []
  const seen = new Set<string>()
  for (const [category, files] of Object.entries(index)) {
    if (!Array.isArray(files)) continue
    for (const file of files) {
      const key = ds.keyed === 'file' ? file : `${category}/${file}`
      if (ds.keyed === 'file' && seen.has(key)) continue
      seen.add(key)
      const rel = ds.keyed === 'file' ? file : `${category}/${file}`
      out.push({
        key, category, file,
        publicPath: `${ds.publicBase}/${rel}`,
        attribute: attrs[key],
        blocked: blocked.has(key),
      })
    }
  }
  return out
}

export async function getAttributes(name: DatasetName): Promise<Record<string, ImageAttributes>> {
  return readJson<Record<string, ImageAttributes>>(attributesRel(name), {})
}
export async function getBlocklist(name: DatasetName): Promise<string[]> {
  return readJson<string[]>(blocklistRel(name), [])
}

export type ReviewAction =
  | { action: 'confirm' }
  | { action: 'edit'; laterality: Laterality }
  | { action: 'reject' }

/** Apply a human reviewer's verdict, writing the sidecars. */
export async function applyVerdict(name: DatasetName, key: string, verdict: ReviewAction): Promise<void> {
  const attrs = await getAttributes(name)
  const blocklist = new Set(await getBlocklist(name))

  if (verdict.action === 'reject') {
    blocklist.add(key)
    delete attrs[key]
  } else if (verdict.action === 'confirm') {
    attrs[key] = { ...(attrs[key] ?? {}), review: 'human' }
    blocklist.delete(key)
  } else {
    attrs[key] = { ...(attrs[key] ?? {}), laterality: verdict.laterality, review: 'human' }
    blocklist.delete(key)
  }

  await writeJson(attributesRel(name), attrs)
  await writeJson(blocklistRel(name), Array.from(blocklist).sort())
}

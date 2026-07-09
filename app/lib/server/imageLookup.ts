import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { getECGCategory, scoreEcgMatch, type ECGImage } from '../ecgImageLookup'
import { getSpecialCategory, type SpecialModality, type SpecialImage } from '../specialImageLookup'

/**
 * Server-side image selection. The client libs load their JSON indexes with
 * relative fetch(); here we read the same files from public/ via fs so the
 * selection (which needs the case diagnosis) can stay off the client.
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public')
const jsonCache = new Map<string, unknown>()

async function readPublicJson<T>(relPath: string): Promise<T | null> {
  if (jsonCache.has(relPath)) return jsonCache.get(relPath) as T
  try {
    const data = JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, relPath), 'utf8')) as T
    jsonCache.set(relPath, data)
    return data
  } catch {
    return null
  }
}

export async function pickECGImage(diagnosis: string, ecgFindings?: string): Promise<ECGImage | null> {
  const category = getECGCategory(diagnosis, ecgFindings)
  const index = await readPublicJson<Record<string, string[]>>('ecg/index.json')
  const meta = (await readPublicJson<Record<string, string>>('ecg/metadata.json')) ?? {}
  const files = index?.[category]
  if (!files?.length) return null

  if (ecgFindings) {
    let best = files[0]
    let bestScore = -1
    for (const file of files) {
      const s = scoreEcgMatch(meta[`${category}/${file}`] ?? '', ecgFindings)
      if (s > bestScore) { bestScore = s; best = file }
    }
    if (bestScore > 0) {
      return { path: `/ecg/${category}/${best}`, report: meta[`${category}/${best}`] ?? '' }
    }
  }
  const file = files[Math.floor(Math.random() * files.length)]
  return { path: `/ecg/${category}/${file}`, report: meta[`${category}/${file}`] ?? '' }
}

export async function pickSpecialImage(
  modality: SpecialModality,
  diagnosis: string,
  finding?: string,
): Promise<SpecialImage | null> {
  const category = getSpecialCategory(modality, diagnosis, finding)
  const index = await readPublicJson<Record<string, string[]>>(`images/${modality}/index.json`)
  const meta = (await readPublicJson<Record<string, { label: string; source: string }>>(`images/${modality}/metadata.json`)) ?? {}
  const files = index?.[category]
  if (!files?.length) return null
  const file = files[Math.floor(Math.random() * files.length)]
  const key = `${category}/${file}`
  return {
    path: `/images/${modality}/${category}/${file}`,
    label: meta[key]?.label ?? '',
    source: meta[key]?.source ?? '',
  }
}

/**
 * Shared helpers for the image review system.
 *
 * Datasets store images locally under public/. The review pass tags each image
 * with structured attributes (laterality, features, severity) into a per-dataset
 * `attributes.json` sidecar, and reviewer-rejected images into `blocklist.json`.
 * The serve-time fail-safe (app/lib/server/imageLookup.ts + imageAttributes.ts)
 * reads those exact sidecars.
 */

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..')

/**
 * Dataset registry. `keyed`:
 *   'category-file' — files live in category subdirs; sidecar key is "category/file"
 *                     (matches imageLookup.ts for ecg + special modalities).
 *   'file'          — files are flat and may be multi-category (NIH chest films);
 *                     sidecar key is the filename (laterality is intrinsic to the image).
 */
export const DATASETS = {
  ecg:    { dir: 'public/ecg',          index: 'public/ecg/index.json',        publicBase: '/ecg',          keyed: 'category-file', raster: false },
  smear:  { dir: 'public/images/smear',  index: 'public/images/smear/index.json',  publicBase: '/images/smear',  keyed: 'category-file', raster: true },
  biopsy: { dir: 'public/images/biopsy', index: 'public/images/biopsy/index.json', publicBase: '/images/biopsy', keyed: 'category-file', raster: true },
  fundus: { dir: 'public/images/fundus', index: 'public/images/fundus/index.json', publicBase: '/images/fundus', keyed: 'category-file', raster: true },
  derm:   { dir: 'public/images/derm',   index: 'public/images/derm/index.json',   publicBase: '/images/derm',   keyed: 'category-file', raster: true },
  urine:  { dir: 'public/images/urine',  index: 'public/images/urine/index.json',  publicBase: '/images/urine',  keyed: 'category-file', raster: true },
  chest:  { dir: 'public/imaging',        index: 'public/imaging-lookup.json',    publicBase: '/imaging',       keyed: 'file',          raster: true },
}

export const DATASET_NAMES = Object.keys(DATASETS)

const MEDIA_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

async function readJson(rel, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8')) } catch { return fallback }
}

async function writeJson(rel, obj) {
  await fs.writeFile(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

/** Every image in a dataset: { key, category, file, absPath, publicPath }. */
export async function listDatasetImages(name) {
  const ds = DATASETS[name]
  if (!ds) throw new Error(`Unknown dataset: ${name}`)
  const index = await readJson(ds.index, {})
  const out = []
  const seenKeys = new Set()
  for (const [category, files] of Object.entries(index)) {
    if (!Array.isArray(files)) continue
    for (const file of files) {
      const key = ds.keyed === 'file' ? file : `${category}/${file}`
      if (ds.keyed === 'file' && seenKeys.has(key)) continue // multi-category flat file — tag once
      seenKeys.add(key)
      const rel = ds.keyed === 'file' ? file : `${category}/${file}`
      out.push({
        key,
        category,
        file,
        absPath: path.join(ROOT, ds.dir, rel),
        publicPath: `${ds.publicBase}/${rel}`,
      })
    }
  }
  return out
}

export function attributesRel(name) { return `${DATASETS[name].dir}/attributes.json` }
export function blocklistRel(name) { return `${DATASETS[name].dir}/blocklist.json` }

export async function readAttributes(name) { return readJson(attributesRel(name), {}) }
export async function writeAttributes(name, obj) { await writeJson(attributesRel(name), obj) }
export async function readBlocklist(name) { return readJson(blocklistRel(name), []) }
export async function writeBlocklist(name, arr) { await writeJson(blocklistRel(name), Array.from(new Set(arr)).sort()) }

/** Merge one image's attributes into the sidecar (in memory; caller persists). */
export function mergeAttribute(attrs, key, value) {
  attrs[key] = { ...(attrs[key] ?? {}), ...value }
  return attrs
}

/** Read a local raster image as base64 + media type; null for SVG/unsupported. */
export async function fileToBase64(absPath) {
  const ext = path.extname(absPath).toLowerCase()
  const mediaType = MEDIA_TYPES[ext]
  if (!mediaType) return null // e.g. SVG (ECG tracings) — vision can't read these
  const buf = await fs.readFile(absPath)
  return { base64: buf.toString('base64'), mediaType }
}

/** System prompt for the structured attribute extractor (vision). */
export const EXTRACT_SYSTEM = `You are a meticulous medical imaging annotator. Given a single medical image and its modality, extract only what is VISIBLE in the image.

Determine LATERALITY strictly from anatomical side and any L/R markers actually present:
- "right" or "left" only if you can identify the side with confidence
- "bilateral" if findings are clearly on both sides
- "midline" for central/midline structures
- "unknown" if the side cannot be determined — do NOT guess

Respond with ONLY valid JSON, no markdown:
{
  "laterality": "left" | "right" | "bilateral" | "midline" | "unknown",
  "features": ["<short objective finding>", ...],
  "severity": "mild" | "moderate" | "severe" | null,
  "confidence": <0.0-1.0>,
  "reason": "<one sentence on how you determined laterality>"
}`

export const VALID_LATERALITY = ['left', 'right', 'bilateral', 'midline', 'unknown']

#!/usr/bin/env node
/**
 * setup_derm.js — Dermatology images via ISIC Archive public API (no npm deps)
 *
 * ISIC API v2: https://api.isic-archive.com/api/v2/images/
 * Public images available without authentication.
 *
 * Usage:  node scripts/datasets/setup_derm.js
 *
 * Output:
 *   public/images/derm/{category}/<file>.jpg
 *   public/images/derm/index.json
 *   public/images/derm/metadata.json
 */

'use strict'

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const BASE    = path.join(__dirname, '..', '..')
const OUT_DIR = path.join(BASE, 'public', 'images', 'derm')
const IMAGES_PER_CAT = 6
const ISIC_BASE = 'https://api.isic-archive.com/api/v2'

// ISIC diagnosis slugs: https://www.isic-archive.com/api/v2/images/?diagnosis=melanoma
const CATEGORIES = [
  {
    id: 'melanoma',
    isicDiagnosis: 'melanoma',
    label: 'Melanoma — dermoscopy',
    source: 'ISIC Archive (International Skin Imaging Collaboration) — CC-BY license',
  },
  {
    id: 'basal_cell',
    isicDiagnosis: 'basal cell carcinoma',
    label: 'Basal cell carcinoma — dermoscopy',
    source: 'ISIC Archive (International Skin Imaging Collaboration) — CC-BY license',
  },
  {
    id: 'squamous_cell',
    isicDiagnosis: 'squamous cell carcinoma',
    label: 'Squamous cell carcinoma — dermoscopy',
    source: 'ISIC Archive (International Skin Imaging Collaboration) — CC-BY license',
  },
  {
    id: 'nevus',
    isicDiagnosis: 'melanocytic nevi',
    label: 'Benign melanocytic nevus (mole) — dermoscopy',
    source: 'ISIC Archive (International Skin Imaging Collaboration) — CC-BY license',
  },
  {
    id: 'normal',
    isicDiagnosis: 'dermatofibroma',
    label: 'Dermatofibroma — dermoscopy',
    source: 'ISIC Archive (International Skin Imaging Collaboration) — CC-BY license',
  },
]

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function get(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, {
      headers: {
        'User-Agent': 'med-trainer-setup/1.0',
        'Accept': 'application/json',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) return
  const data = await get(url)
  fs.writeFileSync(dest, data)
}

// ---------------------------------------------------------------------------
// ISIC search → image URLs
// ---------------------------------------------------------------------------

async function searchISIC(diagnosis, limit) {
  const url = `${ISIC_BASE}/images/?diagnosis=${encodeURIComponent(diagnosis)}&limit=${limit}&offset=0`
  let buf
  try { buf = await get(url) } catch (e) {
    console.log(`  ISIC query failed: ${e.message}`); return []
  }
  let data
  try { data = JSON.parse(buf.toString('utf8')) } catch { return [] }

  const results = data.results || []
  return results
    .filter(item => item.files?.full?.url)
    .map(item => ({
      imageUrl: item.files.full.url,
      diagnosis: item.metadata?.diagnosis || diagnosis,
      // ISIC licenses EACH IMAGE separately — CC0, CC-BY or CC-BY-NC — and
      // returns which in the response. The first version of this script mapped
      // those fields away and wrote one hardcoded "CC-BY license" line for
      // every file, so 30 images shipped with a licence nobody had checked and
      // no isic_id to check it against later. Only CC-BY-NC actually forbids
      // selling access, but without these fields there was no way to know which
      // images were which.
      isicId: item.isic_id ?? null,
      license: item.copyright_license ?? null,
      attribution: item.attribution ?? null,
    }))
}

/** ISIC's licence names -> the SPDX-ish ids app/lib/imageAttributes.ts knows. */
function normalizeLicense(raw) {
  const s = (raw ?? '').trim().toUpperCase()
  if (s === 'CC-0' || s === 'CC0') return 'CC0-1.0'
  if (s === 'CC-BY') return 'CC-BY-4.0'
  if (s === 'CC-BY-NC') return 'CC-BY-NC-4.0'
  return 'unverified'   // an unrecognised name is not permission
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Dermatology Image Setup (ISIC Archive) ===')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const index    = {}
  const metadata = {}

  for (const cat of CATEGORIES) {
    console.log(`\n[${cat.id}] ISIC diagnosis: "${cat.isicDiagnosis}"`)
    const outDir = path.join(OUT_DIR, cat.id)
    fs.mkdirSync(outDir, { recursive: true })

    const results = await searchISIC(cat.isicDiagnosis, IMAGES_PER_CAT * 2)
    console.log(`  ISIC returned ${results.length} candidates`)

    const saved = []
    for (const r of results) {
      if (saved.length >= IMAGES_PER_CAT) break
      // Skip anything we could not sell access to, rather than downloading it
      // and discovering later. This app is a paid product; a CC-BY-NC image in
      // it is a breach whether or not anyone noticed.
      const license = normalizeLicense(r.license)
      if (license === 'CC-BY-NC-4.0' || license === 'unverified') {
        process.stdout.write('n')
        continue
      }
      const urlObj = new URL(r.imageUrl)
      const ext = path.extname(urlObj.pathname).replace('.', '') || 'jpg'
      const dest = path.join(outDir, `${cat.id}_${String(saved.length).padStart(3, '0')}.${ext}`)
      try {
        await downloadFile(r.imageUrl, dest)
        const fname = path.basename(dest)
        saved.push(fname)
        metadata[`${cat.id}/${fname}`] = {
          label: cat.label,
          source: cat.source,
          // ISIC requires citing the image's own id, so it is recorded rather
          // than derived — the local filename is sequential and says nothing.
          sourceId: r.isicId ?? undefined,
          license,
          licenseUrl: 'https://www.isic-archive.com/blank-1',
          attribution: r.attribution ?? `ISIC Archive image ${r.isicId ?? '(id unknown)'}, licensed ${license}.`,
        }
        process.stdout.write('.')
      } catch (e) { process.stdout.write('x') }
    }
    process.stdout.write('\n')

    index[cat.id] = saved
    console.log(`  ${cat.id}: ${saved.length} images saved`)
  }

  console.log('\nWriting index.json and metadata.json...')
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'),    JSON.stringify(index, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2))

  const total = Object.values(index).reduce((s, a) => s + a.length, 0)
  console.log(`\nDone. ${total} derm images in ${OUT_DIR}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })

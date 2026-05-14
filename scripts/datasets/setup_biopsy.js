#!/usr/bin/env node
/**
 * setup_biopsy.js — H&E histopathology images via NIH Open-i (no npm deps)
 *
 * Usage:  node scripts/datasets/setup_biopsy.js
 *
 * Output:
 *   public/images/biopsy/{category}/<file>.jpg
 *   public/images/biopsy/index.json
 *   public/images/biopsy/metadata.json
 */

'use strict'

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const BASE    = path.join(__dirname, '..', '..')
const OUT_DIR = path.join(BASE, 'public', 'images', 'biopsy')
const IMAGES_PER_CAT = 6
const OPENI   = 'https://openi.nlm.nih.gov'

const CATEGORIES = [
  {
    id: 'colon_cancer',
    query: 'colorectal cancer tumor histology biopsy',
    label: 'Colon adenocarcinoma — H&E histopathology',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'liver',
    query: 'liver cirrhosis fibrosis histopathology biopsy',
    label: 'Liver biopsy — cirrhosis / hepatic fibrosis (H&E)',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'gastric',
    query: 'gastric mucosa helicobacter pylori histopathology biopsy',
    label: 'Gastric biopsy — Helicobacter pylori gastritis (H&E)',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'breast_cancer',
    query: 'breast ductal carcinoma histopathology invasive',
    label: 'Breast biopsy — invasive ductal carcinoma (H&E)',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'normal',
    query: 'normal tissue biopsy histology benign',
    label: 'Normal colonic mucosa — H&E histopathology',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
]

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function get(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'med-trainer-setup/1.0' } }, res => {
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
// Open-i search → image URLs
// ---------------------------------------------------------------------------

async function searchOpenI(query, maxResults) {
  const q = encodeURIComponent(query)
  // Try pathology filter first, fall back to unfiltered
  for (const suffix of ['&it=pat', '']) {
    const url = `${OPENI}/api/search?query=${q}${suffix}&m=${maxResults}&n=1`
    let buf, data
    try { buf = await get(url) } catch (e) { continue }
    try { data = JSON.parse(buf.toString('utf8')) } catch { continue }
    const list = (data.list || []).filter(item => item.imgLarge)
    if (list.length > 0) {
      if (suffix === '') console.log('  (fell back to unfiltered search)')
      return list.map(item => ({
        imageUrl: `${OPENI}${item.imgLarge}`,
        caption:  (item.caption || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      }))
    }
  }
  console.log(`  Open-i returned no results for: ${query}`)
  return []
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== H&E Biopsy Image Setup (NIH Open-i) ===')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const index    = {}
  const metadata = {}

  for (const cat of CATEGORIES) {
    console.log(`\n[${cat.id}] query: "${cat.query}"`)
    const outDir = path.join(OUT_DIR, cat.id)
    fs.mkdirSync(outDir, { recursive: true })

    const results = await searchOpenI(cat.query, IMAGES_PER_CAT * 3)
    console.log(`  Open-i returned ${results.length} candidates`)

    const saved = []
    for (const r of results) {
      if (saved.length >= IMAGES_PER_CAT) break
      const ext  = r.imageUrl.split('.').pop()?.split('?')[0] || 'jpg'
      const dest = path.join(outDir, `${cat.id}_${String(saved.length).padStart(3, '0')}.${ext}`)
      try {
        await downloadFile(r.imageUrl, dest)
        const fname = path.basename(dest)
        saved.push(fname)
        const label = r.caption ? `${cat.label} — ${r.caption}` : cat.label
        metadata[`${cat.id}/${fname}`] = { label: label.slice(0, 250), source: cat.source }
        process.stdout.write('.')
      } catch (e) {
        process.stdout.write('x')
      }
    }
    process.stdout.write('\n')

    index[cat.id] = saved
    console.log(`  ${cat.id}: ${saved.length} images saved`)
  }

  console.log('\nWriting index.json and metadata.json...')
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'),    JSON.stringify(index, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2))

  const total = Object.values(index).reduce((s, a) => s + a.length, 0)
  console.log(`\nDone. ${total} biopsy images in ${OUT_DIR}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })

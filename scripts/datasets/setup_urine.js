#!/usr/bin/env node
/**
 * setup_urine.js — Urine microscopy images via NIH Open-i (no npm deps)
 *
 * Usage:  node scripts/datasets/setup_urine.js
 *
 * Output:
 *   public/images/urine/{category}/<file>.jpg
 *   public/images/urine/index.json
 *   public/images/urine/metadata.json
 */

'use strict'

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const BASE    = path.join(__dirname, '..', '..')
const OUT_DIR = path.join(BASE, 'public', 'images', 'urine')
const IMAGES_PER_CAT = 6
const OPENI   = 'https://openi.nlm.nih.gov'

const CATEGORIES = [
  {
    id: 'uti',
    query: 'pyelonephritis cystitis urinary infection kidney',
    label: 'Urinary tract infection — urine microscopy (WBCs, bacteria)',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'nephrotic',
    query: 'nephrotic syndrome proteinuria kidney biopsy podocytes',
    label: 'Nephrotic syndrome — urine microscopy (oval fat bodies)',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'nephritic',
    query: 'nephritis membranous kidney biopsy crescent',
    label: 'Nephritic syndrome — urine microscopy (RBC casts)',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'kidney_stone',
    query: 'calcium oxalate crystals renal stone nephrolithiasis urine',
    label: 'Nephrolithiasis — urine microscopy (calcium oxalate crystals)',
    source: 'NIH Open-i / PubMed Central (open access)',
  },
  {
    id: 'normal',
    query: 'renal cortex tubular epithelium normal biopsy light microscopy',
    label: 'Normal urine microscopy — unremarkable sediment',
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

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function searchOpenI(query, maxResults) {
  const q = encodeURIComponent(query)
  const url = `${OPENI}/api/search?query=${q}&m=${maxResults}&n=1`
  for (let attempt = 1; attempt <= 3; attempt++) {
    let buf, data
    try { buf = await get(url) } catch (e) {
      console.log(`  Open-i attempt ${attempt} failed: ${e.message}`)
      if (attempt < 3) await delay(3000 * attempt)
      continue
    }
    try { data = JSON.parse(buf.toString('utf8')) } catch { return [] }
    return (data.list || [])
      .filter(item => item.imgLarge)
      .map(item => ({
        imageUrl: `${OPENI}${item.imgLarge}`,
        caption:  (item.caption || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      }))
  }
  return []
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Urine Microscopy Image Setup (NIH Open-i) ===')
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
  console.log(`\nDone. ${total} urine microscopy images in ${OUT_DIR}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })

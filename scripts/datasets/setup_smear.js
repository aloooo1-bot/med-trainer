#!/usr/bin/env node
/**
 * setup_smear.js — Peripheral blood smear images (Node.js, no npm deps)
 *
 * Source: NIH LHNCBC Malaria Cell Image Dataset (public domain)
 *   https://data.lhncbc.nlm.nih.gov/public/Malaria/cell_images/
 *
 * Strategy:
 *   1. Attempt directory listing from NIH server to get filenames
 *   2. If that fails, download full ZIP and extract via tar (Windows 10+ built-in)
 *
 * Usage:  node scripts/datasets/setup_smear.js
 *
 * Output:
 *   public/images/smear/{category}/<file>.png
 *   public/images/smear/index.json
 *   public/images/smear/metadata.json
 */

'use strict'

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')
const zlib  = require('zlib')
const { execSync } = require('child_process')

const BASE      = path.join(__dirname, '..', '..')
const OUT_DIR   = path.join(BASE, 'public', 'images', 'smear')
const CACHE_DIR = path.join(BASE, 'smear_cache')
const IMAGES_PER_CAT = 8

const NIH_ROOT = 'https://data.lhncbc.nlm.nih.gov/public/Malaria/cell_images'
const NIH_ZIP  = 'https://data.lhncbc.nlm.nih.gov/public/Malaria/cell_images.zip'

const CATEGORIES = {
  malaria_falciparum: {
    subdir: 'Parasitized',
    label: 'Malaria — Plasmodium falciparum (parasitized red blood cells)',
    source: 'NIH LHNCBC Malaria Cell Image Dataset (Rajaraman et al., 2018) — public domain',
  },
  normal: {
    subdir: 'Uninfected',
    label: 'Normal peripheral blood smear — uninfected red blood cells',
    source: 'NIH LHNCBC Malaria Cell Image Dataset (Rajaraman et al., 2018) — public domain',
  },
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'med-trainer-setup/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve(dest); return }
    const mod = url.startsWith('https') ? https : http
    const tmp = dest + '.tmp'
    const out = fs.createWriteStream(tmp)
    let received = 0
    let total = 0
    const req = mod.get(url, { headers: { 'User-Agent': 'med-trainer-setup/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        out.close()
        fs.unlinkSync(tmp)
        return downloadFile(res.headers.location, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      total = parseInt(res.headers['content-length'] || '0', 10)
      res.pipe(out)
      res.on('data', chunk => {
        received += chunk.length
        if (total > 0) {
          const pct = Math.round(received / total * 100)
          process.stdout.write(`\r  ${Math.round(received/1e6)}MB / ${Math.round(total/1e6)}MB (${pct}%)   `)
        }
      })
      out.on('finish', () => { process.stdout.write('\n'); fs.renameSync(tmp, dest); resolve(dest) })
      out.on('error', reject)
    })
    req.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Parse Apache directory listing HTML → array of .png filenames
// ---------------------------------------------------------------------------

function parseDirectoryListing(html) {
  const matches = [...html.matchAll(/href="([^"]+\.png)"/gi)]
  return matches.map(m => path.basename(m[1]))
}

// ---------------------------------------------------------------------------
// Strategy A: direct file downloads from directory listing
// ---------------------------------------------------------------------------

async function tryDirectDownload(category, subdir, outDir) {
  const listUrl = `${NIH_ROOT}/${subdir}/`
  let html
  try {
    html = await fetchText(listUrl)
  } catch (e) {
    console.log(`  Directory listing unavailable (${e.message}), will use ZIP fallback`)
    return null
  }

  const files = parseDirectoryListing(html)
  if (files.length === 0) {
    console.log('  No .png files found in directory listing, will use ZIP fallback')
    return null
  }

  console.log(`  Found ${files.length} files in listing, downloading ${IMAGES_PER_CAT}...`)
  const saved = []
  fs.mkdirSync(outDir, { recursive: true })

  for (const file of files.slice(0, IMAGES_PER_CAT)) {
    const url  = `${NIH_ROOT}/${subdir}/${encodeURIComponent(file)}`
    const dest = path.join(outDir, `${category}_${String(saved.length).padStart(3, '0')}.png`)
    try {
      await downloadFile(url, dest)
      saved.push(path.basename(dest))
    } catch (e) {
      console.log(`  SKIP ${file}: ${e.message}`)
    }
  }
  return saved
}

// ---------------------------------------------------------------------------
// Strategy B: download ZIP + extract via tar (Windows 10+ built-in)
// ---------------------------------------------------------------------------

async function downloadAndExtract(category, subdir, outDir) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const zipPath = path.join(CACHE_DIR, 'cell_images.zip')

  console.log(`  Downloading full dataset ZIP (≈337MB, one-time)...`)
  await downloadFile(NIH_ZIP, zipPath)

  const extractDir = path.join(CACHE_DIR, 'cell_images')
  if (!fs.existsSync(extractDir)) {
    console.log(`  Extracting ZIP (this may take a minute)...`)
    try {
      execSync(`tar -xf "${zipPath}" -C "${CACHE_DIR}"`, { stdio: 'inherit' })
    } catch (e) {
      // tar might output to stderr; try PowerShell Expand-Archive as fallback
      console.log('  tar failed, trying PowerShell Expand-Archive...')
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${CACHE_DIR}' -Force"`, { stdio: 'inherit' })
    }
  }

  // Locate the subdir (may be nested)
  const srcDir = path.join(extractDir, subdir)
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Could not find ${subdir} after extraction in ${extractDir}`)
  }

  fs.mkdirSync(outDir, { recursive: true })
  const candidates = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.png'))
  const saved = []
  for (const file of candidates.slice(0, IMAGES_PER_CAT)) {
    const dest = path.join(outDir, `${category}_${String(saved.length).padStart(3, '0')}.png`)
    fs.copyFileSync(path.join(srcDir, file), dest)
    saved.push(path.basename(dest))
  }
  return saved
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Blood Smear Image Setup ===')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const index    = {}
  const metadata = {}

  for (const [category, info] of Object.entries(CATEGORIES)) {
    console.log(`\n[${category}] subdir: ${info.subdir}`)
    const outDir = path.join(OUT_DIR, category)

    let saved = await tryDirectDownload(category, info.subdir, outDir)
    if (!saved) {
      saved = await downloadAndExtract(category, info.subdir, outDir)
    }

    index[category] = saved
    for (const fname of saved) {
      metadata[`${category}/${fname}`] = { label: info.label, source: info.source }
    }
    console.log(`  ${category}: ${saved.length} images saved`)
  }

  console.log('\nWriting index.json and metadata.json...')
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'),    JSON.stringify(index, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2))

  const total = Object.values(index).reduce((s, a) => s + a.length, 0)
  console.log(`\nDone. ${total} blood smear images in ${OUT_DIR}`)
}

main().catch(e => { console.error(e.message); process.exit(1) })

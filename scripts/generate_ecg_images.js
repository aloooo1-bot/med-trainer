'use strict'
/**
 * One-time setup: Downloads PTB-XL ECG records from PhysioNet and renders
 * them as SVG images organised by diagnosis category.
 *
 * Zero npm dependencies — uses only Node.js built-ins (https, fs, path).
 * DO NOT run automatically. This is a one-time manual setup step.
 *
 * Usage (from project root):
 *   node scripts/generate_ecg_images.js
 *
 * Output:
 *   public/ecg/{category}/{ecg_id}.svg    <- ECG waveform images (~30 KB each)
 *   public/ecg/index.json                 <- { category: ["00001.svg", ...] }
 *   public/ecg/metadata.json              <- { "category/00001.svg": "report" }
 *
 * Cache (gitignored, safe to delete):
 *   ptbxl_cache/                          <- downloaded CSV + waveform files
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

// ─── Config ────────────────────────────────────────────────────────────────

const PHYSIONET_BASE  = 'https://physionet.org/files/ptb-xl/1.0.3'
const CACHE_DIR       = path.join(__dirname, '..', 'ptbxl_cache')
const OUT_DIR         = path.join(__dirname, '..', 'public', 'ecg')
const IMAGES_PER_CAT  = 10
const DELAY_MS        = 400  // be polite to PhysioNet

const LEAD_NAMES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

const CATEGORIES = {
  normal:          { include: ['NORM'],                                          minLk: 80,  exclusive: true },
  afib:            { include: ['AFIB'],                                          minLk: 80  },
  stemi:           { include: ['AMI','IMI','ALMI','ILMI','IPLMI','IPMI','LMI','PMI'], minLk: 80 },
  nstemi_ischemia: { include: ['STTC','NST_','ISC_','ISCA','ISCI'],              minLk: 80,
                     exclude: ['AMI','IMI','ALMI','ILMI','IPLMI','IPMI','LMI','PMI'] },
  lvh:             { include: ['LVH'],                                           minLk: 80  },
  lbbb:            { include: ['LBBB'],                                          minLk: 100 },
  rbbb:            { include: ['RBBB'],                                          minLk: 100 },
  afib_flutter:    { include: ['AFLT'],                                          minLk: 80  },
  heart_block:     { include: ['AVB','1AVB','2AVB','3AVB'],                      minLk: 80  },
  bradycardia:     { include: ['SBRAD','PACE'],                                  minLk: 80  },
  tachycardia:     { include: ['STACH','SVTAC','PSVT'],                          minLk: 80  },
  wpw:             { include: ['WPW'],                                           minLk: 80  },
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'MedTrainer-ECGSetup/1.0' } }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadToBuffer(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} → ${url}`))
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end',  () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function fetchCached(url, localPath) {
  if (fs.existsSync(localPath)) return fs.readFileSync(localPath)
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  const buf = await downloadToBuffer(url)
  fs.writeFileSync(localPath, buf)
  return buf
}

// ─── CSV parser ─────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const fields = []
  let field = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else {
      if      (ch === '"') inQuotes = true
      else if (ch === ',') { fields.push(field); field = '' }
      else field += ch
    }
  }
  fields.push(field)
  return fields
}

function parseDatabase(csvText) {
  const lines = csvText.replace(/\r/g, '').split('\n').filter(l => l.trim())
  const headers = parseCSVLine(lines[0])
  const col = name => headers.indexOf(name)

  const idCol        = col('ecg_id')
  const fileCol      = col('filename_lr')
  const scpCol       = col('scp_codes')
  const reportCol    = col('report')
  const validatedCol = col('validated_by_human')

  return lines.slice(1)
    .map(line => {
      const f = parseCSVLine(line)
      return {
        ecg_id:       f[idCol]?.trim(),
        filename_lr:  f[fileCol]?.trim(),
        scp_codes_raw: f[scpCol]?.trim() ?? '{}',
        report:       f[reportCol]?.trim() ?? '',
        validated:    f[validatedCol]?.trim() === 'True',
      }
    })
    .filter(r => r.ecg_id && r.filename_lr)
}

function parseScpCodes(s) {
  if (!s || s === '{}') return {}
  try { return JSON.parse(s.replace(/'/g, '"')) } catch { return {} }
}

// ─── Record selection ────────────────────────────────────────────────────────

function selectRecords(db) {
  const result = {}
  for (const [cat, rules] of Object.entries(CATEGORIES)) {
    const incSet = new Set(rules.include)
    const excSet = new Set(rules.exclude ?? [])

    const matches = db.filter(row => {
      const codes = parseScpCodes(row.scp_codes_raw)
      if (!rules.include.some(c => (codes[c] ?? 0) >= rules.minLk)) return false
      if (excSet.size && rules.exclude.some(c => c in codes)) return false
      if (rules.exclusive) {
        if (Object.keys(codes).some(c => !incSet.has(c) && (codes[c] ?? 0) > 0)) return false
      }
      return true
    })

    matches.sort((a, b) => (b.validated ? 1 : 0) - (a.validated ? 1 : 0))
    result[cat] = matches.slice(0, IMAGES_PER_CAT)
    console.log(`  ${cat.padEnd(16)} ${result[cat].length} / ${matches.length} matched`)
  }
  return result
}

// ─── WFDB parser ─────────────────────────────────────────────────────────────

function parseWfdbHeader(headerText) {
  const lines = headerText.replace(/\r/g, '').trim().split('\n')
  const parts0 = lines[0].trim().split(/\s+/)
  const nsig  = parseInt(parts0[1])
  const fs    = parseFloat(parts0[2])
  const nsamp = parseInt(parts0[3])

  const signals = []
  for (let i = 1; i < lines.length && signals.length < nsig; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const p = line.split(/\s+/)
    // p[2]: "gain(baseline)/units" e.g. "1000.0/mV" or "1000.0(0)/mV"
    let gain = 1000, baseline = 0
    const m = (p[2] ?? '').match(/^([\d.]+)(?:\((-?\d+)\))?/)
    if (m) {
      gain = parseFloat(m[1]) || 1000
      baseline = m[2] !== undefined ? parseInt(m[2]) : (parseInt(p[4]) || 0)
    }
    signals.push({ gain, baseline })
  }

  return { nsig, fs, nsamp, signals }
}

function parseWfdbSignal(datBuf, nsig, nsamp, signals) {
  const out = Array.from({ length: nsig }, () => new Float32Array(nsamp))
  const maxOff = nsamp * nsig * 2
  for (let s = 0; s < nsamp; s++) {
    for (let lead = 0; lead < nsig; lead++) {
      const off = (s * nsig + lead) * 2
      if (off + 2 > maxOff || off + 2 > datBuf.length) continue
      const raw = datBuf.readInt16LE(off)
      const { gain, baseline } = signals[lead]
      out[lead][s] = gain > 0 ? (raw - baseline) / gain : 0
    }
  }
  return out
}

// ─── SVG renderer ────────────────────────────────────────────────────────────

function renderECGSvg(signals, fs) {
  const W = 1100, H = 850
  const MT = 48, MB = 30, ML = 36, MR = 26
  const COLS = 4, ROWS = 3
  const panelW = Math.floor((W - ML - MR) / COLS)
  const panelH = Math.floor((H - MT - MB) / ROWS)

  const DURATION   = 2.5   // seconds per panel
  const MV_HALF    = 2.5   // ±mV range
  const N_SAMPLES  = Math.min(Math.round(DURATION * fs), signals[0]?.length ?? 250)

  const pxPerSec = panelW / DURATION
  const pxPerMv  = panelH / (MV_HALF * 2)

  // Grid tile sizes
  const minorT = +(0.04 * pxPerSec).toFixed(2)
  const majorT = +(0.2  * pxPerSec).toFixed(2)
  const minorV = +(0.1  * pxPerMv).toFixed(2)
  const majorV = +(0.5  * pxPerMv).toFixed(2)

  const out = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  out.push(`<rect width="${W}" height="${H}" fill="#fafaf5"/>`)

  // Grid patterns (defined once, applied per panel via fill="url(#...)")
  out.push(`<defs>
  <pattern id="mg" patternUnits="userSpaceOnUse" width="${minorT}" height="${minorV}">
    <path d="M${minorT} 0L0 0 0${minorV}" fill="none" stroke="#f0c0c0" stroke-width="0.25"/>
  </pattern>
  <pattern id="Mg" patternUnits="userSpaceOnUse" width="${majorT}" height="${majorV}">
    <path d="M${majorT} 0L0 0 0${majorV}" fill="none" stroke="#e4a0a0" stroke-width="0.55"/>
  </pattern>
</defs>`)

  out.push(`<text x="${W/2}" y="30" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#555">12-Lead ECG · 25 mm/s · 10 mm/mV</text>`)
  out.push(`<text x="8" y="${H-8}" font-family="sans-serif" font-size="7" fill="#bbb">ECG from PTB-XL dataset / PhysioNet (Wagner et al., 2020). Educational use only.</text>`)

  for (let idx = 0; idx < 12; idx++) {
    const row = Math.floor(idx / COLS)
    const col = idx % COLS
    const px  = ML + col * panelW
    const py  = MT + row * panelH
    const sig = signals[idx] ?? new Float32Array(N_SAMPLES)

    // Build polyline
    const pts = []
    for (let s = 0; s < N_SAMPLES; s++) {
      const x  = ((s / (N_SAMPLES - 1)) * panelW).toFixed(1)
      const mv = Math.max(-MV_HALF, Math.min(MV_HALF, sig[s] || 0))
      const y  = ((MV_HALF - mv) * pxPerMv).toFixed(1)
      pts.push(`${x},${y}`)
    }

    out.push(`<g transform="translate(${px},${py})">`)
    out.push(`<rect width="${panelW}" height="${panelH}" fill="url(#mg)"/>`)
    out.push(`<rect width="${panelW}" height="${panelH}" fill="url(#Mg)"/>`)
    out.push(`<rect width="${panelW}" height="${panelH}" fill="none" stroke="#ccc" stroke-width="0.5"/>`)
    out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#111" stroke-width="0.85" stroke-linejoin="round"/>`)
    out.push(`<text x="3" y="11" font-family="sans-serif" font-size="9" font-weight="bold" fill="#333">${LEAD_NAMES[idx]}</text>`)
    out.push(`</g>`)
  }

  out.push(`</svg>`)
  return out.join('\n')
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== PTB-XL ECG Image Generator ===')
  console.log(`Cache  → ${CACHE_DIR}`)
  console.log(`Output → ${OUT_DIR}\n`)

  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.mkdirSync(OUT_DIR,   { recursive: true })

  // 1. Fetch metadata CSV
  console.log('Step 1: Downloading ptbxl_database.csv...')
  const csvBuf = await fetchCached(
    `${PHYSIONET_BASE}/ptbxl_database.csv`,
    path.join(CACHE_DIR, 'ptbxl_database.csv')
  )

  // 2. Select records
  console.log('Step 2: Selecting records by diagnosis category...')
  const db       = parseDatabase(csvBuf.toString('utf8'))
  console.log(`  Database: ${db.length} records total`)
  const selected = selectRecords(db)

  // 3. Download waveforms + render SVGs
  console.log('\nStep 3: Downloading waveforms and rendering SVGs...')
  const index    = {}
  const metadata = {}

  for (const [cat, records] of Object.entries(selected)) {
    index[cat] = []
    if (!records.length) { console.log(`\n[${cat}] — no records, skipping`); continue }

    fs.mkdirSync(path.join(OUT_DIR, cat), { recursive: true })
    console.log(`\n[${cat}] ${records.length} records`)

    for (const record of records) {
      const ecgId   = String(record.ecg_id).padStart(5, '0')
      const svgName = `${ecgId}.svg`
      const svgPath = path.join(OUT_DIR, cat, svgName)

      if (fs.existsSync(svgPath)) {
        console.log(`  ${ecgId}: already exists`)
        index[cat].push(svgName)
        metadata[`${cat}/${svgName}`] = record.report
        continue
      }

      const baseUrl   = `${PHYSIONET_BASE}/${record.filename_lr}`
      const localBase = path.join(CACHE_DIR, record.filename_lr)

      try {
        process.stdout.write(`  ${ecgId}: downloading...`)
        const [heaBuf, datBuf] = await Promise.all([
          fetchCached(`${baseUrl}.hea`, `${localBase}.hea`),
          fetchCached(`${baseUrl}.dat`, `${localBase}.dat`),
        ])

        const header  = parseWfdbHeader(heaBuf.toString('utf8'))
        const signals = parseWfdbSignal(datBuf, header.nsig, header.nsamp, header.signals)
        const svg     = renderECGSvg(signals, header.fs)

        fs.writeFileSync(svgPath, svg, 'utf8')
        index[cat].push(svgName)
        metadata[`${cat}/${svgName}`] = record.report
        console.log(` ✓  (${(svg.length / 1024).toFixed(1)} KB)`)

        await sleep(DELAY_MS)
      } catch (err) {
        console.log(` ✗  SKIPPED — ${err.message}`)
      }
    }
  }

  // 4. Write index + metadata
  console.log('\nStep 4: Writing index.json and metadata.json...')
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'),    JSON.stringify(index, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2))

  const total = Object.values(index).reduce((s, a) => s + a.length, 0)
  console.log(`\n✓ Done — ${total} ECG images in ${OUT_DIR}`)
  console.log('  Commit: public/ecg/index.json and public/ecg/metadata.json')
  console.log('  SVG images are local-only (gitignored).')
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1) })

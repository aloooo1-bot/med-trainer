/**
 * Read-only inventory of the case library.
 *
 * Answers: how many cases per system × difficulty, broken down by source
 *   (image-first `img-*` rows vs manifest-driven rows), and where are the gaps?
 *
 * Source classification:
 *   - img-*  → produced by scripts/image-first-cases.mjs (anchored to a real Open-i image)
 *   - other  → produced by scripts/fill-library.mjs from scripts/case-manifest.mjs
 *
 * Reports gaps two ways:
 *   1. DIAG_QUERY pathologies (from imaging-utils.mjs) with zero img-* cases
 *   2. MANIFEST diagnoses (from case-manifest.mjs) with zero case rows
 *
 * Usage:
 *   node scripts/inventory-library.mjs
 *   node scripts/inventory-library.mjs --json scripts/inventory.json
 *
 * Read-only — never writes to Supabase.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { MANIFEST } from './case-manifest.mjs'
import { DIAG_QUERY } from './lib/imaging-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1)
}

const args = process.argv.slice(2)
const getArg = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const jsonOut = getArg('--json')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SYSTEMS = Object.keys(MANIFEST)
const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchAll() {
  const rows = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, is_generated')
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Supabase fetch: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isImg = id => typeof id === 'string' && id.startsWith('img-')

// Match a case diagnosis against DIAG_QUERY entries (case-insensitive substring or exact)
function matchDiagQueryKey(diagnosis) {
  if (!diagnosis) return null
  const lc = diagnosis.toLowerCase()
  for (const [keys] of DIAG_QUERY) {
    for (const k of keys) {
      if (lc.includes(k.toLowerCase()) || k.toLowerCase().includes(lc)) return keys[0]
    }
  }
  return null
}

// Match a case row against a MANIFEST entry (system, difficulty, diagnosis match approximately)
function matchManifest(row) {
  const list = MANIFEST[row.system]?.[row.difficulty]
  if (!list) return null
  const lc = (row.diagnosis ?? '').toLowerCase()
  for (const m of list) {
    const mlc = m.toLowerCase()
    // exact or substring (manifest names sometimes carry parenthetical detail)
    if (mlc === lc || mlc.includes(lc) || lc.includes(mlc.replace(/\s*\(.*?\)\s*/g, '').trim())) {
      return m
    }
  }
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching all cases…')
  const rows = await fetchAll()
  console.log(`Fetched ${rows.length} rows.\n`)

  const generated = rows.filter(r => r.is_generated)

  // Counts by source
  const imgCases = generated.filter(r => isImg(r.id))
  const manCases = generated.filter(r => !isImg(r.id))

  // Matrix: system × difficulty × source
  const matrix = {}
  for (const sys of SYSTEMS) {
    matrix[sys] = {}
    for (const d of DIFFICULTIES) {
      matrix[sys][d] = { img: 0, manifest: 0, total: 0 }
    }
  }
  for (const r of generated) {
    if (!matrix[r.system]?.[r.difficulty]) continue
    const cell = matrix[r.system][r.difficulty]
    if (isImg(r.id)) cell.img++; else cell.manifest++
    cell.total++
  }

  // Gap 1: DIAG_QUERY pathologies with zero img-* coverage
  const imgKeysSeen = new Set()
  for (const r of imgCases) {
    const k = matchDiagQueryKey(r.diagnosis)
    if (k) imgKeysSeen.add(k)
  }
  const imgGaps = DIAG_QUERY
    .map(([keys]) => keys[0])
    .filter(k => !imgKeysSeen.has(k))

  // Gap 2: MANIFEST diagnoses with zero rows
  const manifestSeen = new Set()
  for (const r of generated) {
    const m = matchManifest(r)
    if (m) manifestSeen.add(`${r.system}|${r.difficulty}|${m}`)
  }
  const manifestGaps = []
  let manifestTotal = 0
  for (const sys of SYSTEMS) {
    for (const d of DIFFICULTIES) {
      const list = MANIFEST[sys]?.[d] ?? []
      for (const dx of list) {
        manifestTotal++
        if (!manifestSeen.has(`${sys}|${d}|${dx}`)) {
          manifestGaps.push({ system: sys, difficulty: d, diagnosis: dx })
        }
      }
    }
  }

  // ── Print ───────────────────────────────────────────────────────────────────
  console.log('═══ TOTALS ═══')
  console.log(`  Total rows:            ${rows.length}`)
  console.log(`  is_generated=true:     ${generated.length}`)
  console.log(`  img-* (image-first):   ${imgCases.length}`)
  console.log(`  manifest-driven:       ${manCases.length}`)
  console.log()

  console.log('═══ MATRIX (img / manifest / total) ═══')
  const headerCells = DIFFICULTIES.map(d => d.padEnd(20)).join(' ')
  console.log(`${'System'.padEnd(28)} ${headerCells}`)
  console.log('─'.repeat(28 + 1 + DIFFICULTIES.length * 21))
  for (const sys of SYSTEMS) {
    const cells = DIFFICULTIES.map(d => {
      const c = matrix[sys][d]
      return `${c.img}/${c.manifest}/${c.total}`.padEnd(20)
    }).join(' ')
    console.log(`${sys.padEnd(28)} ${cells}`)
  }
  console.log()

  console.log('═══ IMAGE-FIRST GAPS (DIAG_QUERY pathologies with 0 img-* cases) ═══')
  if (imgGaps.length === 0) {
    console.log('  (none — every DIAG_QUERY pathology has at least one image-first case)')
  } else {
    console.log(`  ${imgGaps.length} of ${DIAG_QUERY.length} pathologies missing:`)
    for (const k of imgGaps) console.log(`    - ${k}`)
  }
  console.log()

  console.log('═══ MANIFEST GAPS (manifest diagnoses with 0 rows) ═══')
  if (manifestGaps.length === 0) {
    console.log(`  (none — all ${manifestTotal} manifest slots have at least one case)`)
  } else {
    console.log(`  ${manifestGaps.length} of ${manifestTotal} manifest slots missing:`)
    const bySystem = {}
    for (const g of manifestGaps) {
      bySystem[g.system] ??= []
      bySystem[g.system].push(`[${g.difficulty}] ${g.diagnosis}`)
    }
    for (const [sys, items] of Object.entries(bySystem)) {
      console.log(`  ${sys}:`)
      for (const it of items) console.log(`    - ${it}`)
    }
  }

  if (jsonOut) {
    const out = {
      totals: {
        rows: rows.length,
        generated: generated.length,
        img: imgCases.length,
        manifest: manCases.length,
      },
      matrix,
      imgGaps,
      manifestGaps,
    }
    fs.writeFileSync(path.resolve(ROOT, jsonOut), JSON.stringify(out, null, 2))
    console.log(`\nJSON report → ${jsonOut}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })

/**
 * Structural audit for the cascade-cases migration.
 *
 * Checks:
 *   1. Per-(system, diagnosis) row counts match the cascade rule
 *   2. Every expanded MANIFEST entry has a corresponding DB row
 *   3. No duplicate case IDs in the DB
 *   4. All clones in a cascade group share identical case_data
 *
 * Usage:
 *   node scripts/audit-cascade.mjs
 *
 * Exits 1 if any check fails.
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { MANIFEST } from './case-manifest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function makeCaseId(system, difficulty, diagnosis, variantIndex) {
  return `${slugify(system)}-${slugify(difficulty)}-${slugify(diagnosis)}-${variantIndex}`
}

const TIER_RANK = { Foundations: 0, Clinical: 1, Advanced: 2 }
const EXPECTED_TIERS = { Foundations: 3, Clinical: 2, Advanced: 1 }

async function fetchAllCases() {
  const PAGE = 1000
  let offset = 0
  const rows = []
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, variant_index, case_data')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Fetch failed: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return rows
}

function pass(msg)  { console.log(`  ✓ ${msg}`) }
function fail(msg)  { console.log(`  ✗ ${msg}`); return true }

async function main() {
  console.log('── Cascade audit ──\n')
  const allRows = await fetchAllCases()
  const manifestRows = allRows.filter(r => !r.id.startsWith('img-') && !r.id.startsWith('local-'))
  const imgRows      = allRows.filter(r => r.id.startsWith('img-'))
  console.log(`Total rows: ${allRows.length} (manifest: ${manifestRows.length}, img: ${imgRows.length}, local: ${allRows.length - manifestRows.length - imgRows.length})\n`)

  let anyFail = false

  // ── Check 1: Duplicate IDs ──────────────────────────────────────────────────
  console.log('Check 1: No duplicate IDs')
  const idSeen = new Map()
  for (const r of allRows) idSeen.set(r.id, (idSeen.get(r.id) ?? 0) + 1)
  const dupes = [...idSeen.entries()].filter(([, n]) => n > 1)
  if (dupes.length > 0) {
    anyFail = fail(`${dupes.length} duplicate ID(s): ${dupes.slice(0, 5).map(([id]) => id).join(', ')}`)
  } else {
    pass('All IDs unique')
  }

  // ── Check 2: Per-(system, diagnosis) tier counts ────────────────────────────
  console.log('\nCheck 2: Cascade tier counts (manifest + img, excluding local)')
  const served = [...manifestRows, ...imgRows]

  // Group by (system, diagnosis) — find the origin (lowest tier) per group
  const groups = new Map()
  for (const r of served) {
    const key = `${r.system}||${r.diagnosis}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  let countFails = 0
  for (const [key, rows] of groups) {
    const tiers = rows.map(r => r.difficulty)
    const originTier = tiers.reduce((min, t) =>
      (TIER_RANK[t] ?? 99) < (TIER_RANK[min] ?? 99) ? t : min, tiers[0])
    const expected = EXPECTED_TIERS[originTier]
    if (expected === undefined) continue
    if (rows.length < expected) {
      const [sys, dx] = key.split('||')
      fail(`[${sys}] "${dx}" has ${rows.length} tier(s), expected ${expected} (origin: ${originTier})`)
      countFails++
    }
  }
  if (countFails === 0) {
    pass(`All ${groups.size} (system, diagnosis) groups have the correct tier count`)
  } else {
    anyFail = true
  }

  // ── Check 3: Manifest ↔ DB alignment ───────────────────────────────────────
  console.log('\nCheck 3: Manifest ↔ DB alignment')
  const dbIds = new Set(allRows.map(r => r.id))
  let orphanManifest = 0
  let orphanDb       = 0

  for (const [system, diffs] of Object.entries(MANIFEST)) {
    for (const [difficulty, diagnoses] of Object.entries(diffs)) {
      for (const diagnosis of diagnoses) {
        const expectedId = makeCaseId(system, difficulty, diagnosis, 0)
        if (!dbIds.has(expectedId)) {
          fail(`Manifest entry has no DB row: ${expectedId}`)
          orphanManifest++
        }
      }
    }
  }

  // Build set of all manifest IDs for reverse check
  const manifestIds = new Set()
  for (const [system, diffs] of Object.entries(MANIFEST)) {
    for (const [difficulty, diagnoses] of Object.entries(diffs)) {
      for (const diagnosis of diagnoses) {
        manifestIds.add(makeCaseId(system, difficulty, diagnosis, 0))
      }
    }
  }
  // Only flag variant-0 rows — variant-1, -2, etc. are extra variants from fill-library runs
  // and are intentionally not in the manifest (they're reachable by direct ID but not manifest pick)
  for (const row of manifestRows) {
    if ((row.variant_index ?? 0) !== 0) continue
    if (!manifestIds.has(row.id)) {
      // Warn only — these are dead cases from old manifest entries (renamed diagnoses etc.)
      console.log(`  ⚠ DB row (variant 0) has no manifest entry (old/renamed diagnosis): ${row.id}`)
      orphanDb++
    }
  }

  if (orphanManifest === 0) {
    pass(`All manifest entries have DB rows${orphanDb > 0 ? ` (${orphanDb} legacy DB orphan(s) — informational)` : ''}`)
  } else {
    anyFail = true
  }

  // ── Check 4: case_data identity within cascade variant groups ──────────────
  // Group by (system, diagnosis, variant_index) — all tier-clones of the same variant
  // must share identical case_data (they were created by copying, not regenerating).
  console.log('\nCheck 4: case_data identity across cascade clones (per variant)')
  // img-* cases: multiple source images can share the same diagnosis with different case_data
  // (they're distinct cases, not clones). Only check manifest rows where case_data must be identical.
  const variantGroups = new Map()
  for (const r of manifestRows) {
    const key = `${r.system}||${r.diagnosis}||${r.variant_index ?? 0}`
    if (!variantGroups.has(key)) variantGroups.set(key, [])
    variantGroups.get(key).push(r)
  }
  let driftCount = 0
  for (const [key, rows] of variantGroups) {
    if (rows.length <= 1) continue
    const canonical = JSON.stringify(rows[0].case_data)
    for (const r of rows.slice(1)) {
      if (JSON.stringify(r.case_data) !== canonical) {
        const [sys, dx, vi] = key.split('||')
        fail(`case_data drift in [${sys}] "${dx}" v${vi} — tier ${r.difficulty} differs from ${rows[0].difficulty}`)
        driftCount++
      }
    }
  }
  if (driftCount === 0) {
    pass('All cascade clones have identical case_data')
  } else {
    anyFail = true
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────')
  if (anyFail) {
    console.log('RESULT: FAIL')
    process.exit(1)
  } else {
    console.log('RESULT: PASS')
  }
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * Cascade cases up the difficulty ladder.
 *
 * Rule (easier bubbles UP into harder tiers):
 *   Foundations-authored → also create Clinical + Advanced clones
 *   Clinical-authored    → also create Advanced clone
 *   Advanced-authored    → no clones needed
 *
 * Idempotent: clone IDs are deterministic, so re-running is a no-op.
 * local-* cases are skipped — they are not served by the trainer.
 *
 * Usage:
 *   node scripts/cascade-cases.mjs             # real run
 *   node scripts/cascade-cases.mjs --dry-run   # print plan, no writes
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const dryRun = process.argv.includes('--dry-run')

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

const TARGET_TIERS = {
  Foundations: ['Clinical', 'Advanced'],
  Clinical:    ['Advanced'],
  Advanced:    [],
}

function buildCloneId(sourceRow, targetTier) {
  const { id, system, difficulty, diagnosis, variant_index } = sourceRow
  if (id.startsWith('img-')) {
    return `${id}-${slugify(targetTier)}`
  }
  // Manifest case — rebuild using the target tier in the slug
  return makeCaseId(system, targetTier, diagnosis, variant_index ?? 0)
}

async function fetchAllCases() {
  const PAGE = 1000
  let offset = 0
  const rows = []
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Fetch failed: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return rows
}

async function main() {
  console.log(dryRun ? '── DRY RUN (no writes) ──' : '── Running cascade ──')

  const allRows = await fetchAllCases()
  console.log(`Fetched ${allRows.length} existing case rows.`)

  const existingIds = new Set(allRows.map(r => r.id))

  const toCreate = []
  let skipped = 0

  for (const row of allRows) {
    // Skip local-* cases — not served by the trainer
    if (row.id.startsWith('local-')) continue

    const tiers = TARGET_TIERS[row.difficulty]
    if (!tiers || tiers.length === 0) continue

    for (const targetTier of tiers) {
      const cloneId = buildCloneId(row, targetTier)
      if (existingIds.has(cloneId)) {
        skipped++
        continue
      }
      toCreate.push({
        id:               cloneId,
        system:           row.system,
        difficulty:       targetTier,
        diagnosis:        row.diagnosis,
        variant_index:    row.variant_index ?? 0,
        case_data:        row.case_data,
        is_generated:     row.is_generated,
        generated_at:     row.generated_at,
        verified_images:  row.verified_images ?? null,
        imaging_cache:    {},
        imaging_cached_at: null,
      })
      // Track so we don't double-create if multiple source rows produce same clone id
      existingIds.add(cloneId)
    }
  }

  console.log(`Would create : ${toCreate.length}`)
  console.log(`Already exist: ${skipped}`)

  if (dryRun || toCreate.length === 0) {
    if (toCreate.length > 0) {
      console.log('\nFirst 10 clone IDs:')
      toCreate.slice(0, 10).forEach(r => console.log(`  [${r.difficulty}] ${r.id}`))
    }
    console.log(dryRun ? '\nDry-run complete — no writes performed.' : '\nNothing to create.')
    return
  }

  // Upsert in batches of 100
  const BATCH = 100
  let created = 0
  let errors  = 0
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH)
    const { error } = await supabase
      .from('cases')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH) + 1} error: ${error.message}`)
      errors += batch.length
    } else {
      created += batch.length
      process.stdout.write(`\r  Upserted ${created}/${toCreate.length}...`)
    }
  }
  console.log()

  console.log('\n─────────────────────────────')
  console.log(`Created : ${created}`)
  console.log(`Skipped : ${skipped}`)
  console.log(`Errors  : ${errors}`)
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * Seed the Supabase `cases` table with all 432 case slots from the manifest.
 * Run once after creating the schema:
 *   node scripts/seed-cases.mjs
 *
 * Requires in .env.local (or environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { MANIFEST, VARIANT_SEEDS } from './case-manifest.mjs'
import { config } from 'dotenv'

// Load .env.local
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function makeCaseId(system, difficulty, diagnosis, variantIndex) {
  return `${slugify(system)}-${slugify(difficulty)}-${slugify(diagnosis)}-${variantIndex}`
}

async function seed() {
  const rows = []

  for (const [system, byDiff] of Object.entries(MANIFEST)) {
    for (const [difficulty, diagnoses] of Object.entries(byDiff)) {
      for (const diagnosis of diagnoses) {
        for (let vi = 0; vi < VARIANT_SEEDS.length; vi++) {
          rows.push({
            id: makeCaseId(system, difficulty, diagnosis, vi),
            system,
            difficulty,
            diagnosis,
            variant_index: vi,
            is_generated: false,
          })
        }
      }
    }
  }

  console.log(`Seeding ${rows.length} case slots…`)

  // Upsert in batches of 100
  const BATCH = 100
  let inserted = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error, count } = await supabase
      .from('cases')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
      .select('id', { count: 'exact', head: true })

    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message)
    } else {
      inserted += count ?? batch.length
    }
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`)
  }

  console.log(`\nDone. ${inserted} rows inserted, ${rows.length - inserted} already existed.`)

  // Print sample
  const { data: sample } = await supabase
    .from('cases')
    .select('id, system, difficulty, diagnosis, variant_index')
    .limit(3)
  console.log('\nSample rows:')
  sample?.forEach(r => console.log(`  ${r.id}`))
}

seed().catch(err => { console.error(err); process.exit(1) })

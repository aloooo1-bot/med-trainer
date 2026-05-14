/**
 * Delete all unseeded case rows (is_generated = false) from the DB.
 *
 * These are placeholder slots created by seed-cases.mjs that were never
 * filled by fill-library.mjs. The cascade script copied is_generated from
 * source rows, so this also removes all tier-clones of unseeded cases.
 *
 * Usage:
 *   node scripts/delete-unseeded.mjs             # interactive confirmation
 *   node scripts/delete-unseeded.mjs --dry-run   # preview only, no writes
 *   node scripts/delete-unseeded.mjs --yes        # skip confirmation prompt
 *
 * After running: rewrite the manifest, then re-run seed → fill → cascade → audit.
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const dryRun = process.argv.includes('--dry-run')
const skipConfirm = process.argv.includes('--yes')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fetchUnseeded() {
  const PAGE = 1000
  let offset = 0
  const rows = []
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis')
      .eq('is_generated', false)
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
  console.log(dryRun ? '── DRY RUN (no writes) ──\n' : '── Delete unseeded cases ──\n')

  const rows = await fetchUnseeded()

  if (rows.length === 0) {
    console.log('Nothing to delete. All cases are generated.')
    return
  }

  // Breakdown by difficulty
  const byDiff = {}
  for (const r of rows) {
    byDiff[r.difficulty] = (byDiff[r.difficulty] ?? 0) + 1
  }

  console.log(`Unseeded rows: ${rows.length}`)
  for (const [diff, count] of Object.entries(byDiff).sort()) {
    console.log(`  ${diff}: ${count}`)
  }
  console.log('\nSample IDs (first 10):')
  rows.slice(0, 10).forEach(r => console.log(`  ${r.id}`))

  if (dryRun) {
    console.log('\nDry-run complete — no writes performed.')
    return
  }

  if (!skipConfirm) {
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question('\nType "delete" to confirm: ')
    rl.close()
    if (answer.trim() !== 'delete') {
      console.log('Aborted.')
      return
    }
  }

  console.log('\nDeleting…')
  const { error } = await supabase
    .from('cases')
    .delete()
    .eq('is_generated', false)

  if (error) {
    console.error(`Delete failed: ${error.message}`)
    process.exit(1)
  }

  // Verify
  const remaining = await fetchUnseeded()
  if (remaining.length > 0) {
    console.error(`Warning: ${remaining.length} unseeded rows still remain after delete.`)
    process.exit(1)
  }

  console.log(`\nDeleted ${rows.length} unseeded rows. DB is clean.`)
  console.log('\nNext steps:')
  console.log('  1. Update scripts/case-manifest.mjs and app/lib/caseManifest.ts with your new lineup')
  console.log('  2. node scripts/seed-cases.mjs')
  console.log('  3. node scripts/fill-library.mjs')
  console.log('  4. node scripts/cascade-cases.mjs')
  console.log('  5. node scripts/audit-cascade.mjs')
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * Pre-fetches Open-i images for every generated case and writes results to
 * the imaging_cache column in Supabase. Run after fill-library.mjs.
 *
 * ECG, peripheral smear, biopsy, fundus, derm, and urine microscopy tests
 * are skipped — those use separate curated image systems in the trainer.
 *
 * Usage:
 *   node scripts/prefetch-imaging.mjs
 *   node scripts/prefetch-imaging.mjs --system Respiratory
 *   node scripts/prefetch-imaging.mjs --difficulty Foundations
 *   node scripts/prefetch-imaging.mjs --force          # re-fetch even if already cached
 *   node scripts/prefetch-imaging.mjs --dry-run        # show work without writing
 *   node scripts/prefetch-imaging.mjs --concurrency 4  # parallel cases (default 3)
 *
 * After running, check the output for "MISSING" lines — those test/diagnosis
 * combos returned no Open-i results and need manual image curation.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { getTestParams, fetchImagesForTest } from './lib/imaging-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.')
  process.exit(1)
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const filterSystem     = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const force            = args.includes('--force')
const dryRun           = args.includes('--dry-run')
// Open-i drops connections under parallel load — keep concurrency low (1-2)
const concurrency      = parseInt(getArg('--concurrency') ?? '1', 10)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Fetch all generated cases (optionally filtered)
  let query = supabase
    .from('cases')
    .select('id, system, difficulty, diagnosis, case_data, imaging_cache, imaging_cached_at')
    .eq('is_generated', true)
  if (filterSystem)     query = query.eq('system', filterSystem)
  if (filterDifficulty) query = query.eq('difficulty', filterDifficulty)

  const { data: cases, error } = await query
  if (error) { console.error('Supabase error:', error.message); process.exit(1) }
  if (!cases?.length) { console.log('No generated cases found.'); return }

  // Skip already-cached unless --force
  const workList = force
    ? cases
    : cases.filter(c => !c.imaging_cached_at)

  console.log(`\n${cases.length} generated cases — ${workList.length} to prefetch${force ? ' (--force)' : ''}`)
  if (filterSystem)     console.log(`  System:     ${filterSystem}`)
  if (filterDifficulty) console.log(`  Difficulty: ${filterDifficulty}`)
  if (dryRun) console.log('  DRY RUN — no writes\n')
  else        console.log()

  // Stats
  let done = 0, totalTests = 0, found = 0, missing = 0, skipped = 0
  const missingList = [] // { caseId, diagnosis, test } — needs manual curation

  // Process cases with controlled concurrency
  const queue = [...workList]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const c = queue.shift()
      if (!c) break
      await processCase(c)
    }
  })
  await Promise.all(workers)

  async function processCase(c) {
    const caseData = c.case_data
    if (!caseData?.availableImaging?.length) {
      console.log(`  [SKIP] ${c.id} — no availableImaging`)
      done++
      return
    }

    const cache = {}
    const testResults = []

    for (const testName of caseData.availableImaging) {
      totalTests++
      const { results, skipped: skip, unknown, query } = await fetchImagesForTest(
        testName, caseData.diagnosis, caseData.imagingCategory
      )

      if (skip) {
        skipped++
        testResults.push(`    [skip]    ${testName}`)
        continue
      }
      if (unknown) {
        testResults.push(`    [?]       ${testName} — no query mapping`)
        cache[testName] = []
        missing++
        missingList.push({ caseId: c.id, diagnosis: c.diagnosis, test: testName, reason: 'no_mapping' })
        continue
      }
      if (!results || results.length === 0) {
        // Do NOT cache empty results — leave the key absent so the trainer falls back to live fetch.
        // Only record in missingList for reporting purposes.
        missing++
        missingList.push({ caseId: c.id, diagnosis: c.diagnosis, test: testName, reason: 'no_results', query })
        testResults.push(`    [MISSING] ${testName}  (query: "${query}")`)
        continue
      }

      cache[testName] = results
      found++
      testResults.push(`    [ok]  ${testName}  (${results.length} images)`)
    }

    // Only write to Supabase if we actually found at least one image.
    // Never overwrite with an all-empty cache — that would suppress live fallback in the trainer.
    const hasAnyResults = Object.keys(cache).length > 0
    if (hasAnyResults && !dryRun) {
      const { error: upsertErr } = await supabase
        .from('cases')
        .update({ imaging_cache: cache, imaging_cached_at: new Date().toISOString() })
        .eq('id', c.id)
      if (upsertErr) {
        console.error(`  [ERROR] ${c.id}: ${upsertErr.message}`)
      }
    } else if (!hasAnyResults && !dryRun) {
      process.stdout.write(`  (no images found — skipping Supabase write to preserve live-fetch fallback)\n`)
    }

    done++
    const status = Object.values(cache).some(v => v.length === 0) ? '⚠' : '✓'
    console.log(`${status} [${done}/${workList.length}] ${c.id}`)
    for (const line of testResults) console.log(line)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────')
  console.log(`Cases processed : ${done}`)
  console.log(`Tests checked   : ${totalTests}`)
  console.log(`  With images   : ${found}`)
  console.log(`  Missing       : ${missing}`)
  console.log(`  Skipped (ECG/special/procedure): ${skipped}`)

  if (missingList.length > 0) {
    console.log(`\n⚠  ${missingList.length} test(s) need manual image curation:`)
    console.log('   These returned no Open-i results. To fix:')
    console.log('   1. Find a CC-licensed image on Wikimedia Commons or NLM')
    console.log('   2. Upload to Supabase Storage (bucket: case-images)')
    console.log('   3. Update imaging_cache for the case directly in the DB\n')
    for (const m of missingList) {
      const detail = m.reason === 'no_mapping'
        ? '(no query mapping in DIAG_QUERY — add one above in imaging-utils.mjs)'
        : `query was: "${m.query}"`
      console.log(`   ${m.caseId}  |  ${m.test}  |  ${detail}`)
    }
  } else {
    console.log('\n✓ All imaging tests have pre-fetched images.')
  }
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) })

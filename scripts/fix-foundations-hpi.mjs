/**
 * Surgical batch fix: tighten hpi for all Foundations-difficulty library cases.
 *
 * For each Foundations case in Supabase, Claude Haiku:
 *   1. Rewrites `hpi` to ≤60 words covering only chief complaint, primary
 *      symptom(s), and duration — no associated symptoms, no diagnosis hints.
 *   2. Merges any removed detail into `hiddenHistory.fullHistory` so the
 *      patient can reveal it during interview.
 *
 * Usage:
 *   node scripts/fix-foundations-hpi.mjs               # fix all Foundations cases
 *   node scripts/fix-foundations-hpi.mjs --dry-run     # preview without writing
 *   node scripts/fix-foundations-hpi.mjs --case-id xxx # fix one specific case
 *   node scripts/fix-foundations-hpi.mjs --limit 10    # process first N cases
 *   node scripts/fix-foundations-hpi.mjs --concurrency 3
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const dryRun      = args.includes('--dry-run')
const caseFilter  = getArg('--case-id')
const concurrency = parseInt(getArg('--concurrency') ?? '3', 10)
const limit       = parseInt(getArg('--limit') ?? '0', 10)

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY'); process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Fetch all Foundations cases ───────────────────────────────────────────────
async function fetchFoundationsCases() {
  let query = supabase
    .from('cases')
    .select('id, system, diagnosis, case_data')
    .eq('difficulty', 'Foundations')

  if (caseFilter) query = query.eq('id', caseFilter)

  const { data, error } = await query
  if (error) throw new Error(`Supabase fetch: ${error.message}`)
  return data ?? []
}

// ── Count words ───────────────────────────────────────────────────────────────
function wordCount(str) {
  return (str ?? '').trim().split(/\s+/).filter(Boolean).length
}

// ── Check if HPI needs fixing ─────────────────────────────────────────────────
function hpiNeedsFix(hpi) {
  if (!hpi) return false
  if (wordCount(hpi) > 60) return true

  // Heuristic: flag diagnosis-revealing patterns
  const revealing = [
    /heat intolerance/i,
    /cold intolerance/i,
    /exophthalmos/i,
    /tremor/i,
    /palpitation/i,
    /\bgoiter\b/i,
    /weight loss.*and/i,
    /presenting with.*and.*and/i,          // classic multi-symptom giveaway
    /associated (with|symptoms?)/i,
    /review of systems/i,
    /family history/i,
    /recently started/i,
    /currently taking/i,
    /on (?:metformin|lisinopril|atorvastatin|levothyroxine)/i,
    /has (a |an )?(history of|been diagnosed with)/i,
    /known (history of|case of)/i,
  ]
  return revealing.some(re => re.test(hpi))
}

// ── Fix one case via Claude Haiku ─────────────────────────────────────────────
async function fixHpi(row) {
  const cd = row.case_data
  const currentHpi = cd.hpi ?? ''
  const currentFullHistory = cd.hiddenHistory?.fullHistory ?? ''

  const prompt = `You are editing a medical education case. The Foundations-level HPI must be SHORT and NON-REVEALING so students must interview the patient to learn the full picture.

CASE: ${row.id}
DIAGNOSIS (DO NOT REVEAL IN HPI): ${row.diagnosis}
SYSTEM: ${row.system}

CURRENT HPI (${wordCount(currentHpi)} words):
${currentHpi}

CURRENT hiddenHistory.fullHistory:
${currentFullHistory}

TASK:
1. Rewrite the HPI so it:
   - Is ≤60 words (hard limit — count every word)
   - Covers ONLY: the chief complaint, primary symptom(s), and duration
   - NEVER names or implies the diagnosis (${row.diagnosis})
   - NEVER includes: associated symptoms, heat/cold intolerance, tremor, exophthalmos, toxin or substance names, pertinent positives/negatives, family history, social history, exam findings, or any detail that narrows the differential to a single diagnosis
   - Reads naturally as a 2-3 sentence presenting complaint
2. Identify all clinical details removed from the HPI that should move to hiddenHistory.fullHistory (if they are not already there).
3. Return a merged fullHistory: the existing fullHistory plus any removed details, written as a single coherent paragraph. Do NOT duplicate information already present.

Return ONLY valid JSON — no markdown, no code fences, no commentary:
{
  "hpi": "<new short HPI — ≤60 words>",
  "fullHistory": "<merged fullHistory paragraph>"
}`

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = resp.content[0]?.text?.trim() ?? ''
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`Non-JSON response for ${row.id}: ${raw.slice(0, 200)}`)
    parsed = JSON.parse(match[0])
  }

  if (!parsed.hpi) throw new Error(`Missing hpi in response for ${row.id}`)
  if (wordCount(parsed.hpi) > 70) {
    // Allow up to 70 as a soft ceiling; Haiku occasionally overshoots by a word or two
    console.warn(`  ⚠  ${row.id}: new HPI is ${wordCount(parsed.hpi)} words (over 60)`)
  }

  return {
    hpi: parsed.hpi,
    fullHistory: parsed.fullHistory ?? currentFullHistory,
  }
}

// ── Upsert one case ───────────────────────────────────────────────────────────
async function upsertCase(row, newHpi, newFullHistory) {
  const updated = {
    ...row.case_data,
    hpi: newHpi,
    hiddenHistory: {
      ...(row.case_data.hiddenHistory ?? {}),
      fullHistory: newFullHistory,
    },
  }

  const { error } = await supabase
    .from('cases')
    .update({ case_data: updated })
    .eq('id', row.id)

  if (error) throw new Error(`Supabase upsert ${row.id}: ${error.message}`)
}

// ── Process one case ──────────────────────────────────────────────────────────
async function processCase(row) {
  const hpi = row.case_data?.hpi ?? ''
  const wc = wordCount(hpi)

  if (!hpiNeedsFix(hpi)) {
    console.log(`  ✓  ${row.id} (${wc}w) — OK, skipping`)
    return { status: 'skipped' }
  }

  console.log(`  →  ${row.id} (${wc}w) ${row.diagnosis} — fixing...`)

  let result
  try {
    result = await fixHpi(row)
  } catch (err) {
    console.error(`  ✗  ${row.id}: ${err.message}`)
    return { status: 'error', error: err.message }
  }

  const newWc = wordCount(result.hpi)
  console.log(`     before: ${wc}w  →  after: ${newWc}w`)
  if (dryRun) {
    console.log(`     [dry-run] new HPI: ${result.hpi}`)
    return { status: 'dry-run' }
  }

  try {
    await upsertCase(row, result.hpi, result.fullHistory)
    return { status: 'fixed' }
  } catch (err) {
    console.error(`  ✗  ${row.id} upsert: ${err.message}`)
    return { status: 'error', error: err.message }
  }
}

// ── Concurrency pool ──────────────────────────────────────────────────────────
async function runPool(items, fn, poolSize) {
  const results = []
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: poolSize }, worker))
  return results
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Fetching Foundations cases${caseFilter ? ` (id=${caseFilter})` : ''}...`)
  let cases = await fetchFoundationsCases()

  if (limit > 0) cases = cases.slice(0, limit)

  console.log(`Found ${cases.length} Foundations case(s).${dryRun ? ' DRY RUN — no writes.' : ''}`)

  const results = await runPool(cases, processCase, concurrency)

  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  console.log('\n── Summary ──────────────────────────────────')
  for (const [status, count] of Object.entries(counts)) {
    console.log(`  ${status}: ${count}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })

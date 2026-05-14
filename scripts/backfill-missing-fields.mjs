/**
 * Backfill missing fields on existing case rows.
 *
 * Currently handles:
 *   expectedImaging — field absent from case_data (treats [] as valid; only backfills undefined)
 *
 * For each missing case: prompts Claude Haiku with the case context and asks for
 * just the missing field(s) as a JSON fragment. Merges the fragment into case_data
 * and upserts via Supabase.
 *
 * Usage:
 *   node scripts/backfill-missing-fields.mjs            # dry run (preview)
 *   node scripts/backfill-missing-fields.mjs --write    # actually write to Supabase
 *   node scripts/backfill-missing-fields.mjs --concurrency 5
 *   node scripts/backfill-missing-fields.mjs --case-id renal-foundations-nephrolithiasis-0
 *
 * Requires: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args        = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const write       = args.includes('--write')
const concurrency = parseInt(getArg('--concurrency') ?? '4', 10)
const caseFilter  = getArg('--case-id')

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY'); process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Fetch cases that are missing expectedImaging ──────────────────────────────
async function fetchCandidates() {
  const rows = []
  let offset = 0
  const pageSize = 100
  while (true) {
    let q = supabase.from('cases')
      .select('id, system, difficulty, diagnosis, case_data')
      .eq('is_generated', true)
      .range(offset, offset + pageSize - 1)
    if (caseFilter) q = q.eq('id', caseFilter)
    const { data, error } = await q
    if (error) throw new Error(`Supabase: ${error.message}`)
    if (!data?.length) break
    // expectedImaging missing = not an array (undefined/null)
    rows.push(...data.filter(r => !Array.isArray(r.case_data?.expectedImaging)))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

// ── Ask Claude for expectedImaging ───────────────────────────────────────────
async function generateExpectedImaging(row) {
  const c = row.case_data
  const availableImaging = (c.availableImaging ?? []).join(', ') || '(none listed)'
  const diagnosis = row.diagnosis || c.diagnosis || '(unknown)'
  const system    = row.system || '(unknown)'
  const difficulty = c.nativeDifficulty ?? row.difficulty ?? 'Foundations'

  const prompt = `You are reviewing a ${difficulty} ${system} clinical case with diagnosis: "${diagnosis}".
The case has these available imaging studies: ${availableImaging}

Your task: determine which studies from the availableImaging list a competent physician MUST order to diagnose or manage this case.
Return ONLY a JSON array of study names copied EXACTLY (character-for-character) from the availableImaging list.
Use [] if imaging is not part of the standard workup for this diagnosis (e.g., psychiatric disorders, isolated lab-based diagnoses).
Return 0–3 items. No explanation, no markdown — just the JSON array.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0]?.text?.trim() ?? '[]'
  const match = text.match(/\[[\s\S]*?\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    // Only keep items that are actually in availableImaging
    const available = new Set(c.availableImaging ?? [])
    return parsed.filter(item => typeof item === 'string' && available.has(item))
  } catch {
    return []
  }
}

// ── Upsert patch ─────────────────────────────────────────────────────────────
async function patchCase(row, expectedImaging) {
  const updatedCaseData = { ...row.case_data, expectedImaging }
  const { error } = await supabase.from('cases').update({ case_data: updatedCaseData }).eq('id', row.id)
  if (error) throw new Error(`Supabase update ${row.id}: ${error.message}`)
}

// ── Concurrency pool ──────────────────────────────────────────────────────────
async function runPool(tasks, limit) {
  const results = []
  let i = 0
  async function next() {
    while (i < tasks.length) {
      const idx = i++
      results[idx] = await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: limit }, next))
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('Fetching candidates (missing expectedImaging)…')
const candidates = await fetchCandidates()

if (!candidates.length) {
  console.log('No cases missing expectedImaging. Nothing to do.')
  process.exit(0)
}

console.log(`Found ${candidates.length} cases missing expectedImaging.`)
if (!write) console.log('DRY RUN — pass --write to save changes.\n')

let fixed = 0, errors = 0
const log = []

const tasks = candidates.map(row => async () => {
  try {
    const expectedImaging = await generateExpectedImaging(row)
    const label = expectedImaging.length ? `[${expectedImaging.join(', ')}]` : '[]'
    console.log(`  ${write ? '✓' : '~'} ${row.id.substring(0, 60)} → expectedImaging: ${label}`)
    if (write) await patchCase(row, expectedImaging)
    log.push({ id: row.id, expectedImaging, status: 'ok' })
    fixed++
  } catch (err) {
    console.error(`  ✗ ${row.id}: ${err.message}`)
    log.push({ id: row.id, error: err.message, status: 'error' })
    errors++
  }
})

await runPool(tasks, concurrency)

const reportPath = path.resolve(ROOT, 'scripts/backfill-report.json')
fs.writeFileSync(reportPath, JSON.stringify(log, null, 2))

console.log(`\n═══ DONE ═══`)
console.log(`  Fixed:  ${fixed}`)
console.log(`  Errors: ${errors}`)
if (!write) console.log(`  (dry run — no writes made)`)
console.log(`  Report: ${reportPath}`)

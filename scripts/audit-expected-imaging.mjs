/**
 * Audit and fix expectedImaging on existing library cases.
 *
 * For each case in Supabase that has a non-empty expectedImaging array,
 * Claude Haiku decides which (if any) of the listed studies are genuinely
 * part of the standard DIAGNOSTIC workup for that case's diagnosis.
 * Imaging ordered only to rule out unrelated pathology, look for
 * complications, or as filler "workup" is dropped. Lab-only diagnoses
 * (ITP, hemophilia, viral URI, primary hypothyroidism, etc.) end up with
 * an empty expectedImaging array.
 *
 * The grader (app/grading/rubric.ts) reads expectedImaging directly via
 * trainer/page.tsx, so cleaning these up means students stop being marked
 * down for "missing" imaging that was never indicated.
 *
 * Usage:
 *   node scripts/audit-expected-imaging.mjs --dry-run         # preview only
 *   node scripts/audit-expected-imaging.mjs                   # apply changes
 *   node scripts/audit-expected-imaging.mjs --case-id xxx     # single case
 *   node scripts/audit-expected-imaging.mjs --limit 10        # first N
 *   node scripts/audit-expected-imaging.mjs --concurrency 5
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

// ── Fetch candidate cases ─────────────────────────────────────────────────────
async function fetchCandidates() {
  let query = supabase.from('cases').select('id, system, diagnosis, difficulty, case_data')
  if (caseFilter) query = query.eq('id', caseFilter)
  const { data, error } = await query
  if (error) throw new Error(`Supabase fetch: ${error.message}`)

  // Only audit cases that currently have a non-empty expectedImaging
  return (data ?? []).filter(row => Array.isArray(row.case_data?.expectedImaging) && row.case_data.expectedImaging.length > 0)
}

// ── Audit one case via Haiku ──────────────────────────────────────────────────
async function auditCase(row) {
  const cd = row.case_data
  const current = cd.expectedImaging ?? []

  const prompt = `You are auditing a medical education case to remove imaging tests that are NOT part of the standard diagnostic workup.

DIAGNOSIS: ${row.diagnosis}
SYSTEM: ${row.system}
CURRENT expectedImaging LIST: ${JSON.stringify(current)}

DEFINITION — a study belongs in expectedImaging only if a competent physician would ROUTINELY order it to MAKE or CONFIRM this specific diagnosis. Drop a study if:
- It is ordered only to rule out an unrelated condition
- It is ordered to look for complications rather than to make the diagnosis
- It is generic "screening" not tied to this diagnosis
- The diagnosis is fundamentally lab-based (most hematologic, endocrine, autoimmune, infectious-serologic, and toxicologic diagnoses)

Examples of LAB-ONLY diagnoses where expectedImaging should be []:
- Immune Thrombocytopenia (ITP), Hemophilia, von Willebrand disease, TTP/HUS (initial dx is labs + smear)
- Iron deficiency anemia, B12/folate deficiency, sickle cell disease (dx by labs/electrophoresis)
- Hypothyroidism, hyperthyroidism (initial dx by TSH/T4 — imaging only after labs confirm)
- Diabetes mellitus, DKA, HHS (dx by glucose/ketones/ABG)
- Most viral illnesses (URI, mono, viral hepatitis, HIV — dx by serology)
- Primary adrenal insufficiency (dx by cortisol/ACTH stim)
- SLE, RA, vasculitides (initial dx by serology + clinical criteria)

Counter-examples — imaging IS expected for diagnoses like:
- Pulmonary embolism (CTA chest), DVT (venous duplex), STEMI (ECG which is procedural), aortic dissection (CTA), stroke (CT/MRI brain), appendicitis (CT abdomen or US), nephrolithiasis (CT KUB), pneumothorax (CXR), pneumonia (CXR), CHF (CXR + echo).

Return ONLY valid JSON — no markdown, no commentary:
{
  "keep": ["<study from current list that IS standard for this diagnosis>", ...],
  "drop": ["<study from current list that is NOT standard — with brief reason>", ...],
  "rationale": "<one sentence summarizing why imaging is or isn't part of this diagnosis's workup>"
}

The "keep" array MUST be a strict subset of the current list — do not invent new studies. If no listed study is standard for this diagnosis, return keep: [].`

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = resp.content[0]?.text?.trim() ?? ''
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`Non-JSON response: ${raw.slice(0, 200)}`)
    parsed = JSON.parse(match[0])
  }

  if (!Array.isArray(parsed.keep)) throw new Error(`Missing "keep" array in response`)

  // Defensive: ensure keep is a subset of current
  const validKeep = parsed.keep.filter(k => current.includes(k))
  return { keep: validKeep, drop: parsed.drop ?? [], rationale: parsed.rationale ?? '' }
}

// ── Upsert one case ───────────────────────────────────────────────────────────
async function upsertCase(row, newExpectedImaging) {
  const updated = { ...row.case_data, expectedImaging: newExpectedImaging }
  const { error } = await supabase.from('cases').update({ case_data: updated }).eq('id', row.id)
  if (error) throw new Error(`Supabase upsert ${row.id}: ${error.message}`)
}

// ── Process one case ──────────────────────────────────────────────────────────
async function processCase(row) {
  const current = row.case_data.expectedImaging ?? []

  let result
  try {
    result = await auditCase(row)
  } catch (err) {
    console.error(`  ✗  ${row.id} (${row.diagnosis}): ${err.message}`)
    return { status: 'error', error: err.message }
  }

  const droppedCount = current.length - result.keep.length
  if (droppedCount === 0) {
    console.log(`  ✓  ${row.id} ${row.diagnosis} — all ${current.length} kept`)
    return { status: 'unchanged' }
  }

  console.log(`  →  ${row.id} ${row.diagnosis}`)
  console.log(`     before: ${JSON.stringify(current)}`)
  console.log(`     after:  ${JSON.stringify(result.keep)}`)
  if (result.rationale) console.log(`     reason: ${result.rationale}`)
  if (Array.isArray(result.drop) && result.drop.length) {
    for (const d of result.drop) console.log(`       - dropped: ${d}`)
  }

  if (dryRun) return { status: 'dry-run', dropped: droppedCount }

  try {
    await upsertCase(row, result.keep)
    return { status: 'fixed', dropped: droppedCount }
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
  console.log(`Fetching cases${caseFilter ? ` (id=${caseFilter})` : ''}...`)
  let cases = await fetchCandidates()
  if (limit > 0) cases = cases.slice(0, limit)

  console.log(`Auditing ${cases.length} case(s) with non-empty expectedImaging.${dryRun ? ' DRY RUN — no writes.' : ''}\n`)

  const results = await runPool(cases, processCase, concurrency)

  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc }, {})
  const totalDropped = results.reduce((acc, r) => acc + (r.dropped ?? 0), 0)

  console.log('\n── Summary ──────────────────────────────────')
  for (const [status, count] of Object.entries(counts)) {
    console.log(`  ${status}: ${count}`)
  }
  console.log(`  total studies dropped: ${totalDropped}`)
}

main().catch(err => { console.error(err); process.exit(1) })

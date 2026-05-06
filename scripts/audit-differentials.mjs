/**
 * Differential completeness audit.
 *
 * For every case, asks Claude three questions:
 *   1. Is the most dangerous mimic present in differentials?
 *   2. Is the most common alternative present?
 *   3. Is there at least one criteria-distinguishing foil (a diagnosis
 *      that shares most features but is ruled out by one key finding)?
 *
 * Reports per-case gaps with suggested differentials, then aggregates
 * systemic themes (which gaps appear most often, by system/difficulty).
 *
 * Usage:
 *   node scripts/audit-differentials.mjs              # all cases, AI on
 *   node scripts/audit-differentials.mjs --no-ai      # sampling only (dry run)
 *   node scripts/audit-differentials.mjs --limit 24
 *   node scripts/audit-differentials.mjs --system Hematology
 *   node scripts/audit-differentials.mjs --difficulty Clinical
 *   node scripts/audit-differentials.mjs --case-id <id>
 *   node scripts/audit-differentials.mjs --concurrency 3
 *   node scripts/audit-differentials.mjs --output scripts/my-report.json
 *
 * Cost: ~$0.01/case with Sonnet 4.6 (diagnosis + differentials only, no full case JSON)
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }

const filterSystem     = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const filterCaseId     = getArg('--case-id')
const limitCases       = parseInt(getArg('--limit') ?? '0', 10)
const concurrency      = parseInt(getArg('--concurrency') ?? '3', 10)
const outputPath       = path.resolve(ROOT, getArg('--output') ?? 'scripts/differential-audit-report.json')
const noAI             = args.includes('--no-ai')

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Supabase env vars not set in .env.local'); process.exit(1)
}
if (!noAI && !process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY required (or use --no-ai for dry run)'); process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const anthropic = noAI ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Supabase fetch ────────────────────────────────────────────────────────────
async function fetchCases() {
  const rows = []
  let offset = 0
  while (true) {
    let q = supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, case_data')
      .eq('is_generated', true)
      .range(offset, offset + 99)
    if (filterSystem)     q = q.eq('system', filterSystem)
    if (filterDifficulty) q = q.eq('difficulty', filterDifficulty)
    if (filterCaseId)     q = q.eq('id', filterCaseId)
    const { data, error } = await q
    if (error) throw new Error(`Supabase: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 100) break
    offset += 100
  }
  return limitCases > 0 ? rows.slice(0, limitCases) : rows
}

// ── JSON repair ───────────────────────────────────────────────────────────────
function repairJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in response')
  let json = match[0]
  json = json.replace(/,(\s*[}\]])/g, '$1')
  return json
}

// ── Concurrency limiter ───────────────────────────────────────────────────────
function makePool(limit) {
  let running = 0
  const queue = []
  function run() {
    while (running < limit && queue.length) {
      running++
      const { fn, resolve, reject } = queue.shift()
      fn().then(resolve, reject).finally(() => { running--; run() })
    }
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); run() })
}

// ── AI differential review ────────────────────────────────────────────────────
async function reviewDifferentials(row) {
  const cd = row.case_data ?? {}
  const diagnosis   = row.diagnosis ?? cd.diagnosis ?? 'unknown'
  const differentials = cd.differentials ?? []
  const difficulty  = row.difficulty ?? 'Clinical'
  const system      = row.system ?? 'General'
  const hiddenHistory = cd.hiddenHistory ?? {}
  const teachingPoints = cd.teachingPoints ?? []

  const prompt = `You are a clinical educator reviewing a medical training case's differential diagnosis list.

Case details:
- Correct diagnosis: ${diagnosis}
- Organ system: ${system}
- Difficulty: ${difficulty}
- Current differentials list (${differentials.length} items): ${JSON.stringify(differentials)}
- Hidden history summary (not shown to student): ${hiddenHistory.fullHistory ?? 'not provided'}
- Teaching points: ${JSON.stringify(teachingPoints)}

Evaluate whether this differential list is complete and educationally optimal. Answer these three questions with strict criteria:

1. DANGEROUS MIMIC: Is the single most dangerous "can't-miss" mimic of "${diagnosis}" present in the differentials? This is a diagnosis that, if missed, causes serious immediate harm or death (e.g., PE vs pleuritis, aortic dissection vs ACS, meningitis vs migraine). It must share enough features to plausibly mislead a clinician before the key discriminating test is ordered.

2. COMMON ALTERNATIVE: Is the most epidemiologically common condition that presents similarly to "${diagnosis}" present in the differentials? This is the diagnosis a general practitioner would think of first given the presenting symptoms (high prevalence matters more than clinical severity here).

3. CRITERIA-DISTINGUISHING FOIL: Is there at least one differential that shares most of "${diagnosis}"'s presenting features but is ruled out by one specific finding, lab value, or diagnostic criterion? This foil forces the student to know the distinguishing criteria cold.

Return ONLY valid JSON with this exact structure:
{
  "hasDangerousMimic": true|false,
  "dangerousMimicPresent": "<name if present, or null>",
  "suggestedDangerousMimic": "<best candidate to add if missing, or null>",
  "dangerousMimicRationale": "<1 sentence why>",
  "hasCommonAlternative": true|false,
  "commonAlternativePresent": "<name if present, or null>",
  "suggestedCommonAlternative": "<best candidate to add if missing, or null>",
  "commonAlternativeRationale": "<1 sentence why>",
  "hasCriteriaFoil": true|false,
  "criteriaFoilPresent": "<name if present, or null>",
  "suggestedCriteriaFoil": "<best candidate to add if missing, or null>",
  "criteriaFoilRationale": "<1 sentence why>",
  "overallVerdict": "complete|minor-gap|major-gap",
  "suggestedReplacementOrAddition": "<1 sentence: which differential to swap out if list is at max count, or null if additions only>"
}`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = resp.content[0]?.text ?? ''
  const parsed = JSON.parse(repairJSON(text))
  return parsed
}

// ── Per-case audit ────────────────────────────────────────────────────────────
async function auditCase(row) {
  const cd = row.case_data ?? {}
  const differentials = cd.differentials ?? []

  if (noAI) {
    return {
      id: row.id,
      system: row.system,
      difficulty: row.difficulty,
      diagnosis: row.diagnosis,
      differentialCount: differentials.length,
      review: null,
    }
  }

  const review = await reviewDifferentials(row)
  const gapCount = [
    !review.hasDangerousMimic,
    !review.hasCommonAlternative,
    !review.hasCriteriaFoil,
  ].filter(Boolean).length

  return {
    id: row.id,
    system: row.system,
    difficulty: row.difficulty,
    diagnosis: row.diagnosis,
    differentials: differentials,
    differentialCount: differentials.length,
    review,
    gapCount,
  }
}

// ── Aggregation pass ──────────────────────────────────────────────────────────
async function aggregateThemes(results) {
  const withGaps = results.filter(r => r.review && r.gapCount > 0)

  // Static aggregation (no extra AI call needed — data is structured)
  const bySystem = {}
  const byDifficulty = { Foundations: { missing: 0, total: 0 }, Clinical: { missing: 0, total: 0 }, Advanced: { missing: 0, total: 0 } }
  let missingMimic = 0, missingCommon = 0, missingFoil = 0, totalReviewed = 0

  for (const r of results) {
    if (!r.review) continue
    totalReviewed++
    const sys = r.system ?? 'Unknown'
    if (!bySystem[sys]) bySystem[sys] = { missing: 0, total: 0 }
    bySystem[sys].total++
    if (r.gapCount > 0) bySystem[sys].missing++

    const diff = r.difficulty ?? 'Clinical'
    if (byDifficulty[diff]) {
      byDifficulty[diff].total++
      if (r.gapCount > 0) byDifficulty[diff].missing++
    }

    if (!r.review.hasDangerousMimic) missingMimic++
    if (!r.review.hasCommonAlternative) missingCommon++
    if (!r.review.hasCriteriaFoil) missingFoil++
  }

  // Most commonly suggested additions
  const suggestedMimics = withGaps
    .map(r => r.review.suggestedDangerousMimic)
    .filter(Boolean)
  const suggestedCommon = withGaps
    .map(r => r.review.suggestedCommonAlternative)
    .filter(Boolean)
  const suggestedFoils = withGaps
    .map(r => r.review.suggestedCriteriaFoil)
    .filter(Boolean)

  return {
    totalReviewed,
    casesWithAnyGap: withGaps.length,
    gapRatePct: totalReviewed > 0 ? Math.round((withGaps.length / totalReviewed) * 100) : 0,
    missingDangerousMimic: { count: missingMimic, pct: totalReviewed > 0 ? Math.round((missingMimic / totalReviewed) * 100) : 0 },
    missingCommonAlternative: { count: missingCommon, pct: totalReviewed > 0 ? Math.round((missingCommon / totalReviewed) * 100) : 0 },
    missingCriteriaFoil: { count: missingFoil, pct: totalReviewed > 0 ? Math.round((missingFoil / totalReviewed) * 100) : 0 },
    bySystem,
    byDifficulty,
    topSuggestedMimics: suggestedMimics.slice(0, 10),
    topSuggestedCommon: suggestedCommon.slice(0, 10),
    topSuggestedFoils: suggestedFoils.slice(0, 10),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching cases from Supabase…')
  const cases = await fetchCases()
  console.log(`Loaded ${cases.length} cases`)

  if (noAI) {
    console.log('[--no-ai] Dry run — skipping AI calls')
    const results = cases.map(row => ({
      id: row.id,
      system: row.system,
      difficulty: row.difficulty,
      diagnosis: row.diagnosis,
      differentialCount: (row.case_data?.differentials ?? []).length,
      review: null,
    }))
    fs.writeFileSync(outputPath, JSON.stringify({ cases: results, themes: null }, null, 2))
    console.log(`Wrote ${outputPath}`)
    return
  }

  const pool = makePool(concurrency)
  const results = []
  let done = 0

  await Promise.all(cases.map(row =>
    pool(async () => {
      try {
        const result = await auditCase(row)
        results.push(result)
        done++
        const verdict = result.review?.overallVerdict ?? 'n/a'
        const gaps = result.gapCount ?? 0
        const status = verdict === 'complete' ? '✓' : gaps === 3 ? '✗✗✗' : gaps === 2 ? '✗✗' : '✗'
        console.log(`[${done}/${cases.length}] ${status} ${row.id} (${row.difficulty}) — ${row.diagnosis} — gaps: ${gaps}`)
      } catch (err) {
        console.error(`[error] ${row.id}: ${err.message}`)
        results.push({ id: row.id, system: row.system, difficulty: row.difficulty, diagnosis: row.diagnosis, error: err.message })
      }
    })
  ))

  console.log('\nAggregating themes…')
  const themes = await aggregateThemes(results)

  const report = { generatedAt: new Date().toISOString(), cases: results, themes }
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outputPath}`)

  // Console summary
  console.log('\n══════════════════════════════════════════════════')
  console.log('DIFFERENTIAL COMPLETENESS AUDIT — SUMMARY')
  console.log('══════════════════════════════════════════════════')
  console.log(`Cases reviewed: ${themes.totalReviewed}`)
  console.log(`Cases with ≥1 gap: ${themes.casesWithAnyGap} (${themes.gapRatePct}%)`)
  console.log('')
  console.log(`Missing dangerous mimic:    ${themes.missingDangerousMimic.count} cases (${themes.missingDangerousMimic.pct}%)`)
  console.log(`Missing common alternative: ${themes.missingCommonAlternative.count} cases (${themes.missingCommonAlternative.pct}%)`)
  console.log(`Missing criteria foil:      ${themes.missingCriteriaFoil.count} cases (${themes.missingCriteriaFoil.pct}%)`)
  console.log('')
  console.log('Gap rate by difficulty:')
  for (const [diff, stats] of Object.entries(themes.byDifficulty)) {
    if (stats.total > 0) console.log(`  ${diff}: ${stats.missing}/${stats.total} (${Math.round(stats.missing / stats.total * 100)}%) have gaps`)
  }
  console.log('')
  console.log('Top systems with gaps:')
  const sortedSystems = Object.entries(themes.bySystem)
    .filter(([, s]) => s.total > 0)
    .sort(([, a], [, b]) => (b.missing / b.total) - (a.missing / a.total))
    .slice(0, 6)
  for (const [sys, stats] of sortedSystems) {
    console.log(`  ${sys}: ${stats.missing}/${stats.total} (${Math.round(stats.missing / stats.total * 100)}%)`)
  }
  console.log('')
  console.log('Most-suggested dangerous mimics to add:')
  themes.topSuggestedMimics.forEach(m => console.log(`  · ${m}`))
  console.log('')
  console.log('Most-suggested common alternatives to add:')
  themes.topSuggestedCommon.forEach(m => console.log(`  · ${m}`))
  console.log('\nFull report written to:', outputPath)
}

main().catch(err => { console.error(err); process.exit(1) })

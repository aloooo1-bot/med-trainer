/**
 * Feature-gap audit — runs through a curated sample of cases and asks Claude
 * to identify missing value across three lenses:
 *   A) Case content (clinical educator persona)
 *   B) Trainer features (product designer persona)
 *   C) Workflow friction (UX heuristic — speculative, inferred from case structure)
 *
 * Usage:
 *   node scripts/feature-gap-audit.mjs               # default 12-case sample
 *   node scripts/feature-gap-audit.mjs --no-ai       # dry run — sampling + file only
 *   node scripts/feature-gap-audit.mjs --case-id X   # single specific case
 *   node scripts/feature-gap-audit.mjs --system Cardiovascular
 *   node scripts/feature-gap-audit.mjs --difficulty Clinical
 *   node scripts/feature-gap-audit.mjs --limit 5
 *   node scripts/feature-gap-audit.mjs --concurrency 2
 *   node scripts/feature-gap-audit.mjs --output scripts/my-report.json
 *
 * Sample composition (default 12):
 *   - 3 worst-rated cases with student comments (real pain grounded in ratings)
 *   - 3 highest-complexity cases by lab+imaging count (UX stress candidates)
 *   - 2 per difficulty (Foundations/Clinical/Advanced) from random systems
 *
 * Cost estimate: ~$0.05/case (Sonnet 4.6) → ~$0.60 for 12 cases
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
const concurrency      = parseInt(getArg('--concurrency') ?? '2', 10)
const outputPath       = path.resolve(ROOT, getArg('--output') ?? 'scripts/feature-gap-report.json')
const noAI             = args.includes('--no-ai')

const TARGET_SAMPLE = limitCases > 0 ? limitCases : 12

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Supabase env vars not set in .env.local'); process.exit(1)
}
if (!noAI && !process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY required (or use --no-ai for a dry run)'); process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const anthropic = noAI ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function repairJSON(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let raw = text.slice(start)
  let depth = 0, end = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  try { return JSON.parse(end !== -1 ? raw.slice(0, end + 1) : raw) } catch {
    const safe = raw.lastIndexOf('"}')
    try { return JSON.parse(raw.slice(0, safe + 2) + ']}') } catch { return null }
  }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Supabase fetchers ─────────────────────────────────────────────────────────
async function fetchAllCases() {
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
  return rows
}

async function fetchWorstRatedIds() {
  const { data, error } = await supabase
    .from('ratings')
    .select('case_id, overall, comment')
    .lte('overall', 3)
    .not('comment', 'is', null)
  if (error) { console.warn(`  Ratings fetch failed: ${error.message}`); return [] }
  return (data ?? []).map(r => r.case_id)
}

// ── Sample selection ──────────────────────────────────────────────────────────
function selectSample(allCases, worstRatedIds) {
  if (filterCaseId || limitCases > 0) return allCases.slice(0, TARGET_SAMPLE)

  const byId = Object.fromEntries(allCases.map(c => [c.id, c]))
  const used = new Set()
  const sample = []

  // Bucket 1: worst-rated with student comments (up to 3)
  for (const id of worstRatedIds) {
    if (sample.length >= 3) break
    if (byId[id] && !used.has(id)) { sample.push(byId[id]); used.add(id) }
  }

  // Bucket 2: highest complexity by lab + imaging count (up to 3 more)
  const byComplexity = [...allCases].sort((a, b) => {
    const s = c => (c.case_data?.availableLabs?.length ?? 0) + (c.case_data?.availableImaging?.length ?? 0) * 2
    return s(b) - s(a)
  })
  for (const c of byComplexity) {
    if (sample.length >= 6) break
    if (!used.has(c.id)) { sample.push(c); used.add(c.id) }
  }

  // Bucket 3: 2 per difficulty from random systems
  for (const diff of ['Foundations', 'Clinical', 'Advanced']) {
    const pool = shuffle(allCases.filter(c => c.difficulty === diff && !used.has(c.id)))
    for (let i = 0; i < 2 && i < pool.length; i++) {
      sample.push(pool[i]); used.add(pool[i].id)
    }
  }

  return sample.slice(0, TARGET_SAMPLE)
}

// ── Existing feature catalog (Lens B reads this) ──────────────────────────────
const EXISTING_FEATURES = `
EXISTING TRAINER FEATURES (do NOT suggest these — they already exist):
- Patient chat: natural-language interview panel; student asks the AI patient history questions
- ROS gating: on Clinical/Advanced, each of 13 review-of-systems categories unlocks only when mentioned in chat (AI-classified)
- Per-ROS AI summary: after unlock, each ROS category generates a 1-2 sentence clinical summary
- HPI gating: on Clinical/Advanced, social history, medications, PMH are hidden until asked in chat
- On-demand test ordering: free-text search; Clinical/Advanced students can request any test and get an AI-generated result
- Autocomplete diagnosis input: backed by hundreds of diagnoses
- Notes panel: toggleable free-form or SOAP template
- Timer: 22 min (Clinical), 15 min (Advanced); auto-submits on expiry
- Pause overlay: full-screen pause with resume
- Terminal: command-line interface for the full case workflow (help/hpi/order/diagnose/etc.)
- Speech input: mic button on diagnosis, reasoning, oral presentation, and chat composer
- Image zoom: lightbox for ECG, imaging, and special modality images
- Help modal: context-sensitive per-section help with "?" button
- Vitals strip: always-visible at top with abnormal-value highlighting and BMI auto-calc
- Score breakdown: 5 grading dimensions (history interview, test ordering, diagnosis accuracy, completeness, clinical reasoning)
- Oral presentation grading (Advanced): 4 axes (accuracy, completeness, conciseness, safety) + critical misses list
- Teaching points: 4 clinical pearls shown post-grading
- Differential discussion: all differentials with explanations, shown post-grading
- Missed key questions: shown post-grading
- Feedback widget: 5-star rating on 5 dimensions + free-text comment
- Case history: browse all past cases (local + cloud) with full scorecard re-render
- Difficulty gating (free tier): 2 cases/day, system + difficulty locked for non-pro
- Biopsy gating: pathology/biopsy results hidden until after diagnosis submitted
`.trim()

// ── Lens A: content gaps ──────────────────────────────────────────────────────
async function lensA_contentGaps(caseRow) {
  const cd = caseRow.case_data
  const payload = {
    system: caseRow.system, difficulty: caseRow.difficulty, diagnosis: caseRow.diagnosis,
    hpi: cd.hpi, clinicalHpi: cd.clinicalHpi, advancedHpi: cd.advancedHpi,
    vitals: cd.vitals,
    physicalExam: cd.physicalExam,
    reviewOfSystems: cd.reviewOfSystems,
    hiddenHistory: cd.hiddenHistory,
    availableLabs: cd.availableLabs,
    availableImaging: cd.availableImaging,
    expectedLabs: cd.expectedLabs,
    expectedImaging: cd.expectedImaging,
    differentials: cd.differentials,
    differentialExplanations: cd.differentialExplanations,
    teachingPoints: cd.teachingPoints,
    keyQuestions: cd.keyQuestions,
  }

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: `You are a clinical medical educator reviewing cases for a digital medical training platform.
Identify content gaps — things that are weak, missing, or suboptimal from a teaching perspective.
Be specific and actionable. Focus on what actually limits educational value.
Return ONLY a JSON object in this exact format:
{"contentGaps":[{"severity":"high|medium|low","area":"teaching points|vitals|differentials|physical exam|ROS|lab selection|imaging|key questions|hpi clarity|other","suggestion":"one specific actionable sentence"}]}
Maximum 5 gaps. No prose outside the JSON.`,
    messages: [{
      role: 'user',
      content: `Review this ${caseRow.difficulty} ${caseRow.system} case (diagnosis: ${caseRow.diagnosis}) for content gaps:\n${JSON.stringify(payload, null, 2)}`,
    }],
  })
  return repairJSON(res.content[0].text) ?? { contentGaps: [] }
}

// ── Lens B: trainer feature gaps ──────────────────────────────────────────────
async function lensB_featureGaps(caseRow) {
  const cd = caseRow.case_data
  const profile = {
    system: caseRow.system, difficulty: caseRow.difficulty, diagnosis: caseRow.diagnosis,
    labCount: cd.availableLabs?.length ?? 0,
    imagingCount: cd.availableImaging?.length ?? 0,
    hasECG: !!(cd.ecgFindings),
    hasBiopsy: !!(cd.biopsyFindings),
    hasDerm: !!(cd.skinFindings),
    hasFundus: !!(cd.fundusFindings),
    hasHematology: !!(cd.hematologyFindings),
    hasUrine: !!(cd.urineFindings),
    teachingPointCount: cd.teachingPoints?.length ?? 0,
    differentialCount: cd.differentials?.length ?? 0,
    keyQuestionCount: cd.keyQuestions?.length ?? 0,
    hasRelevantTests: !!(cd.relevantTests?.length),
  }

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: `You are a product designer reviewing cases for a digital medical education platform.
Given the case profile and the existing feature list below, suggest NEW features that don't exist yet but would make this type of case more valuable for learners.
${EXISTING_FEATURES}

Return ONLY a JSON object in this exact format:
{"featureSuggestions":[{"name":"short feature name","rationale":"why this case needs it","caseEvidence":"what specific case characteristic triggered this idea"}]}
Maximum 4 suggestions. Only suggest features NOT already in the existing list. No prose outside the JSON.`,
    messages: [{
      role: 'user',
      content: `What trainer features are missing that would add learning value to this ${caseRow.difficulty} ${caseRow.system} case?\n${JSON.stringify(profile, null, 2)}`,
    }],
  })
  return repairJSON(res.content[0].text) ?? { featureSuggestions: [] }
}

// ── Lens C: workflow friction (speculative) ───────────────────────────────────
async function lensC_frictionGuesses(caseRow) {
  const cd = caseRow.case_data
  const profile = {
    difficulty: caseRow.difficulty, system: caseRow.system, diagnosis: caseRow.diagnosis,
    labCount: cd.availableLabs?.length ?? 0,
    imagingCount: cd.availableImaging?.length ?? 0,
    labGroupCount: cd.labGroups?.length ?? 0,
    hasECG: !!(cd.ecgFindings),
    hasBiopsy: !!(cd.biopsyFindings),
    hasSpecialImages: !!(cd.skinFindings || cd.fundusFindings || cd.hematologyFindings || cd.urineFindings),
    timerMinutes: caseRow.difficulty === 'Advanced' ? 15 : caseRow.difficulty === 'Clinical' ? 22 : null,
    rosCategories: Object.keys(cd.reviewOfSystems ?? {}).length,
    differentialCount: cd.differentials?.length ?? 0,
  }

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: `You are a UX researcher analyzing a digital medical education trainer.
Based on the case's structural profile, predict where a medical student is most likely to experience friction or confusion.
You are working from structure only, not direct observation — reflect that in your confidence ratings.
Return ONLY a JSON object in this exact format:
{"frictionGuesses":[{"moment":"where in the workflow (e.g. ordering labs, reading imaging, ROS unlock, diagnosis submission)","reason":"why this specific case structure creates friction","confidence":"high|medium|low"}]}
Maximum 3 guesses. Focus on case-specific structure — avoid generic UX advice. No prose outside the JSON.`,
    messages: [{
      role: 'user',
      content: `Predict workflow friction points for this ${caseRow.difficulty} ${caseRow.system} case:\n${JSON.stringify(profile, null, 2)}`,
    }],
  })
  return repairJSON(res.content[0].text) ?? { frictionGuesses: [] }
}

// ── Aggregation ───────────────────────────────────────────────────────────────
async function aggregateThemes(perCaseResults) {
  const condensed = perCaseResults.map(r => ({
    id: r.id, system: r.system, difficulty: r.difficulty, diagnosis: r.diagnosis,
    contentGaps: r.lensA?.contentGaps ?? [],
    featureSuggestions: r.lensB?.featureSuggestions ?? [],
    frictionGuesses: r.lensC?.frictionGuesses ?? [],
  }))

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system: `You are a medical education product analyst. Cluster per-case audit results into cross-cutting themes — patterns that appear across multiple cases.
A single-case finding is only worth including if it is high-severity.
Return ONLY a JSON object in this exact format:
{"themes":[{"lens":"content|feature|workflow","theme":"short pattern name","affectedCases":["id1","id2"],"frequency":"N of M cases","suggestedAction":"one specific next step"}]}
Order by frequency descending. Maximum 10 themes. No prose outside the JSON.`,
    messages: [{
      role: 'user',
      content: `Synthesize cross-cutting themes from ${perCaseResults.length} case audits:\n${JSON.stringify(condensed, null, 2)}`,
    }],
  })
  return repairJSON(res.content[0].text) ?? { themes: [] }
}

// ── Concurrency runner ────────────────────────────────────────────────────────
async function runWithConcurrency(items, fn, limit) {
  const results = new Array(items.length)
  const queue = items.map((item, idx) => ({ item, idx }))
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const { item, idx } = queue.shift()
      results[idx] = await fn(item)
    }
  })
  await Promise.all(workers)
  return results
}

// ── Per-case review ───────────────────────────────────────────────────────────
async function reviewCase(caseRow) {
  const label = `[${caseRow.difficulty}] ${caseRow.system} — ${caseRow.diagnosis}`
  process.stdout.write(`  → ${label}... `)

  try {
    const [lensA, lensB, lensC] = await Promise.all([
      lensA_contentGaps(caseRow),
      lensB_featureGaps(caseRow),
      lensC_frictionGuesses(caseRow),
    ])
    const total = (lensA?.contentGaps?.length ?? 0) + (lensB?.featureSuggestions?.length ?? 0) + (lensC?.frictionGuesses?.length ?? 0)
    console.log(`${total} findings`)
    return { id: caseRow.id, system: caseRow.system, difficulty: caseRow.difficulty, diagnosis: caseRow.diagnosis, lensA, lensB, lensC }
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
    return { id: caseRow.id, system: caseRow.system, difficulty: caseRow.difficulty, diagnosis: caseRow.diagnosis, lensA: null, lensB: null, lensC: null, error: err.message }
  }
}

// ── Console summary ───────────────────────────────────────────────────────────
function printSummary(perCase, aggregation) {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('FEATURE GAP AUDIT — PER-CASE FINDINGS')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('NOTE: Lens C (workflow) findings are speculative — inferred from')
  console.log('case structure, not real UX observation. Treat as hypotheses.\n')

  for (const r of perCase) {
    if (r.error) {
      console.log(`\n✗ [${r.difficulty}] ${r.system} — ${r.diagnosis}\n  Error: ${r.error}`)
      continue
    }
    console.log(`\n● [${r.difficulty}] ${r.system} — ${r.diagnosis}`)
    for (const g of r.lensA?.contentGaps ?? []) {
      console.log(`  [content/${g.severity}] ${g.area}: ${g.suggestion}`)
    }
    for (const f of r.lensB?.featureSuggestions ?? []) {
      console.log(`  [feature] ${f.name}: ${f.rationale}`)
    }
    for (const w of r.lensC?.frictionGuesses ?? []) {
      console.log(`  [friction/${w.confidence}?] ${w.moment}: ${w.reason}`)
    }
  }

  const themes = aggregation?.themes ?? []
  if (themes.length) {
    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('CROSS-CUTTING THEMES (ordered by frequency)')
    console.log('═══════════════════════════════════════════════════════════════\n')
    for (const t of themes) {
      console.log(`[${t.lens}] ${t.theme}  (${t.frequency})`)
      console.log(`  Cases: ${(t.affectedCases ?? []).join(', ')}`)
      console.log(`  Action: ${t.suggestedAction}\n`)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('MedTrainer Feature Gap Audit')
  console.log(`Mode: ${noAI ? 'dry run (--no-ai)' : 'full AI review'} | concurrency: ${concurrency}\n`)

  process.stdout.write('Fetching cases from Supabase... ')
  const allCases = await fetchAllCases()
  console.log(`${allCases.length} cases`)

  let worstRatedIds = []
  if (!filterCaseId && limitCases === 0 && !noAI) {
    process.stdout.write('Fetching low-rated cases with comments... ')
    worstRatedIds = await fetchWorstRatedIds()
    console.log(`${worstRatedIds.length} found`)
  }

  const sample = selectSample(allCases, worstRatedIds)
  console.log(`\nSample: ${sample.length} cases`)
  for (const c of sample) {
    console.log(`  ${c.difficulty.padEnd(12)} ${c.system.padEnd(35)} ${c.diagnosis}`)
  }

  if (noAI) {
    const output = {
      generatedAt: new Date().toISOString(), mode: 'dry-run',
      sample: sample.map(c => ({ id: c.id, system: c.system, difficulty: c.difficulty, diagnosis: c.diagnosis })),
      perCase: [], aggregation: { themes: [] },
    }
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
    console.log(`\nDry run complete. Sample written to ${outputPath}`)
    return
  }

  console.log(`\nRunning 3-lens AI review...`)
  const perCase = await runWithConcurrency(sample, reviewCase, concurrency)

  process.stdout.write('\nAggregating cross-cutting themes... ')
  const validResults = perCase.filter(r => !r.error)
  let aggregation = { themes: [] }
  if (validResults.length > 0) {
    try {
      aggregation = await aggregateThemes(validResults)
      console.log(`${aggregation.themes?.length ?? 0} themes`)
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
    }
  }

  printSummary(perCase, aggregation)

  const output = {
    generatedAt: new Date().toISOString(),
    sampleSize: sample.length,
    perCase,
    aggregation,
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`\nFull report saved to ${outputPath}`)
}

main().catch(err => { console.error(err); process.exit(1) })

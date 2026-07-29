/**
 * Batch case library filler — generates cases directly into Supabase.
 *
 * This script mirrors the exact prompt used in app/page.tsx (generateCase).
 * If the prompt in page.tsx changes, update the constants here too.
 *
 * Usage:
 *   node scripts/fill-library.mjs
 *   node scripts/fill-library.mjs --system Cardiovascular
 *   node scripts/fill-library.mjs --system Cardiovascular --difficulty Foundations
 *   node scripts/fill-library.mjs --variant 0          # only variant 0 (default: all)
 *   node scripts/fill-library.mjs --concurrency 3      # parallel API calls (default: 3)
 *   node scripts/fill-library.mjs --force              # regenerate even if already generated
 *   node scripts/fill-library.mjs --dry-run            # print what would be generated
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { MANIFEST, VARIANT_SEEDS } from './case-manifest.mjs'
import { buildCasePrompt, buildCaseSystemPrompt } from '../app/lib/casePrompt.ts'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Load .env.local ───────────────────────────────────────────────────────────
config({ path: path.join(ROOT, '.env.local') })

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set in .env.local or environment.')
  process.exit(1)
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.')
  process.exit(1)
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : null
}
const filterSystem = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const filterVariant = getArg('--variant') !== null ? parseInt(getArg('--variant'), 10) : null
const filterIds = getArg('--ids') ? new Set(getArg('--ids').split(',').map(s => s.trim())) : null
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const concurrency = parseInt(getArg('--concurrency') ?? '3', 10)

// ── Clients ───────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── ID helpers ────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function makeCaseId(system, difficulty, diagnosis, variantIndex) {
  return `${slugify(system)}-${slugify(difficulty)}-${slugify(diagnosis)}-${variantIndex}`
}

// ── Prompts ───────────────────────────────────────────────────────────────────
// Canonical source: app/lib/casePrompt.ts (imported above). This script used to
// carry its own copy of SYSTEM_PROMPT / DIFFICULTY_RULES / JSON_SCHEMA /
// CRITICAL_RULES, which silently drifted out of sync with the live generator and
// lost 7 quality rules. Never re-inline them here.

// ── History reconciliation ────────────────────────────────────────────────────
// Detects contradictions between pastMedicalHistory (visible to student) and
// hiddenHistory.fullHistory, then patches PMH to be consistent.
// A contradiction exists when PMH denies a surgery/hospitalization but
// hiddenHistory reveals one that happened before the current admission.
const SURG_DENIAL      = /\b(none|no prior|no past|no surgical|no history of surgery|denies.{0,10}surgery|has not had any)\b/i
const SURG_MENTION     = /\b(surgery|surgeries|surgical|appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|bypass|repair|resection|transplant|excision|\w+ectomy|\w+otomy|\w+ostomy|\w+plasty)\b/i
const HOSP_DENIAL      = /\b(none|no prior|no past|never been hospitalized|no hospitalizations|denies.{0,10}hospitalization)\b/i
const HOSP_MENTION     = /\b(hospitali[sz]|admitted to.{0,20}hospital|inpatient stay|ICU admission|intensive care unit admission)\b/i
// Named procedures — their presence in PMH means it already has real history (not a pure denial)
const NAMED_PROCEDURE  = /\b(appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|arthroscopy|c-section|cesarean|bypass|transplant|nephrectomy|splenectomy|thyroidectomy|laminectomy|craniotomy|laparotomy|laparoscopy|ORIF|tonsillectomy|herniorrhaphy|hernia repair|thrombectomy|endarterectomy|angioplasty|pacemaker|amputation)\b/i
// Mentions that refer to the CURRENT admission, not prior history
const CURRENT_OP       = /\b(this admission|current (admission|hospitalization|presentation|episode|injury|surgery)|on arrival|emergent(ly)?|urgent(ly)?|was brought|following the (trauma|injury|accident)|for the current|perioperative|pre-?operatively|post-?operatively|post-?surgery|status post.*this)\b/i
// Mentions that are future/planned, not past
const FUTURE_OP        = /\b(may require|might need|could require|planned|will undergo|referral for|considering|surgical candidate|recommended for surgery|potential surgery|surgical option)\b/i
// Sentences in hiddenHistory that themselves deny surgery/hospitalization (not genuine contradictions)
const SURG_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(surgery|surgeries|surgical|procedure|procedures|operation|operations|fasciotomy|splenectomy|appendectomy|cholecystectomy)\b/i
const HOSP_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(hospitalization|hospitalizations|hospitalized|inpatient|admitted)\b/i
// Natural pathological processes that match \w+ectomy but are not surgical procedures
const AUTO_PROCEDURE   = /\bautosplenectomy\b/i

function reconcileHistoryConsistency(caseData) {
  const pmh    = caseData.pastMedicalHistory
  const hidden = caseData.hiddenHistory
  if (!pmh || !hidden?.fullHistory) return caseData

  const full = hidden.fullHistory
  const sentences = full.split(/(?<=[.!?])\s+/)

  let updated = false
  const newPmh = { ...pmh }

  // Surgery reconciliation — only when PMH is a pure denial (no named procedures already listed)
  if (SURG_DENIAL.test(pmh.surgeries ?? '') && !NAMED_PROCEDURE.test(pmh.surgeries ?? '') && SURG_MENTION.test(full)) {
    const historical = sentences.filter(s =>
      SURG_MENTION.test(s) &&
      !CURRENT_OP.test(s) &&
      !FUTURE_OP.test(s) &&
      !SURG_SENT_DENIAL.test(s) &&
      !AUTO_PROCEDURE.test(s)
    )
    if (historical.length > 0) {
      newPmh.surgeries = historical.map(s => s.trim().replace(/[.!?]+$/, '')).join('; ')
      updated = true
    }
  }

  // Hospitalization reconciliation — only when PMH doesn't already mention a hospitalization
  if (HOSP_DENIAL.test(pmh.hospitalizations ?? '') && !HOSP_MENTION.test(pmh.hospitalizations ?? '') && HOSP_MENTION.test(full)) {
    const historical = sentences.filter(s =>
      HOSP_MENTION.test(s) &&
      !CURRENT_OP.test(s) &&
      !FUTURE_OP.test(s) &&
      !HOSP_SENT_DENIAL.test(s)
    )
    if (historical.length > 0) {
      newPmh.hospitalizations = historical.map(s => s.trim().replace(/[.!?]+$/, '')).join('; ')
      updated = true
    }
  }

  return updated ? { ...caseData, pastMedicalHistory: newPmh } : caseData
}

function buildPrompt(system, diagnosis, nativeDifficulty, variantIndex) {
  const variantSeed = variantIndex > 0 ? VARIANT_SEEDS[variantIndex] : null
  return buildCasePrompt(system, nativeDifficulty, diagnosis, variantSeed)
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function getGeneratedIds() {
  const generated = new Set()
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('id')
      .eq('is_generated', true)
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Supabase query failed: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) generated.add(row.id)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return generated
}

async function saveToSupabase(id, system, difficulty, diagnosis, variantIndex, caseData) {
  // Write both the legacy blob and the tiered columns (see supabase/migrations/0001).
  const { splitCase } = await import('../app/lib/server/caseTiers.mjs')
  const tiers = splitCase(caseData)
  const { error } = await supabase
    .from('cases')
    .upsert({
      id,
      system,
      difficulty,
      diagnosis,
      variant_index: variantIndex,
      case_data: caseData,
      presentation_data: tiers.presentation,
      patient_knowledge: tiers.patientKnowledge,
      clinical_findings: tiers.clinicalFindings,
      ground_truth: tiers.groundTruth,
      is_generated: true,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
}

// ── JSON repair ───────────────────────────────────────────────────────────────
function repairJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Claude response')
  let json = match[0]

  // Fix missing opening quote on string component fields.
  // Pattern: "key": unquoted-value" → "key": "unquoted-value"
  // The captured group already includes the closing quote, so we only prepend ".
  json = json.replace(
    /"(unit|value|referenceRange|status)":\s+([^",{\[\s\n][^,\n}\]]*")/g,
    '"$1": "$2'
  )

  // Fix trailing commas before ] or }
  json = json.replace(/,(\s*[}\]])/g, '$1')

  return json
}

// ── Generation ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function generateCase(system, difficulty, diagnosis, variantIndex) {
  const MAX_RETRIES = 3
  let lastError

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const isRateLimit = lastError?.message?.includes('429')
      const delay = isRateLimit ? 65_000 : 2 ** attempt * 2_000
      if (isRateLimit) process.stdout.write('\n  Rate limited — waiting 65s…\n')
      else process.stdout.write(`\n  Retry ${attempt}/${MAX_RETRIES} (${lastError?.message?.slice(0, 50)})…\n`)
      await sleep(delay)
    }

    try {
      const prompt = buildPrompt(system, diagnosis, difficulty, variantIndex)
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 12000,
        system: buildCaseSystemPrompt(null),
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content[0]?.text ?? ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in Claude response')

      // Try direct parse, then repair on failure
      let parsed
      try {
        parsed = JSON.parse(match[0])
      } catch {
        parsed = JSON.parse(repairJson(text))
      }

      parsed.nativeDifficulty = difficulty

      // Merge relevantTests into the available lists (mirrors page.tsx logic)
      if (Array.isArray(parsed.relevantTests)) {
        for (const rt of parsed.relevantTests) {
          if (!rt.name) continue
          if (rt.isImaging && rt.imagingResult) {
            if (!parsed.imagingResults) parsed.imagingResults = {}
            parsed.imagingResults[rt.name] = rt.imagingResult
            if (!parsed.availableImaging) parsed.availableImaging = []
            if (!parsed.availableImaging.includes(rt.name)) parsed.availableImaging.push(rt.name)
          } else if (!rt.isImaging && rt.labResult) {
            if (!parsed.labResults) parsed.labResults = {}
            parsed.labResults[rt.name] = rt.labResult
            if (!parsed.availableLabs) parsed.availableLabs = []
            if (!parsed.availableLabs.includes(rt.name)) parsed.availableLabs.push(rt.name)
          }
        }
      }

      return reconcileHistoryConsistency(parsed)
    } catch (e) {
      lastError = e
    }
  }

  throw lastError
}

// ── Semaphore ─────────────────────────────────────────────────────────────────
function makeSemaphore(limit) {
  let running = 0
  const queue = []
  function next() {
    if (running >= limit || queue.length === 0) return
    running++
    const { fn, resolve, reject } = queue.shift()
    fn().then(v => { running--; resolve(v); next() }).catch(e => { running--; reject(e); next() })
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Build the work list
  const variants = filterVariant !== null ? [filterVariant] : VARIANT_SEEDS.map((_, i) => i)
  const work = []

  for (const [system, byDiff] of Object.entries(MANIFEST)) {
    if (filterSystem && system !== filterSystem) continue
    for (const [difficulty, diagnoses] of Object.entries(byDiff)) {
      if (filterDifficulty && difficulty !== filterDifficulty) continue
      for (const diagnosis of diagnoses) {
        for (const vi of variants) {
          work.push({ system, difficulty, diagnosis, variantIndex: vi, id: makeCaseId(system, difficulty, diagnosis, vi) })
        }
      }
    }
  }

  // Filter out already-generated cases. This runs BEFORE the dry-run report so
  // --dry-run shows the true remaining work (and therefore the real API cost),
  // not every slot in the manifest.
  console.log('Checking Supabase for existing generated cases…')
  let generatedIds
  try {
    generatedIds = await getGeneratedIds()
  } catch (e) {
    if (dryRun) {
      console.warn(`Could not reach Supabase (${e.message}) — dry run will not filter existing cases.`)
      generatedIds = new Set()
    } else {
      console.error('Failed to query Supabase:', e.message)
      process.exit(1)
    }
  }

  if (dryRun) {
    const pending = (force ? work : work.filter(w => !generatedIds.has(w.id)))
      .filter(w => !filterIds || filterIds.has(w.id))
    console.log(`Dry run — ${work.length} slot(s) in scope, ${work.length - pending.length} already generated.`)
    console.log(`Would generate ${pending.length} case(s)${pending.length ? ':' : '.'}`)
    for (const { id } of pending) console.log(`  ${id}`)
    return
  }

  const todo = (force ? work : work.filter(w => !generatedIds.has(w.id)))
    .filter(w => !filterIds || filterIds.has(w.id))
  const skipped = work.length - todo.length

  if (todo.length === 0) {
    console.log(`All ${work.length} cases already generated. Use --force to regenerate.`)
    return
  }

  console.log(`${todo.length} to generate, ${skipped} already done. Concurrency: ${concurrency}\n`)

  const sem = makeSemaphore(concurrency)
  let done = 0
  let failed = 0
  const failures = []

  await Promise.all(todo.map(item => sem(async () => {
    const label = `[${item.system} / ${item.difficulty} / v${item.variantIndex}] ${item.diagnosis}`
    try {
      const caseData = await generateCase(item.system, item.difficulty, item.diagnosis, item.variantIndex)
      await saveToSupabase(item.id, item.system, item.difficulty, item.diagnosis, item.variantIndex, caseData)
      done++
      process.stdout.write(`\r✓ ${done}/${todo.length} — ${label.slice(0, 80).padEnd(80)}`)
    } catch (e) {
      failed++
      failures.push({ id: item.id, error: e.message })
      process.stdout.write(`\n✗ FAILED ${label}: ${e.message}\n`)
    }
  })))

  console.log(`\n\nDone. ${done} generated, ${failed} failed.`)

  if (failures.length > 0) {
    console.log('\nFailed cases:')
    for (const f of failures) console.log(`  ${f.id}: ${f.error}`)
  }

  // claude-sonnet-4-6: $3/M input, $15/M output — rough 4K in / 8K out per case
  const estimatedCost = done * ((4000 * 3 + 8000 * 15) / 1_000_000)
  console.log(`\nEstimated API cost: ~$${estimatedCost.toFixed(2)} (rough estimate — actual output tokens vary)`)
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * Fix issues identified by qa-agent static audit (scripts/qa-report.json).
 *
 * Three fix types, applied in one pass:
 *   native   — missing nativeDifficulty field (img- cases): set from row.difficulty
 *   exam     — physicalExam fields with diagnostic interpretations: Claude Haiku strips them
 *   history  — pastMedicalHistory contradicts hiddenHistory: Claude Sonnet resolves them
 *
 * Usage:
 *   node scripts/fix-qa-issues.mjs                  # fix everything in qa-report.json
 *   node scripts/fix-qa-issues.mjs --dry-run        # preview without writing to Supabase
 *   node scripts/fix-qa-issues.mjs --type native    # only nativeDifficulty fixes
 *   node scripts/fix-qa-issues.mjs --type exam      # only physicalExam fixes
 *   node scripts/fix-qa-issues.mjs --type history   # only history contradiction fixes
 *   node scripts/fix-qa-issues.mjs --case-id xxx    # fix one specific case
 *   node scripts/fix-qa-issues.mjs --concurrency 3
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const dryRun      = args.includes('--dry-run')
const typeFilter  = getArg('--type')   // 'native' | 'exam' | 'history' | null (all)
const caseFilter  = getArg('--case-id')
const concurrency = parseInt(getArg('--concurrency') ?? '3', 10)
const reportPath  = path.resolve(ROOT, getArg('--report') ?? 'scripts/qa-report.json')

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

// ── Load report ───────────────────────────────────────────────────────────────
if (!fs.existsSync(reportPath)) {
  console.error(`qa-report.json not found at ${reportPath}\nRun: node scripts/qa-agent.mjs first.`)
  process.exit(1)
}
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

// ── Classify flags ─────────────────────────────────────────────────────────────
function classifyFlags(flags) {
  const native  = flags.some(f => f.startsWith('Missing: nativeDifficulty'))
  const exam    = flags.some(f => f.startsWith('physicalExam.'))
  const history = flags.some(f => f.startsWith('History contradiction:'))
  return { native, exam, history }
}

function shouldFix(type) {
  return !typeFilter || typeFilter === type
}

// ── Identify cases to fix ─────────────────────────────────────────────────────
let toFix = report.filter(r => r.staticFlags.length > 0)
if (caseFilter) toFix = toFix.filter(r => r.id === caseFilter)
if (!toFix.length) { console.log('No flagged cases found.'); process.exit(0) }

// ── Fetch full case data from Supabase ────────────────────────────────────────
async function fetchCase(id) {
  const { data, error } = await supabase
    .from('cases')
    .select('id, system, difficulty, diagnosis, case_data')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Supabase fetch ${id}: ${error.message}`)
  return data
}

// ── Fix: nativeDifficulty ─────────────────────────────────────────────────────
function fixNativeDifficulty(caseData, difficulty) {
  return { ...caseData, nativeDifficulty: difficulty }
}

// ── Fix: physicalExam diagnostic interpretations ──────────────────────────────
// Regions to skip entirely (always objective, never diagnostic)
const SKIP_EXAM_PHRASES = [
  'No rashes, lesions, or signs of trauma',
  'no signs of trauma',
  'no signs of cyanosis',
  'no signs of respiratory distress',
]

async function fixExamField(caseId, region, fullText) {
  // Skip known false-positive patterns
  const lc = fullText.toLowerCase()
  if (SKIP_EXAM_PHRASES.some(p => lc.includes(p.toLowerCase()))) {
    return null // no fix needed
  }

  const prompt = `A medical education case's physical exam field contains diagnostic interpretation language instead of pure objective findings. Your job is to clean it.

FIELD: physicalExam.${region}
CASE: ${caseId}
CURRENT TEXT:
${fullText}

RULES:
1. Keep ALL objective observations: what can be directly seen, heard, measured, or felt (sounds, sizes, locations, colors, textures, timing, rhythm, temperature, moisture, movement, reflexes, strength, visual acuity measurements, etc.)
2. Remove interpretive phrases that link findings to a diagnosis:
   - "consistent with [disease/condition]"
   - "suggesting [condition]"
   - "indicating [condition]"
   - "secondary to [disease]" → describe just the finding
   - "due to [disease]" → describe just the finding
   - "in keeping with [condition]"
   - "pattern of [condition]"
3. KEEP named clinical signs that ARE the objective finding (e.g., "Gottron's papules", "heliotrope discoloration", "Murphy's sign positive", "Kernig's sign positive") — these are finding names, not interpretations
4. KEEP mentions of known stated diagnoses in the history when they are providing neutral context (e.g., "known Hashimoto's thyroiditis" is context if the patient has that diagnosis; remove "consistent with Hashimoto's" because that IS the interpretation)
5. If a sentence becomes fragmented after removing the interpretation, restructure it to be grammatically complete and clinically accurate
6. Do NOT change objective values (measurements, grades, rates, percentages)
7. Return ONLY the corrected text for this one field — no JSON, no explanation, no quotes

If the current text does NOT actually contain a diagnostic interpretation (false positive), return exactly: NOCHANGE`

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })
  const result = resp.content[0]?.text?.trim() ?? ''
  if (result === 'NOCHANGE' || result === fullText.trim()) return null
  return result
}

async function fixPhysicalExam(row, caseData, examFlags) {
  let physicalExam = { ...caseData.physicalExam }
  let changed = false

  for (const flag of examFlags) {
    // Extract region from flag like "physicalExam.Neck: diagnostic interpretation — "..."
    const match = flag.match(/^physicalExam\.([^:]+):/)
    if (!match) continue
    const region = match[1]
    const fullText = physicalExam[region]
    if (!fullText) continue

    const fixed = await fixExamField(row.id, region, fullText)
    if (fixed && fixed !== fullText) {
      physicalExam[region] = fixed
      changed = true
    }
  }

  return changed ? { ...caseData, physicalExam } : null
}

// ── Fix: history contradiction ────────────────────────────────────────────────
async function fixHistoryContradiction(row, caseData, historyFlags) {
  const pmh = caseData.pastMedicalHistory ?? {}
  const hidden = caseData.hiddenHistory ?? {}

  const flagDescriptions = historyFlags.join('\n')

  const prompt = `A medical education case has a consistency bug between the patient's visible past medical history and their hidden history.

CASE: ${row.id}
DIAGNOSIS: ${row.diagnosis}
SYSTEM: ${row.system}
DIFFICULTY: ${row.difficulty}

FLAGS DETECTED:
${flagDescriptions}

CURRENT pastMedicalHistory:
${JSON.stringify(pmh, null, 2)}

CURRENT hiddenHistory:
${JSON.stringify(hidden, null, 2)}

TASK: Fix the contradiction so the two sections are fully consistent. Apply this logic:

1. If the surgery/hospitalization mentioned in hiddenHistory.fullHistory refers to a PRIOR historical event (before this current presentation), then:
   - Move it into pastMedicalHistory so it is no longer hidden (it should have been visible to begin with)
   - Make sure pastMedicalHistory.surgeries or .hospitalizations accurately reflects it
   - Update hiddenHistory.fullHistory to remove or reconcile any contradicting "None/no prior" language

2. If the surgery/hospitalization in hiddenHistory.fullHistory refers to the CURRENT presentation (e.g., "underwent emergent laparotomy for current injury", "ORIF performed during this admission"), then:
   - pastMedicalHistory.surgeries saying "None" or "no prior surgeries" is CORRECT
   - Remove or reword the hiddenHistory.fullHistory text so it does NOT read as a prior surgical history — it should clearly refer to the current event only
   - This is NOT a prior surgery so it does not belong in surgical history

3. For the respiratory-foundations-acute-asthma-exacerbation case: if the same hospitalization appears in both pastMedicalHistory.hospitalizations and hiddenHistory.fullHistory, that is NOT a contradiction — they are consistent. Return NOFIX.

Return ONLY valid JSON with the corrected fields that need updating:
{
  "pastMedicalHistory": { <full object with fixes applied> },
  "hiddenHistory": { <full object with fixes applied> }
}

If no fix is needed (false positive), return exactly: NOFIX`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = resp.content[0]?.text?.trim() ?? ''

  if (text === 'NOFIX') return null

  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    const fixes = JSON.parse(match[0])
    let updated = { ...caseData }
    if (fixes.pastMedicalHistory) updated.pastMedicalHistory = fixes.pastMedicalHistory
    if (fixes.hiddenHistory)      updated.hiddenHistory      = fixes.hiddenHistory
    return updated
  } catch {
    return null
  }
}

// ── Supabase write ─────────────────────────────────────────────────────────────
async function updateCase(id, caseData) {
  if (dryRun) return
  const { error } = await supabase
    .from('cases')
    .update({ case_data: caseData })
    .eq('id', id)
  if (error) throw new Error(`Supabase update ${id}: ${error.message}`)
}

// ── Semaphore ─────────────────────────────────────────────────────────────────
function makeSemaphore(limit) {
  let running = 0; const queue = []
  function next() {
    if (running >= limit || !queue.length) return
    running++
    const { fn, resolve, reject } = queue.shift()
    fn().then(v => { running--; resolve(v); next() }).catch(e => { running--; reject(e); next() })
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const mode = dryRun ? '[DRY RUN] ' : ''
  console.log(`${mode}Fixing ${toFix.length} flagged cases (type=${typeFilter ?? 'all'}, concurrency=${concurrency})`)
  if (dryRun) console.log('DRY RUN — no Supabase writes will happen\n')

  const sem = makeSemaphore(concurrency)
  const results = { fixed: 0, skipped: 0, errors: 0, falsePositives: 0 }

  await Promise.all(toFix.map(reportEntry => sem(async () => {
    const { id, difficulty, staticFlags } = reportEntry
    const { native: needsNative, exam: needsExam, history: needsHistory } = classifyFlags(staticFlags)

    try {
      const row = await fetchCase(id)
      let caseData = row.case_data
      let changed = false

      // ── Fix 1: nativeDifficulty ──────────────────────────────────────────
      if (needsNative && shouldFix('native')) {
        caseData = fixNativeDifficulty(caseData, row.difficulty)
        changed = true
        console.log(`  [native] ${id} → nativeDifficulty = "${row.difficulty}"`)
      }

      // ── Fix 2: physicalExam ──────────────────────────────────────────────
      if (needsExam && shouldFix('exam')) {
        const examFlags = staticFlags.filter(f => f.startsWith('physicalExam.'))
        const fixed = await fixPhysicalExam(row, caseData, examFlags)
        if (fixed) {
          caseData = fixed
          changed = true
          const regions = examFlags.map(f => f.match(/physicalExam\.([^:]+)/)?.[1]).filter(Boolean)
          console.log(`  [exam]   ${id} → fixed physicalExam.${regions.join(', ')}`)
        } else {
          results.falsePositives++
          console.log(`  [exam]   ${id} → no change (false positive or already clean)`)
        }
      }

      // ── Fix 3: history contradiction ─────────────────────────────────────
      if (needsHistory && shouldFix('history')) {
        const historyFlags = staticFlags.filter(f => f.startsWith('History contradiction:'))
        const fixed = await fixHistoryContradiction(row, caseData, historyFlags)
        if (fixed) {
          caseData = fixed
          changed = true
          console.log(`  [history] ${id} → resolved history contradiction`)
        } else {
          results.falsePositives++
          console.log(`  [history] ${id} → NOFIX (false positive or same event)`)
        }
      }

      // ── Write to Supabase ────────────────────────────────────────────────
      if (changed) {
        await updateCase(id, caseData)
        results.fixed++
      } else {
        results.skipped++
      }

    } catch (e) {
      console.error(`  [error]  ${id}: ${e.message}`)
      results.errors++
    }
  })))

  console.log('\n══════════════════════════════════════════')
  console.log(`  DONE ${dryRun ? '(DRY RUN)' : ''}`)
  console.log('══════════════════════════════════════════')
  console.log(`  Fixed:           ${results.fixed}`)
  console.log(`  No change:       ${results.skipped}`)
  console.log(`  False positives: ${results.falsePositives}`)
  console.log(`  Errors:          ${results.errors}`)
  if (dryRun) console.log('\n  Run without --dry-run to apply fixes to Supabase.')
}

main().catch(e => { console.error(e); process.exit(1) })

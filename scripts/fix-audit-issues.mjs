/**
 * Surgical fix script for the specific QA bugs surfaced by the
 * 24-case feature-gap audit (data contradictions + factual errors).
 *
 * For each fix, the script:
 *   1. Fetches the case from Supabase
 *   2. Asks Claude to produce a minimal JSON patch (one field at a time)
 *   3. Shows a colored diff
 *   4. Backs up original case_data to scripts/backups/<timestamp>/
 *   5. Writes back to Supabase ONLY when --apply is set
 *
 * Default mode is dry-run (preview, no writes).
 *
 * Usage:
 *   node scripts/fix-audit-issues.mjs                  # dry run, all fixes
 *   node scripts/fix-audit-issues.mjs --apply          # write to Supabase
 *   node scripts/fix-audit-issues.mjs --case-id <id>   # run one fix only
 *   node scripts/fix-audit-issues.mjs --list           # list defined fixes
 *
 * Cost: ~$0.005/fix (5 fixes ≈ $0.03)
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

const args = process.argv.slice(2)
const apply       = args.includes('--apply')
const listOnly    = args.includes('--list')
const filterId    = args[args.indexOf('--case-id') + 1] || null
const onlyOneCase = args.includes('--case-id') ? filterId : null

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Supabase env vars not set in .env.local'); process.exit(1)
}
if (!listOnly && !process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY required (or use --list)'); process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const anthropic = listOnly ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Fix specifications ────────────────────────────────────────────────────────
// Each fix targets one field with one surgical instruction.
const FIXES = [
  {
    caseId: 'gastrointestinal-advanced-small-bowel-obstruction-0',
    title: 'Resolve contradiction in abdominal exam (no guarding vs. voluntary guarding)',
    fieldPath: 'physicalExam.Abdomen',
    instruction: `The current value contradicts itself by stating both "no guarding" AND "voluntary guarding present" in the same field. For an Advanced-difficulty SBO case with progressing concern for strangulation, the clinically correct finding is voluntary guarding WITHOUT involuntary guarding/rigidity (peritoneal signs would mandate emergent surgery; their absence supports a trial of conservative management while monitoring for deterioration). Remove the "no guarding" language and keep clear, consistent voluntary guarding language. Preserve all other findings (distension, tympany, bowel sounds, tenderness location, hernia exam, etc.) verbatim.`,
  },
  {
    caseId: 'img-CXR216_IM-0777-2001',
    title: 'Resolve JVD/JVP contradiction between HEENT and Neck exam (Cardiomegaly)',
    fieldPath: 'physicalExam',
    instruction: `The HEENT field states "No JVD appreciated supine" while the Neck field documents "elevated JVP to 10 cm H2O." JVD assessment belongs in the Neck exam, not HEENT, and the elevated JVP is the correct/expected finding for cardiomegaly with volume overload. Remove the JVD-related sentence from HEENT entirely (replace with a clean HEENT exam if the JVD line was the only content, or simply remove that specific sentence). Keep the Neck exam exactly as is. Return ONLY the modified physicalExam object.`,
  },
  {
    caseId: 'neurologic-foundations-bacterial-meningitis-0',
    title: 'Add neck stiffness to basic HPI (already in clinicalHpi but missing from hpi)',
    fieldPath: 'hpi',
    instruction: `The basic hpi field is missing neck stiffness, which is a cardinal symptom of bacterial meningitis. The clinicalHpi correctly includes it. Add neck stiffness to the hpi while staying within the 60-word limit (FOUNDATIONS HPI WORD LIMIT RULE). Keep everything else (chief complaint, primary symptoms, duration) — just incorporate neck stiffness as one of the primary symptoms.`,
  },
  {
    caseId: 'cardiovascular-clinical-hypertensive-emergency-0',
    title: 'Reconcile headache description (worst-of-life in hidden vs. throbbing/gradual in HPI)',
    fieldPath: 'hiddenHistory.fullHistory',
    instruction: `The hpi describes a throbbing, gradual-onset occipital headache, which is consistent with hypertensive emergency. The hiddenHistory.fullHistory contains a "worst headache of his life" / thunderclap framing that would point toward subarachnoid hemorrhage instead — a different diagnosis. Edit the fullHistory to match the actual diagnosis: keep the gradual-onset, throbbing, occipital headache description with severity language (e.g., "severe" or "10/10") but REMOVE any "worst-ever" or "thunderclap" or "sudden-onset" / "maximal at onset" language. Preserve every other clinical detail (medication non-adherence, BP history, exposures, etc.) verbatim.`,
  },
  {
    caseId: 'respiratory-clinical-community-acquired-pneumonia-0',
    title: 'Fix factual error in CURB-65 teaching point (claims ≥3, actual score is 1-2)',
    fieldPath: 'teachingPoints',
    instruction: `One of the four teachingPoints incorrectly claims this patient has a CURB-65 score "of at least 3." The actual case data (Confusion=1, Urea unknown at presentation, RR borderline ≥30, BP not <90 systolic or ≤60 diastolic, Age <65) yields a score of 1-2, not ≥3. Rewrite ONLY the offending teaching point to: (a) walk through the CURB-65 components for THIS patient using the actual values, (b) state the correct score (1-2), (c) explain why clinical judgment can still favor admission despite a low score (severity, hypoxia, comorbidity, social factors). Keep the other three teaching points exactly as they are. Return the full teachingPoints array.`,
  },
]

// ── Diff utility ──────────────────────────────────────────────────────────────
function colorize(line) {
  if (line.startsWith('+ ')) return `\x1b[32m${line}\x1b[0m`
  if (line.startsWith('- ')) return `\x1b[31m${line}\x1b[0m`
  return line
}

function showDiff(label, oldVal, newVal) {
  const oldStr = typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal, null, 2)
  const newStr = typeof newVal === 'string' ? newVal : JSON.stringify(newVal, null, 2)
  console.log(`\n  Field: ${label}`)
  console.log('  ─── BEFORE ───')
  oldStr.split('\n').forEach(l => console.log(colorize('- ' + l)))
  console.log('  ─── AFTER ────')
  newStr.split('\n').forEach(l => console.log(colorize('+ ' + l)))
}

// ── Apply patch by dotted path ────────────────────────────────────────────────
function getByPath(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

function setByPath(obj, dotPath, value) {
  const keys = dotPath.split('.')
  const last = keys.pop()
  const parent = keys.reduce((o, k) => (o[k] = o[k] ?? {}), obj)
  parent[last] = value
}

// ── Claude patch generator ────────────────────────────────────────────────────
async function generatePatch(caseData, fix) {
  const currentValue = getByPath(caseData, fix.fieldPath)
  if (currentValue === undefined) {
    throw new Error(`Field path "${fix.fieldPath}" not found in case_data`)
  }

  const prompt = `You are surgically fixing one bug in a medical training case. Apply ONLY the change requested below — do not rewrite, reorganize, or "improve" anything else.

INSTRUCTION:
${fix.instruction}

TARGET FIELD: ${fix.fieldPath}

CURRENT VALUE OF THAT FIELD:
${JSON.stringify(currentValue, null, 2)}

FOR CONTEXT, the full case_data (do not modify any other field):
${JSON.stringify(caseData, null, 2)}

Return ONLY valid JSON with this exact structure (no markdown, no commentary):
{
  "newValue": <the corrected value for the target field — same TYPE as the current value (string stays string, object stays object, array stays array)>,
  "summary": "<one short sentence describing what you changed>",
  "noChangeNeeded": <true if the bug is already fixed and no change is required, false otherwise>
}`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = resp.content[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude response did not contain JSON')
  return JSON.parse(match[0])
}

// ── Backup directory ──────────────────────────────────────────────────────────
function ensureBackupDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(ROOT, 'scripts', 'backups', `audit-fixes-${stamp}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (listOnly) {
    console.log('Defined fixes:\n')
    FIXES.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.caseId}]`)
      console.log(`     ${f.title}`)
      console.log(`     field: ${f.fieldPath}\n`)
    })
    return
  }

  const fixes = onlyOneCase
    ? FIXES.filter(f => f.caseId === onlyOneCase)
    : FIXES

  if (fixes.length === 0) {
    console.error(`No fix defined for case-id "${onlyOneCase}"`)
    process.exit(1)
  }

  console.log(`Mode: ${apply ? 'APPLY (writes to Supabase)' : 'DRY RUN (preview only)'}`)
  console.log(`Fixes to process: ${fixes.length}\n`)

  let backupDir = null
  if (apply) {
    backupDir = ensureBackupDir()
    console.log(`Backups will be written to: ${backupDir}\n`)
  }

  const results = []

  for (const fix of fixes) {
    console.log(`\n══════════════════════════════════════════════════`)
    console.log(`▶ ${fix.caseId}`)
    console.log(`  ${fix.title}`)

    try {
      const { data: row, error } = await supabase
        .from('cases')
        .select('id, case_data')
        .eq('id', fix.caseId)
        .single()

      if (error) throw new Error(`Fetch failed: ${error.message}`)
      if (!row) throw new Error('Case not found')

      const patch = await generatePatch(row.case_data, fix)

      if (patch.noChangeNeeded) {
        console.log(`  ✓ No change needed — bug already resolved`)
        results.push({ caseId: fix.caseId, status: 'skipped' })
        continue
      }

      const oldValue = getByPath(row.case_data, fix.fieldPath)
      showDiff(fix.fieldPath, oldValue, patch.newValue)
      console.log(`\n  Summary: ${patch.summary}`)

      if (apply) {
        // Backup
        const backupPath = path.join(backupDir, `${fix.caseId}.json`)
        fs.writeFileSync(backupPath, JSON.stringify(row.case_data, null, 2))

        // Apply patch (deep clone to avoid mutating row.case_data unexpectedly)
        const newCaseData = JSON.parse(JSON.stringify(row.case_data))
        setByPath(newCaseData, fix.fieldPath, patch.newValue)

        const { error: updateError } = await supabase
          .from('cases')
          .update({ case_data: newCaseData })
          .eq('id', fix.caseId)

        if (updateError) throw new Error(`Update failed: ${updateError.message}`)
        console.log(`  ✓ Applied (backup: ${backupPath})`)
        results.push({ caseId: fix.caseId, status: 'applied', summary: patch.summary })
      } else {
        results.push({ caseId: fix.caseId, status: 'preview', summary: patch.summary })
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`)
      results.push({ caseId: fix.caseId, status: 'error', error: err.message })
    }
  }

  console.log('\n══════════════════════════════════════════════════')
  console.log('SUMMARY')
  console.log('══════════════════════════════════════════════════')
  for (const r of results) {
    const icon = r.status === 'applied' ? '✓' : r.status === 'preview' ? '⚆' : r.status === 'skipped' ? '∅' : '✗'
    console.log(`  ${icon} [${r.status}] ${r.caseId}${r.summary ? ` — ${r.summary}` : ''}${r.error ? ` (${r.error})` : ''}`)
  }

  if (!apply && results.some(r => r.status === 'preview')) {
    console.log('\nThis was a dry run. Re-run with --apply to write changes to Supabase.')
  }
}

main().catch(err => { console.error(err); process.exit(1) })

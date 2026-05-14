/**
 * Strip contextual hooks from Advanced HPI (advancedHpi field only).
 *
 * Advanced difficulty requires students to elicit all context via history-taking.
 * Hooks like "Recently saw a dentist", "after recent dental work", "takes metformin",
 * "returned from a camping trip" pre-telegraph the diagnosis and defeat that requirement.
 *
 * Target spec: age + sex + ONE vague symptom + optional duration. Nothing else.
 *
 * This script removes hooks from advancedHpi ONLY.
 * Never touches hpi, clinicalHpi, or any other field.
 *
 * Safe: textual substitution only, idempotent.
 *
 * Usage:
 *   node scripts/strip-hpi-hooks.mjs              # dry run
 *   node scripts/strip-hpi-hooks.mjs --write      # write to Supabase
 *   node scripts/strip-hpi-hooks.mjs --case-id x  # single case
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const write      = args.includes('--write')
const caseFilter = getArg('--case-id')

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ─── Hook token lists ──────────────────────────────────────────────────────────

// Contextual event words that make a prepositional phrase a diagnostic hook
const HOOK_TOKENS = [
  'dental', 'dentist', 'tooth', 'extraction',
  'surgery', 'procedure', 'operation', 'catheterization',
  'accident', 'crash', 'collision', 'incident',
  'fall', 'fell', 'injury', 'trauma', 'injured',
  'travel', 'trip', 'camping', 'hiking', 'vacation', 'immigration',
  'party', 'gathering', 'concert', 'crowded',
  'lifting', 'exertion', 'exercise', 'workout', 'running',
  'meal', 'meals', 'eating', 'food', 'barbecue', 'diet',
  'medication', 'started', 'refilled', 'ran out', 'began', 'stopped',
  'treatment', 'antibiotic', 'antibiotics', 'antimicrobial', 'therapy', 'chemotherapy', 'prescription',
  'ibuprofen', 'aspirin', 'metformin', 'insulin', 'warfarin', 'lisinopril',
  'atenolol', 'levothyroxine', 'omeprazole', 'furosemide', 'hydrochlorothiazide',
  'prednisone', 'ocp', 'oral contraceptive', 'birth control', 'supplement',
  'alcohol', 'drinking', 'binge',
  'blood sugar', 'glucose', 'cholesterol', 'blood pressure',
  'takes ', 'started taking',
].join('|')

const HOOK_TOKENS_RE = new RegExp(HOOK_TOKENS, 'i')

// ─── Strip passes ──────────────────────────────────────────────────────────────

function stripField(s) {
  if (typeof s !== 'string') return s
  let out = s

  // Pass 1: drop trailing sentence(s) — keep only the first sentence.
  // "54-year-old male with fatigue. Recently saw a dentist." → "54-year-old male with fatigue."
  const firstPeriod = out.indexOf('. ')
  if (firstPeriod !== -1) {
    out = out.slice(0, firstPeriod + 1).trim()
  }

  // Pass 2: drop semicolon clause.
  // "58-year-old man with distension; reports recent hematochezia." → "58-year-old man with distension."
  const semi = out.indexOf(';')
  if (semi !== -1) {
    out = out.slice(0, semi).trim()
    if (!out.endsWith('.')) out += '.'
  }

  // Pass 3: strip trailing prepositional hook phrases when they contain a hook token.
  // Targets: "after recent X", "following X", "while X", "during X", "since X" etc.
  // Uses [^,;]+$ to match the phrase to end-of-string, consuming trailing period naturally.
  // Only strips when the phrase contains a recognized hook token.
  {
    const prepRE = /[,—–-]?\s*(after|following|since|while|during|before|upon)\s+(?:recent\s+|a\s+|an\s+|the\s+)?[^,;]+$/i
    const prepMatch = out.match(prepRE)
    if (prepMatch && HOOK_TOKENS_RE.test(prepMatch[0])) {
      out = out.slice(0, prepMatch.index).trim()
      if (!out.endsWith('.')) out += '.'
    }
  }

  // Pass 4: strip inline blood-sugar/cholesterol/blood-pressure value clauses.
  // e.g. "..., blood sugar recently elevated." or "..., blood pressure poorly controlled."
  out = out.replace(/[,.]?\s*(?:blood\s+sugar|blood\s+pressure|glucose|cholesterol)\s+(?:readings?\s+|levels?\s+)?[^.,;]+[.,]?/gi, '').trim()
  if (out && !out.endsWith('.') && !out.endsWith('?') && !out.endsWith('!')) out += '.'

  // Pass 5: cleanup — collapse double spaces, fix dangling punctuation, ensure period.
  out = out.replace(/  +/g, ' ').replace(/ ([.,;])/g, '$1').trim()
  if (out && !out.endsWith('.') && !out.endsWith('?') && !out.endsWith('!')) out += '.'

  return out
}

function fixCase(caseData) {
  const field = 'advancedHpi'
  if (typeof caseData[field] !== 'string') return null
  const fixed = stripField(caseData[field])
  if (fixed === caseData[field]) return null
  return { ...caseData, [field]: fixed }
}

async function fetchCandidates() {
  const rows = []
  let offset = 0
  const pageSize = 100
  while (true) {
    let q = supabase.from('cases').select('id, case_data').eq('is_generated', true).range(offset, offset + pageSize - 1)
    if (caseFilter) q = q.eq('id', caseFilter)
    const { data, error } = await q
    if (error) throw new Error(`Supabase: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

console.log('Fetching cases…')
const candidates = await fetchCandidates()
console.log(`Scanning ${candidates.length} cases…`)
if (!write) console.log('DRY RUN — pass --write to save.\n')

let fixed = 0, skipped = 0, errors = 0

for (const row of candidates) {
  const updated = fixCase(row.case_data)
  if (!updated) { skipped++; continue }

  const before = row.case_data.advancedHpi
  const after  = updated.advancedHpi
  const b = String(before).slice(0, 110)
  const a = String(after).slice(0, 110)
  console.log(`${write ? '✓' : '~'} ${row.id.substring(0, 36)}`)
  console.log(`    before: ${b}`)
  console.log(`    after:  ${a}`)

  if (write) {
    try {
      const { error } = await supabase.from('cases').update({ case_data: updated }).eq('id', row.id)
      if (error) throw new Error(error.message)
      fixed++
    } catch (err) {
      console.error(`  ✗ ${row.id}: ${err.message}`)
      errors++
    }
  } else {
    fixed++
  }
}

console.log(`\n═══ DONE ═══`)
console.log(`  Changed:        ${fixed}`)
console.log(`  Already clean:  ${skipped}`)
console.log(`  Errors:         ${errors}`)
if (!write) console.log(`  (dry run)`)

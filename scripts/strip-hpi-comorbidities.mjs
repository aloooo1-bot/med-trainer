/**
 * Strip comorbidity labels from Advanced/Clinical HPI fields.
 *
 * On Advanced and Clinical difficulty, pastMedicalHistory.conditions is gated —
 * students must elicit it via history-taking. Placing comorbidity labels like
 * "diabetic", "hypertensive", "with type 2 diabetes" directly in the HPI
 * defeats that gating.
 *
 * This script removes those labels from hpi, clinicalHpi, and advancedHpi ONLY.
 * Never touches pastMedicalHistory or any other field.
 *
 * Safe: textual substitution only, idempotent.
 *
 * Usage:
 *   node scripts/strip-hpi-comorbidities.mjs              # dry run
 *   node scripts/strip-hpi-comorbidities.mjs --write      # write to Supabase
 *   node scripts/strip-hpi-comorbidities.mjs --case-id x  # single case
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

// ─── Disease token ─────────────────────────────────────────────────────────────
// Matches a chronic comorbidity, optionally prefixed by quality descriptors and
// suffixed by a parenthetical (e.g. "type 2 diabetes (poorly controlled)").

const DISEASE_NAMES = [
  String.raw`diabetes(?:\s+mellitus)?`,
  String.raw`t[12]dm`,
  String.raw`hypertension`,
  String.raw`htn`,
  String.raw`copd`,
  String.raw`chronic\s+obstructive\s+pulmonary\s+disease`,
  String.raw`asthma`,
  String.raw`ckd(?:\s+stage\s+\d+[ab]?)?`,
  String.raw`chronic\s+kidney\s+disease(?:\s+stage\s+\d+[ab]?)?`,
  String.raw`cad`,
  String.raw`coronary\s+artery\s+disease`,
  String.raw`chf`,
  String.raw`congestive\s+heart\s+failure(?:\s+with\s+(?:reduced|preserved)\s+ejection\s+fraction)?`,
  String.raw`heart\s+failure(?:\s+with\s+(?:reduced|preserved)\s+ejection\s+fraction)?`,
  String.raw`cirrhosis(?:\s+of\s+the\s+liver)?`,
  String.raw`hypothyroidism`,
  String.raw`hyperthyroidism`,
  String.raw`obesity`,
  String.raw`morbid\s+obesity`,
  String.raw`hyperlipidemia`,
  String.raw`dyslipidemia`,
  String.raw`hypertriglyceridemia`,
  String.raw`peripheral\s+(?:arterial|artery|vascular)\s+disease`,
  String.raw`atrial\s+fibrillation`,
  String.raw`gout`,
  String.raw`osteoporosis`,
  String.raw`benign\s+prostatic\s+hyperplasia`,
  String.raw`bph`,
  String.raw`anemia(?:\s+of\s+chronic\s+disease)?`,
  String.raw`chronic\s+liver\s+disease`,
  String.raw`non[-\s]alcoholic\s+fatty\s+liver\s+disease`,
  String.raw`nafld`,
].join('|')

const QUAL_PREFIX  = String.raw`(?:(?:well[-\s]controlled|poorly[-\s]controlled|uncontrolled|known|prior|stable|untreated|chronic|longstanding|long[-\s]standing)\s+)?`
const TYPE_PREFIX  = String.raw`(?:type\s*[12]\s+|juvenile\s+)?`
const PARENS_TAIL  = String.raw`(?:\s*\([^)]{1,120}\))?`   // optional parenthetical qualifier
const MED_TAIL     = String.raw`(?:\s+on\s+[\w-]+)?`           // "on warfarin", "on insulin"
const DT           = `(?:${QUAL_PREFIX}${TYPE_PREFIX}(?:${DISEASE_NAMES})${PARENS_TAIL}${MED_TAIL})`

// List separator: ", " / ", and " / " and "
const SEP = `(?:,\\s*(?:and\\s+)?|\\s+and\\s+)`

// Full "with [history of] <disease list>" phrase — consumes the entire comma/and-chained list
const WITH_DISEASE_LIST_RE = new RegExp(
  `,?\\s*\\bwith\\s+(?:a\\s+(?:known\\s+|prior\\s+)?history\\s+of\\s+|known\\s+)?` +
  DT + `(?:${SEP}${DT})*`,
  'gi'
)

// Adjective form directly before a person noun: "diabetic man" → "man"
const ADJECTIVE_RE = /\b(diabetic|hypertensive|obese|morbidly\s+obese|hyperlipidemic|cirrhotic|hypothyroid(?:ic)?|hyperthyroid(?:ic)?|asthmatic|alcoholic)\s+(man|woman|male|female|patient|gentleman|lady)\b/gi

const HPI_FIELDS = ['hpi', 'clinicalHpi', 'advancedHpi']

function stripField(s) {
  if (typeof s !== 'string') return s
  let out = s

  // Pass 1: strip "with [history of] disease-list" clauses (handles full comma/and chains)
  out = out.replace(WITH_DISEASE_LIST_RE, '')

  // Pass 2: strip adjective-form comorbidity labels before person nouns
  out = out.replace(ADJECTIVE_RE, (_, _adj, noun) => noun)

  // Pass 3: fix dangling "and/,and <non-disease phrase>" left when only the comorbidity
  // portion of "with disease and non-disease" was stripped.
  // "a 28-year-old male and a 10 pack-year..." → "... male with a 10..."
  // "a 58-year-old male, and a recently diagnosed..." → "... male with a recently..."
  out = out.replace(
    /\b(male|female|man|woman|patient|gentleman|lady),?\s+and\s+(?!who\b|that\b|the\b|she\b|he\b|then\b|also\b)/gi,
    '$1 with '
  )

  // Pass 4: drop orphan leading comma before "who"/"presenting"/"presents"
  out = out.replace(/,\s*(who\b|presents\b|presenting\b)/gi, ' $1')

  // Pass 5: collapse double spaces and trim
  out = out.replace(/  +/g, ' ').replace(/ ([.,;])/g, '$1').trim()

  return out
}

function fixCase(caseData) {
  let changed = false
  const updated = { ...caseData }
  for (const field of HPI_FIELDS) {
    if (typeof caseData[field] !== 'string') continue
    const fixed = stripField(caseData[field])
    if (fixed !== caseData[field]) {
      updated[field] = fixed
      changed = true
    }
  }
  return changed ? updated : null
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

  for (const field of HPI_FIELDS) {
    const before = row.case_data[field]
    const after  = updated[field]
    if (before !== after) {
      const b = String(before).slice(0, 110)
      const a = String(after).slice(0, 110)
      console.log(`${write ? '✓' : '~'} ${row.id.substring(0, 36)} [${field}]`)
      console.log(`    before: ${b}`)
      console.log(`    after:  ${a}`)
    }
  }

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
console.log(`  Fixed:          ${fixed}`)
console.log(`  Already clean:  ${skipped}`)
console.log(`  Errors:         ${errors}`)
if (!write) console.log(`  (dry run)`)

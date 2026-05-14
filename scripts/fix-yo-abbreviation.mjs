/**
 * Normalize age abbreviations across all generated cases.
 * Replaces "42yo" / "42y/o" / "42 yo" / "42y.o." → "42-year-old" in every string field.
 *
 * Safe: purely textual substitution, idempotent.
 *
 * Usage:
 *   node scripts/fix-yo-abbreviation.mjs              # dry run
 *   node scripts/fix-yo-abbreviation.mjs --write      # write to Supabase
 *   node scripts/fix-yo-abbreviation.mjs --case-id x  # single case
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

// Match: 42yo / 42y/o / 42 yo / 42-yo / 42y.o. / 42 y.o.
const YO_RE = /\b(\d+)\s*(-?\s*y(?:o|\/o|\.o\.?))\b/gi

function fixString(s) {
  return s.replace(YO_RE, (_, num) => `${num}-year-old`)
}

function walkFix(obj) {
  if (typeof obj === 'string') return fixString(obj)
  if (Array.isArray(obj)) return obj.map(walkFix)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) out[k] = walkFix(v)
    return out
  }
  return obj
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
  const updated = walkFix(row.case_data)
  const before  = JSON.stringify(row.case_data)
  const after   = JSON.stringify(updated)
  if (before === after) { skipped++; continue }

  // Collect the changed fields for display
  const changedFields = []
  function diff(a, b, path) {
    if (typeof a === 'string' && a !== b) { changedFields.push(path); return }
    if (Array.isArray(a)) { a.forEach((v, i) => diff(v, b[i], `${path}[${i}]`)); return }
    if (a && typeof a === 'object') { for (const k of Object.keys(a)) diff(a[k], b[k], path ? `${path}.${k}` : k); }
  }
  diff(row.case_data, updated, '')

  console.log(`${write ? '✓' : '~'} ${row.id.substring(0, 64)}: ${changedFields.join(', ')}`)

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

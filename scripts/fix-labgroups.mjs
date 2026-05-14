/**
 * Fix labGroups coverage: for every availableLabs entry not in any labGroups.tests,
 * add a standalone single-item group.
 *
 * Safe: additive only — never removes or modifies existing groups.
 * Idempotent: re-running is a no-op if already fixed.
 *
 * Usage:
 *   node scripts/fix-labgroups.mjs              # dry run (preview)
 *   node scripts/fix-labgroups.mjs --write      # write to Supabase
 *   node scripts/fix-labgroups.mjs --case-id x  # single case
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args      = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const write     = args.includes('--write')
const caseFilter = getArg('--case-id')

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function fetchCandidates() {
  const rows = []
  let offset = 0
  const pageSize = 100
  while (true) {
    let q = supabase.from('cases')
      .select('id, case_data')
      .eq('is_generated', true)
      .range(offset, offset + pageSize - 1)
    if (caseFilter) q = q.eq('id', caseFilter)
    const { data, error } = await q
    if (error) throw new Error(`Supabase: ${error.message}`)
    if (!data?.length) break
    // Only process cases that have availableLabs and labGroups
    rows.push(...data.filter(r => Array.isArray(r.case_data?.availableLabs) && Array.isArray(r.case_data?.labGroups)))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

function fixLabGroups(caseData) {
  const labs = caseData.availableLabs ?? []
  const groups = caseData.labGroups ?? []
  const grouped = new Set(groups.flatMap(g => g.tests ?? []))
  const missing = labs.filter(lab => !grouped.has(lab))
  if (missing.length === 0) return null // already correct
  const newGroups = [...groups, ...missing.map(lab => ({ name: lab, tests: [lab] }))]
  return { ...caseData, labGroups: newGroups }
}

console.log('Fetching cases…')
const candidates = await fetchCandidates()
console.log(`Checking ${candidates.length} cases…`)
if (!write) console.log('DRY RUN — pass --write to save.\n')

let fixed = 0, skipped = 0, errors = 0

for (const row of candidates) {
  const updated = fixLabGroups(row.case_data)
  if (!updated) { skipped++; continue }
  const missing = (row.case_data.availableLabs ?? []).filter(
    lab => !new Set((row.case_data.labGroups ?? []).flatMap(g => g.tests ?? [])).has(lab)
  )
  console.log(`${write ? '✓' : '~'} ${row.id.substring(0,60)}: adding ${missing.length} standalone group(s)`)
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
console.log(`  Fixed:   ${fixed}`)
console.log(`  Already correct: ${skipped}`)
console.log(`  Errors:  ${errors}`)
if (!write) console.log(`  (dry run)`)

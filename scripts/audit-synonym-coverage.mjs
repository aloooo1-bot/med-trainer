/**
 * Synonym-coverage audit (remediation 4.4).
 *
 * Advanced-difficulty fairness depends on free-typed orders resolving to the
 * case's result keys. This audit asserts that every expected lab/imaging name
 * and every result key in every case resolves through searchTests (the
 * master-list search students use) — and, failing that, whether the fuzzy
 * matcher (app/lib/testMatch.ts) would still rescue it at order time.
 *
 * Emits a gap report grouped by unresolvable name, ranked by frequency, as
 * the clinician-review TODO list for new synonyms.
 *
 * No LLM calls. Run with tsx (imports TS modules):
 *   npm run audit:synonyms
 *   npx tsx scripts/audit-synonym-coverage.mjs [--dir <case-json-dir>] [--json <out>]
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { searchTests } from '../app/lib/testMasterList.ts'
import { fuzzyResolveTest } from '../app/lib/testMatch.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }
const dirArg = getArg('--dir')
const outPath = path.resolve(ROOT, getArg('--json') ?? 'scripts/synonym-gap-report.json')

// ── Case loading (same sources as audit-differential-sanity) ─────────────────

function extractCase(raw) {
  if (raw?.caseData) return raw.caseData
  if (raw?.case_data) return raw.case_data
  if (raw?.presentation_data) {
    return { ...raw.presentation_data, ...raw.patient_knowledge, ...raw.clinical_findings, ...raw.ground_truth }
  }
  return raw
}

async function loadFromSupabase() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await Promise.race([
      db.from('cases').select('id, case_data, presentation_data, patient_knowledge, clinical_findings, ground_truth').eq('is_generated', true),
      new Promise((_, rej) => setTimeout(() => rej(new Error('supabase timeout')), 10_000)),
    ])
    if (error) throw new Error(error.message)
    return data.map(row => ({ id: row.id, caseData: extractCase(row) }))
  } catch (e) {
    console.warn(`[synonyms] Supabase unavailable (${e.message}) — falling back to local case files`)
    return null
  }
}

function newestBackupDir() {
  const backups = path.join(ROOT, 'scripts', 'backups')
  if (!fs.existsSync(backups)) return null
  const dirs = fs.readdirSync(backups)
    .map(d => path.join(backups, d))
    .filter(d => fs.statSync(d).isDirectory())
    .sort()
  return dirs.at(-1) ?? null
}

function loadFromDir(dir) {
  if (!dir || !fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .flatMap(f => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        const caseData = extractCase(raw)
        if (!caseData?.diagnosis) return []
        return [{ id: f.replace(/\.json$/, ''), caseData }]
      } catch { return [] }
    })
}

// ── Audit ─────────────────────────────────────────────────────────────────────

let cases = await loadFromSupabase()
if (!cases) {
  const dirs = dirArg ? [path.resolve(ROOT, dirArg)] : [path.join(ROOT, '.data', 'cases'), newestBackupDir()].filter(Boolean)
  cases = dirs.flatMap(loadFromDir)
  console.log(`[synonyms] loaded ${cases.length} case file(s) from: ${dirs.join(', ')}`)
}
if (!cases.length) {
  console.error('[synonyms] no cases found — pass --dir <folder of case JSON files>')
  process.exit(2)
}

/** name → { count, sources: Set<caseId>, fuzzyRescued } */
const gaps = new Map()
let checked = 0

for (const { id, caseData: c } of cases) {
  const names = new Set([
    ...(c.expectedLabs ?? []),
    ...(c.expectedImaging ?? []),
    ...Object.keys(c.labResults ?? {}),
    ...Object.keys(c.imagingResults ?? {}),
    ...Object.keys(c.procedureResults ?? {}),
  ])
  const resultKeys = [
    ...Object.keys(c.labResults ?? {}),
    ...Object.keys(c.imagingResults ?? {}),
    ...Object.keys(c.procedureResults ?? {}),
  ]
  for (const name of names) {
    checked++
    if (searchTests(name).length > 0) continue
    // Not findable via the master-list search — would the order-time fuzzy
    // matcher still resolve it against this case's own keys?
    const fuzzy = fuzzyResolveTest(name, resultKeys)
    const entry = gaps.get(name) ?? { count: 0, cases: [], fuzzyRescued: false }
    entry.count++
    if (entry.cases.length < 8) entry.cases.push(id)
    entry.fuzzyRescued = entry.fuzzyRescued || !!fuzzy.match
    gaps.set(name, entry)
  }
}

const gapList = Array.from(gaps.entries())
  .map(([name, g]) => ({ name, ...g }))
  .sort((a, b) => b.count - a.count)

const report = {
  generatedAt: new Date().toISOString(),
  cases: cases.length,
  namesChecked: checked,
  unresolvable: gapList.length,
  note: 'Each entry is a test name that searchTests() cannot find — add a synonym/abbreviation to MASTER_TEST_LIST (clinician review). fuzzyRescued=true means order-time fuzzy matching still resolves it against the case keys.',
  gaps: gapList,
}
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

console.log(`\n[synonyms] checked ${checked} names across ${cases.length} cases — ${gapList.length} unresolvable via searchTests`)
for (const g of gapList.slice(0, 20)) {
  console.log(`  ${String(g.count).padStart(3)}× ${g.name}${g.fuzzyRescued ? '  (fuzzy-rescued at order time)' : ''}`)
}
if (gapList.length > 20) console.log(`  … ${gapList.length - 20} more in the report`)
console.log(`[synonyms] gap report → ${path.relative(ROOT, outPath)}`)

/**
 * Differential-priors / testImpacts SANITY audit (remediation 4.2).
 *
 * These numbers are LLM-authored teaching values. This audit runs the actual
 * reasoning engine (computeBeliefs) over each case and FAILS the case when:
 *   1. Applying the case's expected workup (expectedLabs + expectedImaging)
 *      does NOT leave the true diagnosis ranked #1, or
 *   2. Any single test implausibly moves a NON-target diagnosis:
 *      - a 'confirms' effect on a diagnosis other than the true one, or
 *      - a single-test probability shift of a non-target dx > SHIFT_OUTLIER
 *        (flagged for clinician review).
 *
 * No LLM calls — pure math. Run with tsx so the TS engine module is importable:
 *   npm run audit:differentials
 *   npx tsx scripts/audit-differential-sanity.mjs [--dir <case-json-dir>] [--json <out>]
 *
 * Sources: Supabase `cases` when reachable; otherwise every *.json case file
 * under --dir (default: .data/cases plus the newest scripts/backups snapshot).
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import {
  computeBeliefs,
  normalizePriors,
  applyTestResult,
} from '../app/lib/reasoning/differential.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }
const dirArg = getArg('--dir')
const outPath = path.resolve(ROOT, getArg('--json') ?? 'scripts/differential-sanity-report.json')

const SHIFT_OUTLIER = 0.45

// ── Case loading ──────────────────────────────────────────────────────────────

function extractCase(raw) {
  // Accept raw case_data, {caseData}, or a tiered row.
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
    console.warn(`[sanity] Supabase unavailable (${e.message}) — falling back to local case files`)
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

// ── Sanity checks ─────────────────────────────────────────────────────────────

const norm = s => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const sameDx = (a, b) => {
  const na = norm(a); const nb = norm(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

function auditCase(id, c) {
  const issues = []
  const priors = c.differentialPriors
  const impacts = c.testImpacts ?? {}
  if (!Array.isArray(priors) || priors.length < 2) {
    return { id, skipped: true, reason: 'no reasoning model (differentialPriors < 2)' }
  }

  // 1. Expected workup must rank the true diagnosis #1.
  const workup = [...(c.expectedLabs ?? []), ...(c.expectedImaging ?? [])]
  const appliedWorkup = workup.filter(t => impacts[t])
  const finalBeliefs = computeBeliefs(priors, impacts, workup)
  const top = finalBeliefs[0]
  if (!top || !sameDx(top.name, c.diagnosis)) {
    issues.push({
      severity: 'FAIL',
      check: 'workup-ranks-truth-first',
      detail: `After expected workup (${appliedWorkup.length}/${workup.length} tests have impacts), top-ranked is "${top?.name}" (${Math.round((top?.probability ?? 0) * 100)}%), not "${c.diagnosis}"`,
      ranking: finalBeliefs.map(b => `${b.name}: ${Math.round(b.probability * 100)}%`),
    })
  }
  if (appliedWorkup.length === 0 && workup.length > 0) {
    issues.push({
      severity: 'WARN',
      check: 'workup-has-impacts',
      detail: `None of the ${workup.length} expected tests appear in testImpacts — the board never moves on the intended workup`,
    })
  }

  // 2. Per-test outliers on non-target diagnoses.
  const baseline = normalizePriors(priors)
  const baseByName = Object.fromEntries(baseline.map(b => [b.name, b.probability]))
  for (const [test, perDx] of Object.entries(impacts)) {
    for (const [dxName, entry] of Object.entries(perDx)) {
      if (entry?.effect === 'confirms' && !sameDx(dxName, c.diagnosis)) {
        issues.push({
          severity: 'FAIL',
          check: 'confirms-non-target',
          detail: `Test "${test}" CONFIRMS non-target diagnosis "${dxName}" — a single test should never confirm a wrong answer`,
        })
      }
    }
    const after = applyTestResult(baseline, perDx)
    for (const b of after) {
      const shift = Math.abs(b.probability - (baseByName[b.name] ?? 0))
      if (shift > SHIFT_OUTLIER && !sameDx(b.name, c.diagnosis)) {
        issues.push({
          severity: 'REVIEW',
          check: 'single-test-shift-outlier',
          detail: `Test "${test}" alone moves non-target "${b.name}" by ${Math.round(shift * 100)} points (>${SHIFT_OUTLIER * 100}) — flag for clinician review`,
        })
      }
    }
  }

  // 3. expectedLabs padding: an expected (must-order, scored-against) test that
  //    moves NEITHER the true diagnosis NOR any can't-miss differential is not a
  //    must-order — it's padding, and a correct-dx student loses testOrdering
  //    points for skipping it unfairly. Flag for clinician trimming.
  const cantMiss = priors.filter(p => p.category === 'cant-miss').map(p => p.name)
  const loadBearingFor = [c.diagnosis, ...cantMiss]
  for (const test of workup) {
    const perDx = impacts[test]
    if (!perDx) continue // "workup-has-impacts" already flags a test with no model entry
    const movesSomethingCritical = loadBearingFor.some(dx => {
      const key = Object.keys(perDx).find(k => sameDx(k, dx))
      const effect = key ? perDx[key]?.effect : undefined
      return effect && effect !== 'neutral'
    })
    if (!movesSomethingCritical) {
      issues.push({
        severity: 'REVIEW',
        check: 'expected-test-padding',
        detail: `Expected test "${test}" is neutral for the true diagnosis and every can't-miss differential — it is not a genuine must-order; consider removing it from expectedLabs/expectedImaging so a correct-dx student isn't penalized for skipping it`,
      })
    }
  }

  return { id, diagnosis: c.diagnosis, skipped: false, issues }
}

// ── Main ──────────────────────────────────────────────────────────────────────

let cases = await loadFromSupabase()
if (!cases) {
  const dirs = dirArg ? [path.resolve(ROOT, dirArg)] : [path.join(ROOT, '.data', 'cases'), newestBackupDir()].filter(Boolean)
  cases = dirs.flatMap(loadFromDir)
  console.log(`[sanity] loaded ${cases.length} case file(s) from: ${dirs.join(', ')}`)
}
if (!cases.length) {
  console.error('[sanity] no cases found — pass --dir <folder of case JSON files>')
  process.exit(2)
}

const results = cases.map(({ id, caseData }) => auditCase(id, caseData))
const audited = results.filter(r => !r.skipped)
const failed = audited.filter(r => r.issues.some(i => i.severity === 'FAIL'))
const review = audited.filter(r => !failed.includes(r) && r.issues.some(i => i.severity === 'REVIEW'))

const report = {
  generatedAt: new Date().toISOString(),
  total: cases.length,
  skippedNoModel: results.filter(r => r.skipped).length,
  audited: audited.length,
  failed: failed.length,
  needsReview: review.length,
  results: results.filter(r => r.skipped === false && r.issues.length > 0),
}
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

console.log(`\n[sanity] ${audited.length}/${cases.length} cases have a reasoning model; ${report.skippedNoModel} skipped`)
for (const r of failed) {
  console.log(`  ✗ FAIL ${r.id} (${r.diagnosis})`)
  for (const i of r.issues.filter(i => i.severity === 'FAIL')) console.log(`      - ${i.detail}`)
}
for (const r of review) console.log(`  ⚠ REVIEW ${r.id} — ${r.issues.filter(i => i.severity === 'REVIEW').length} outlier shift(s)`)
console.log(`[sanity] report → ${path.relative(ROOT, outPath)}`)
console.log(failed.length ? `[sanity] ${failed.length} case(s) FAILED` : '[sanity] all audited cases pass')
process.exit(failed.length ? 1 : 0)

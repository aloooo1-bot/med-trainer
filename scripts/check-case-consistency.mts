/**
 * Sweep the case library for internal-consistency defects.
 *
 * Every check here came from auditing a real played case — the defects a
 * generation prompt asks for but cannot guarantee. Read-only: it reports and
 * exits, it never edits a case.
 *
 *   npx tsx scripts/check-case-consistency.mts                 # summary
 *   npx tsx scripts/check-case-consistency.mts --detail        # every issue
 *   npx tsx scripts/check-case-consistency.mts --code exam/missing-jvp
 *   npx tsx scripts/check-case-consistency.mts --errors        # errors only
 *   npx tsx scripts/check-case-consistency.mts --json > out.json
 *
 * Exit code is 1 when any ERROR-severity issue is found, so it can gate CI.
 */
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import type { ConsistencyIssue } from '../app/lib/caseConsistency'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(ROOT, '.env.local') })

// The .mjs twin, not caseTiers.ts: the latter imports `server-only`, which
// throws outside the Next runtime. Same joinCase, no framework dependency.
const { joinCase } = await import('../app/lib/server/caseTiers.mjs')
const { checkCaseConsistency } = await import('../app/lib/caseConsistency')

const args = process.argv.slice(2)
const detail = args.includes('--detail')
const errorsOnly = args.includes('--errors')
const asJson = args.includes('--json')
const onlyCode = args[args.indexOf('--code') + 1]?.startsWith('--') ? null : args[args.indexOf('--code') + 1]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(2)
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Paged: PostgREST caps a single response well below the library size.
const rows: Array<Record<string, unknown>> = []
for (let from = 0; ; from += 500) {
  const { data, error } = await db.from('cases')
    .select('id, system, difficulty, diagnosis, presentation_data, patient_knowledge, clinical_findings, ground_truth')
    .range(from, from + 499)
  if (error) { console.error('query failed:', error.message); process.exit(2) }
  if (!data?.length) break
  rows.push(...data)
  if (data.length < 500) break
}

interface Finding { id: string; system: string; difficulty: string; diagnosis: string; issue: ConsistencyIssue }
const findings: Finding[] = []

for (const r of rows as any[]) {
  const caseData = joinCase({
    presentation: r.presentation_data,
    patientKnowledge: r.patient_knowledge,
    clinicalFindings: r.clinical_findings,
    groundTruth: r.ground_truth,
  })
  for (const issue of checkCaseConsistency(caseData as never)) {
    if (errorsOnly && issue.severity !== 'error') continue
    if (onlyCode && issue.code !== onlyCode) continue
    findings.push({ id: r.id, system: r.system, difficulty: r.difficulty, diagnosis: r.diagnosis, issue })
  }
}

if (asJson) {
  console.log(JSON.stringify({ scanned: rows.length, findings }, null, 2))
  process.exit(findings.some(f => f.issue.severity === 'error') ? 1 : 0)
}

const byCode = new Map<string, Finding[]>()
for (const f of findings) {
  if (!byCode.has(f.issue.code)) byCode.set(f.issue.code, [])
  byCode.get(f.issue.code)!.push(f)
}

const affected = new Set(findings.map(f => f.id))
console.log(`\nscanned ${rows.length} cases — ${findings.length} issue(s) across ${affected.size} case(s)\n`)

for (const [code, list] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
  const sev = list[0].issue.severity.toUpperCase().padEnd(7)
  console.log(`${String(list.length).padStart(4)}  ${sev} ${code}`)
  for (const f of detail ? list : list.slice(0, 2)) {
    console.log(`        ${f.diagnosis.slice(0, 46).padEnd(48)} ${f.issue.message.slice(0, 96)}`)
    if (detail) console.log(`        └─ ${f.id}  (${f.system} / ${f.difficulty})  field: ${f.issue.field}`)
  }
  if (!detail && list.length > 2) console.log(`        … ${list.length - 2} more (use --detail)`)
}

const errorCount = findings.filter(f => f.issue.severity === 'error').length
console.log(`\n${errorCount} error(s), ${findings.length - errorCount} warning(s)`)
process.exit(errorCount > 0 ? 1 : 0)

/**
 * Audit: key questions pre-answered by their own case's HPI.
 *
 * The generator's schema requires each keyQuestion to elicit a HIDDEN history
 * item, but some cases author questions whose answers sit verbatim in the HPI
 * the student is shown (e.g. the cerebral-abscess case asks about dental
 * procedures while its HPI states "recent dental work for a periapical
 * abscess"). The grading-side PRE-ANSWERED rule neutralizes these at grade
 * time; this audit finds the offending cases so the data can eventually be
 * fixed at the source.
 *
 * Detection only — reads the DB, writes nothing but a local report file.
 * No AI calls, no credits.
 *
 * Usage: node scripts/audit-key-questions.mjs
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

/** Question scaffolding + generic words that carry no clinical content. */
const STOPWORDS = new Set([
  'have', 'you', 'your', 'any', 'ever', 'been', 'had', 'has', 'are', 'was', 'were',
  'recent', 'recently', 'history', 'known', 'episodes', 'episode', 'experienced',
  'noticed', 'currently', 'taking', 'other', 'over', 'past', 'with', 'and', 'the',
  'this', 'that', 'these', 'what', 'when', 'where', 'how', 'often', 'much', 'many',
  'does', 'did', 'do', 'like', 'such', 'including', 'anything', 'something', 'new',
  'tell', 'about', 'describe', 'from', 'for', 'into', 'during', 'before', 'after',
  'similar', 'previous', 'prior', 'family', // "family history of X" — X is the content
  'use', 'used', 'using',
])

/** Light stem so "seizures"/"seizure", "fevers"/"fever", "smoking"/"smoke" align. */
function stem(w) {
  let s = w
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y'
  else if (s.length > 3 && s.endsWith('es')) s = s.slice(0, -2)
  else if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1)
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3)
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2)
  return s
}

function tokens(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
    .map(stem)
}

/** The HPI the student actually sees at this row's difficulty (selectHpiForDifficulty). */
function visibleHpi(c, difficulty) {
  if (difficulty === 'Clinical' && c.clinicalHpi) return c.clinicalHpi
  if (difficulty === 'Advanced' && c.advancedHpi) return c.advancedHpi
  return c.hpi
}

async function fetchCases() {
  const rows = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, case_data')
      .range(offset, offset + 99)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 100) break
    offset += 100
  }
  return rows
}

const rows = await fetchCases()
const findings = []
let questionsChecked = 0

for (const row of rows) {
  const c = row.case_data
  if (!c?.keyQuestions?.length) continue
  const hpiText = `${visibleHpi(c, row.difficulty) ?? ''} ${c.patientInfo?.chiefComplaint ?? ''}`
  const hpiTokens = new Set(tokens(hpiText))
  if (hpiTokens.size === 0) continue

  const hits = []
  for (const q of c.keyQuestions) {
    questionsChecked++
    const qTokens = [...new Set(tokens(q))]
    if (qTokens.length === 0) continue
    const matched = qTokens.filter(t => hpiTokens.has(t))
    if (matched.length === 0) continue
    const coverage = matched.length / qTokens.length
    // "Similar episodes before?" questions name the presenting symptom (which
    // the HPI of course states) but probe PRIOR history — hidden substance the
    // token overlap can't see. Classify separately as likely-legitimate.
    const recurrence = /\b(similar|before|previous(ly)?|prior|in the past|ever had)\b/i.test(q)
    hits.push({
      question: q,
      matched,
      coverage: Math.round(coverage * 100) / 100,
      severity: recurrence ? 'RECURRENCE' : coverage >= 0.6 ? 'FULL' : 'PARTIAL',
    })
  }
  if (hits.length) {
    findings.push({
      id: row.id,
      system: row.system,
      difficulty: row.difficulty,
      diagnosis: row.diagnosis,
      hpi: visibleHpi(c, row.difficulty),
      hits,
    })
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const fullCount = findings.reduce((n, f) => n + f.hits.filter(h => h.severity === 'FULL').length, 0)
const partialCount = findings.reduce((n, f) => n + f.hits.filter(h => h.severity === 'PARTIAL').length, 0)
const recurrenceCount = findings.reduce((n, f) => n + f.hits.filter(h => h.severity === 'RECURRENCE').length, 0)

// Worst first: cases with the most FULL hits, then most hits overall.
findings.sort((a, b) =>
  b.hits.filter(h => h.severity === 'FULL').length - a.hits.filter(h => h.severity === 'FULL').length
  || b.hits.length - a.hits.length)

const LABEL = { FULL: '✗ FULL      ', PARTIAL: '· partial   ', RECURRENCE: '~ recurrence' }
for (const f of findings.filter(f => f.hits.some(h => h.severity === 'FULL'))) {
  console.log(`\n${f.id} [${f.system} / ${f.difficulty}] — ${f.diagnosis}`)
  for (const h of f.hits) {
    console.log(`  ${LABEL[h.severity]} (${Math.round(h.coverage * 100)}%) "${h.question}"`)
    console.log(`                matched: ${h.matched.join(', ')}`)
  }
}

console.log(`\n────────────────────────────────────────`)
console.log(`Cases scanned:            ${rows.length}`)
console.log(`Key questions checked:    ${questionsChecked}`)
console.log(`Cases with any overlap:   ${findings.length}`)
console.log(`FULL pre-answered:        ${fullCount} question(s) across ${findings.filter(f => f.hits.some(h => h.severity === 'FULL')).length} case(s)  ← the data defects`)
console.log(`RECURRENCE overlap:       ${recurrenceCount} question(s) — "similar episodes before?" style; hidden substance, likely fine`)
console.log(`PARTIAL overlap:          ${partialCount} question(s) — some shared words; question retains hidden substance`)

const reportPath = path.join(__dirname, 'key-question-audit-report.json')
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  casesScanned: rows.length,
  questionsChecked,
  casesWithOverlap: findings.length,
  fullCount,
  recurrenceCount,
  partialCount,
  findings,
}, null, 2))
console.log(`\nReport written to ${path.relative(ROOT, reportPath)}`)

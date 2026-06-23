/**
 * Extract compact clinical digests from all locally-available cases
 * (student-audit transcripts + audit_results backup) for medical-accuracy review.
 * The live Supabase library is unreachable (project deleted), so these snapshots
 * are the best-available corpus.
 *
 * Writes scripts/digests/<system>-<difficulty>-<slug>.md
 * and scripts/digests/_ALL.md (concatenated).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'scripts', 'digests')
fs.mkdirSync(OUT, { recursive: true })

function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) }

// ── collect cases from both sources ─────────────────────────────────────
const cases = []  // { system, difficulty, diagnosis, c (caseData), src }

// transcripts
for (let i = 1; i <= 36; i++) {
  const p = path.join(ROOT, 'scripts/student-audit/artifacts/transcripts', `case-${String(i).padStart(2, '0')}.json`)
  if (!fs.existsSync(p)) continue
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  const c = j.caseData
  if (!c) continue
  const dx = j.correctDiagnosis || c.diagnosis || c.correctDiagnosis || 'UNKNOWN'
  cases.push({ system: j.system, difficulty: j.difficulty, diagnosis: dx, c, src: `transcript case-${i}` })
}

// NOTE: audit_results.backup.json stores only trimmed caseData (no labResults/hpi),
// so it is not usable for medical-accuracy review. Transcripts are the full corpus.

// dedupe by system|difficulty|diagnosis (keep first = transcript preferred)
const seen = new Map()
for (const x of cases) {
  const k = `${x.system}|${x.difficulty}|${x.diagnosis}`
  if (!seen.has(k)) seen.set(k, x)
}
const list = [...seen.values()]

// ── render a compact digest ──────────────────────────────────────────────
function labLine(name, result) {
  if (!result) return `${name}: (no result)`
  if (typeof result === 'string') return `${name}: ${result}`
  const comps = (result.components || [])
  if (!comps.length) return `${name}: ${JSON.stringify(result).slice(0, 120)}`
  const parts = comps.map(x => {
    const flag = x.status && x.status !== 'normal' ? ` [${x.status.toUpperCase()}]` : ''
    return `${x.name} ${x.value}${x.unit ? ' ' + x.unit : ''}${flag} (ref ${x.referenceRange || '?'})`
  })
  return `${name}: ${parts.join('; ')}`
}

function digest(x) {
  const c = x.c
  const L = []
  L.push(`## ${x.system} / ${x.difficulty} — ${x.diagnosis}`)
  L.push(`_src: ${x.src}_`)
  L.push('')
  const pi = c.patientInfo || {}
  L.push(`**Patient:** ${pi.age ?? '?'}yo ${pi.gender ?? '?'} — CC: ${pi.chiefComplaint ?? '?'}`)
  const v = c.vitals || {}
  L.push(`**Vitals:** BP ${v.bp ?? '?'} | HR ${v.hr ?? '?'} | RR ${v.rr ?? '?'} | Temp ${v.temp ?? '?'}°F | SpO2 ${v.spo2 ?? '?'}% | Wt ${v.weight ?? '?'}`)
  L.push('')
  L.push(`**HPI:** ${c.hpi ?? c.clinicalHpi ?? '(none)'}`)
  if (c.advancedHpi) L.push(`**Advanced HPI:** ${c.advancedHpi}`)
  L.push('')
  if (c.hiddenHistory?.fullHistory) L.push(`**Hidden history:** ${c.hiddenHistory.fullHistory}`)
  if (c.pastMedicalHistory) L.push(`**PMH:** ${JSON.stringify(c.pastMedicalHistory)}`)
  if (c.currentMedications) L.push(`**Meds:** ${JSON.stringify(c.currentMedications)}`)
  L.push('')
  // physical exam
  const pe = c.physicalExam || {}
  const peEntries = Object.entries(pe).filter(([, v]) => v && String(v).length > 3)
  if (peEntries.length) {
    L.push(`**Physical exam:**`)
    for (const [r, f] of peEntries) L.push(`- ${r}: ${f}`)
    L.push('')
  }
  // labs
  const lr = c.labResults || {}
  const labKeys = Object.keys(lr)
  if (labKeys.length) {
    L.push(`**Labs:**`)
    for (const k of labKeys) L.push(`- ${labLine(k, lr[k])}`)
    L.push('')
  }
  // imaging / ecg / special findings
  const ir = c.imagingResults || {}
  if (Object.keys(ir).length) {
    L.push(`**Imaging:**`)
    for (const [k, val] of Object.entries(ir)) L.push(`- ${k}: ${val}`)
    L.push('')
  }
  const pr = c.procedureResults || {}
  if (Object.keys(pr).length) {
    L.push(`**Procedures:**`)
    for (const [k, val] of Object.entries(pr)) L.push(`- ${k}: ${val}`)
    L.push('')
  }
  for (const f of ['ecgFindings', 'hematologyFindings', 'urineFindings', 'skinFindings', 'fundusFindings', 'biopsyFindings']) {
    if (c[f]) L.push(`**${f}:** ${c[f]}`)
  }
  L.push('')
  if (c.differentials?.length) L.push(`**Differentials:** ${c.differentials.join(' | ')}`)
  if (c.differentialExplanations?.length) L.push(`**Diff explanations:** ${c.differentialExplanations.join(' | ')}`)
  if (c.keyQuestions?.length) L.push(`**Key questions:** ${c.keyQuestions.join(' | ')}`)
  if (c.expectedLabs?.length) L.push(`**Expected labs:** ${c.expectedLabs.join(', ')}`)
  if (c.teachingPoints?.length) {
    L.push(`**Teaching points:**`)
    for (const t of c.teachingPoints) L.push(`- ${t}`)
  }
  L.push('')
  L.push('---')
  return L.join('\n')
}

list.sort((a, b) => (a.system + a.difficulty + a.diagnosis).localeCompare(b.system + b.difficulty + b.diagnosis))
const all = []
for (const x of list) {
  const d = digest(x)
  const fname = `${slug(x.system)}__${slug(x.difficulty)}__${slug(x.diagnosis)}.md`
  fs.writeFileSync(path.join(OUT, fname), d)
  all.push(d)
}
fs.writeFileSync(path.join(OUT, '_ALL.md'), all.join('\n\n'))
console.log(`Wrote ${list.length} digests to scripts/digests/`)
console.log(`_ALL.md size: ${(all.join('\n\n').length / 1024).toFixed(0)} KB`)

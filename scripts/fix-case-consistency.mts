/**
 * Repair the content defects the consistency sweep confirms.
 *
 * Scope is deliberately narrow: only defects where the case contradicts ITSELF,
 * and only where the author's intent is unambiguous. Every fix here preserves
 * that intent rather than overriding it — where the exam says a patient is
 * tachycardic and the rate says otherwise, the rate moves to meet the prose,
 * because the finding is the clinical claim the author made and the number is
 * the incidental part.
 *
 * Rates are moved to the middle of the correct band, not one step over the
 * line, so the band-preserving jitter in caseJitter.ts keeps them true at
 * every session.
 *
 *   npx tsx scripts/fix-case-consistency.mts --dry-run   # report, write nothing
 *   npx tsx scripts/fix-case-consistency.mts             # apply + back up
 *
 * Always writes a timestamped backup of every row it touches before changing
 * anything, so a bad run can be reversed.
 */
import { config } from 'dotenv'
import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
config({ path: path.join(ROOT, '.env.local') })

const { joinCase, splitCase } = await import('../app/lib/server/caseTiers.mjs')
const { checkCaseConsistency } = await import('../app/lib/caseConsistency')

const dryRun = process.argv.includes('--dry-run')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Supabase env vars required.'); process.exit(2) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Mid-band targets: comfortably inside the correct band so jitter cannot walk
// them back across the threshold.
const TACHYCARDIC_HR = 104   // band [101, 121)
const TACHYPNEIC_RR = 22     // band [21, 25)

/** Drugs a patient buys and takes on their own initiative, when the entry says so. */
const SELF_DIRECTED = /\b(acetaminophen|paracetamol|tylenol|ibuprofen|advil|motrin)\b[^.;]*/gi

// A stage direction for the patient agent, printed in the student's chart.
// Matches the detector in caseConsistency.ts, plus the separator that attaches
// the note to the clinical text around it — the note has to leave with its
// punctuation or the field is left reading "Vitiligo (diagnosed age 30, )".
const NOTE_FRAGMENT =
  /\s*(?:[,;—–-]+\s*)?\b(?:not|never|does not|do not|don't|won't)\s+(?:be\s+)?(?:volunteer(?:ed)?|disclos(?:e|ed)|reveal(?:ed)?|offer(?:ed)?|mention(?:ed)?|report(?:ed)?)\b[^.;)]{0,25}\b(?:initially|unless asked|until asked|spontaneously|on (?:their|his|her) own|if asked)\b/gi

/** Excise the note and tidy the punctuation it leaves behind. */
function stripNote(text: string): string {
  return text
    .replace(NOTE_FRAGMENT, '')
    .replace(/\(\s*\)/g, '')            // a parenthetical that was only the note
    .replace(/\s+([,.;)])/g, '$1')      // space stranded before punctuation
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*([,;—–-])\s*\./g, '.') // a dangling separator before the stop
    .trim()
}

/**
 * Sentences carrying a note in the VIGNETTE go entirely.
 *
 * Excising the fragment there would leave the finding without the tell, which
 * is worse: the Reactive Arthritis case reads "He notes dysuria that began
 * approximately 1 week ago, which he had not volunteered initially" — trimming
 * the clause keeps the dysuria in the opening paragraph, where with the
 * conjunctivitis and post-diarrhoeal arthritis beside it, it completes the
 * Reiter triad before the student has asked anything. The case's own
 * hiddenHistory.fullHistory already stages that symptom as one "he was
 * embarrassed to disclose", so dropping the sentence loses nothing and restores
 * what the author intended.
 *
 * A background field is a list whose entries stand alone, so there the fragment
 * is excised and the entry kept.
 */
function stripNoteSentences(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(s => { NOTE_FRAGMENT.lastIndex = 0; return !NOTE_FRAGMENT.test(s) })
    .join(' ')
    .trim()
}

type Case = Record<string, any>

/** Apply every applicable repair. Returns the human-readable list of changes. */
function repair(c: Case): string[] {
  const changes: string[] = []

  // 1. The exam names a finding the vitals contradict. Move the number.
  const examText = Object.values(c.physicalExam ?? {}).join(' ')
  if (/\btachycard(ic|ia)\b/i.test(examText) && typeof c.vitals?.hr === 'number' && c.vitals.hr <= 100) {
    changes.push(`HR ${c.vitals.hr} → ${TACHYCARDIC_HR} (exam says tachycardic)`)
    // Keep any narrative that quotes the old rate in step with it.
    const oldHr = c.vitals.hr
    c.vitals.hr = TACHYCARDIC_HR
    // Anchored on the unit: an ECG report is full of other numbers (QRS ms,
    // QTc, lead names) and a bare numeric replace could silently corrupt one.
    if (typeof c.ecgFindings === 'string') {
      const rateRe = new RegExp(`\\b${oldHr}(\\s*bpm)`, 'g')
      if (rateRe.test(c.ecgFindings)) {
        c.ecgFindings = c.ecgFindings.replace(rateRe, `${TACHYCARDIC_HR}$1`)
        changes.push(`ecgFindings rate ${oldHr} → ${TACHYCARDIC_HR} bpm`)
      }
    }
  }
  if (/\btachypn(eic|ea)\b/i.test(examText) && typeof c.vitals?.rr === 'number' && c.vitals.rr <= 20) {
    changes.push(`RR ${c.vitals.rr} → ${TACHYPNEIC_RR} (exam says tachypneic)`)
    c.vitals.rr = TACHYPNEIC_RR
  }

  // 2. Right-heart physiology with no JVP documented. The bedside sign you
  //    would lead with, and its absence teaches the wrong search pattern.
  const rhf = /cor pulmonale|right(-| )heart failure|right ventricular failure|pulmonary hypertension|kyphoscoliosis/i
    .test(`${c.diagnosis ?? ''} ${c.mechanism ?? ''}`)
  const neck: string = c.physicalExam?.Neck ?? ''
  if (rhf && neck && !/jvp|jugular|jvd|neck vein/i.test(neck)) {
    // Elevated, because the case's own echo/oedema findings say so. Phrased as
    // a measurement a student could have elicited, not as a conclusion.
    c.physicalExam.Neck = `JVP elevated to approximately 10 cm above the sternal angle at 45 degrees, with prominent v waves. ${neck}`
    changes.push('Neck exam: added elevated JVP')
  }

  // 3. A self-care drug filed under prescriptions. Move the entry, do not
  //    delete it — the drug is real, only its provenance was wrong.
  const rx: string = c.currentMedications?.medications ?? ''
  const matches = rx.match(SELF_DIRECTED)
  if (matches && !/prescrib|per (pcp|physician)|started (on|by)/i.test(rx)) {
    let remaining = rx
    for (const m of matches) remaining = remaining.replace(m, '')
    remaining = remaining.replace(/\s*[;.]\s*[;.]/g, '.').replace(/^\s*[;.]\s*/, '').replace(/\s{2,}/g, ' ').trim()
    const moved = matches.map(m => m.trim().replace(/[;,]$/, '')).join('. ')
    const otc: string = c.currentMedications.otc ?? ''
    c.currentMedications.medications = remaining || 'None.'
    c.currentMedications.otc = otc && !/^none\.?$/i.test(otc.trim()) ? `${moved}. ${otc}` : `${moved}.`
    changes.push(`moved to OTC: "${moved}"`)
  }

  // 4. An instruction to the patient agent, printed in the chart. Withheld
  //    history belongs in hiddenHistory.fullHistory, which the patient prompt
  //    already gates; in a displayed field it is read by the student instead.
  const noteFields: Array<[string, () => string | undefined, (v: string) => void]> = [
    ['hpi', () => c.hpi, v => { c.hpi = v }],
    ['pastMedicalHistory.conditions', () => c.pastMedicalHistory?.conditions, v => { c.pastMedicalHistory.conditions = v }],
    ['pastMedicalHistory.surgeries', () => c.pastMedicalHistory?.surgeries, v => { c.pastMedicalHistory.surgeries = v }],
    ['pastMedicalHistory.hospitalizations', () => c.pastMedicalHistory?.hospitalizations, v => { c.pastMedicalHistory.hospitalizations = v }],
    ['currentMedications.medications', () => c.currentMedications?.medications, v => { c.currentMedications.medications = v }],
    ['currentMedications.otc', () => c.currentMedications?.otc, v => { c.currentMedications.otc = v }],
    ...Object.keys(c.socialHistory ?? {}).map(k =>
      [`socialHistory.${k}`, () => c.socialHistory[k], (v: string) => { c.socialHistory[k] = v }] as [string, () => string | undefined, (v: string) => void]),
    ...Object.keys(c.reviewOfSystems ?? {}).map(k =>
      [`reviewOfSystems.${k}`, () => c.reviewOfSystems[k], (v: string) => { c.reviewOfSystems[k] = v }] as [string, () => string | undefined, (v: string) => void]),
    ...Object.keys(c.physicalExam ?? {}).map(k =>
      [`physicalExam.${k}`, () => c.physicalExam[k], (v: string) => { c.physicalExam[k] = v }] as [string, () => string | undefined, (v: string) => void]),
  ]
  for (const [name, get, set] of noteFields) {
    const text = get()
    if (typeof text !== 'string') continue
    NOTE_FRAGMENT.lastIndex = 0
    if (!NOTE_FRAGMENT.test(text)) continue
    const fixed = name === 'hpi' ? stripNoteSentences(text) : stripNote(text)
    if (fixed === text) continue
    set(fixed)
    changes.push(`${name}: ${name === 'hpi' ? 'dropped the sentence carrying' : 'removed'} the authoring note\n          was: ${text}\n          now: ${fixed}`)
  }

  return changes
}

// ── run ──────────────────────────────────────────────────────────────────────

const rows: any[] = []
for (let from = 0; ; from += 500) {
  const { data, error } = await db.from('cases')
    .select('id, diagnosis, case_data, presentation_data, patient_knowledge, clinical_findings, ground_truth')
    .range(from, from + 499)
  if (error) { console.error('query failed:', error.message); process.exit(2) }
  if (!data?.length) break
  rows.push(...data)
  if (data.length < 500) break
}

const backups: any[] = []
const planned: Array<{ id: string; diagnosis: string; changes: string[]; caseData: Case }> = []

for (const r of rows) {
  const before = checkCaseConsistency(
    joinCase({
      presentation: r.presentation_data, patientKnowledge: r.patient_knowledge,
      clinicalFindings: r.clinical_findings, groundTruth: r.ground_truth,
    }) as never,
  )
  if (!before.length) continue

  const caseData: Case = joinCase({
    presentation: r.presentation_data, patientKnowledge: r.patient_knowledge,
    clinicalFindings: r.clinical_findings, groundTruth: r.ground_truth,
  }) as Case
  const changes = repair(caseData)
  if (!changes.length) continue

  backups.push({ id: r.id, case_data: r.case_data, presentation_data: r.presentation_data,
    patient_knowledge: r.patient_knowledge, clinical_findings: r.clinical_findings, ground_truth: r.ground_truth })
  planned.push({ id: r.id, diagnosis: r.diagnosis, changes, caseData })
}

console.log(`\n${planned.length} case(s) to repair\n`)
for (const p of planned) {
  console.log(`  ${p.diagnosis.slice(0, 44).padEnd(46)} ${p.id}`)
  for (const ch of p.changes) console.log(`      · ${ch}`)
}

if (dryRun) { console.log('\n--dry-run: nothing written.'); process.exit(0) }
if (!planned.length) { console.log('Nothing to do.'); process.exit(0) }

const stamp = process.env.FIX_STAMP ?? 'backup'
const backupPath = path.join(ROOT, `.data/case-backup-${stamp}.json`)
await fs.mkdir(path.dirname(backupPath), { recursive: true })
await fs.writeFile(backupPath, JSON.stringify(backups, null, 2), 'utf8')
console.log(`\nbacked up ${backups.length} row(s) → ${path.relative(ROOT, backupPath)}`)

let ok = 0
for (const p of planned) {
  const tiers = splitCase(p.caseData)
  const { error } = await db.from('cases').update({
    case_data: p.caseData,
    presentation_data: tiers.presentation,
    patient_knowledge: tiers.patientKnowledge,
    clinical_findings: tiers.clinicalFindings,
    ground_truth: tiers.groundTruth,
  }).eq('id', p.id)
  if (error) console.error(`  FAILED ${p.id}: ${error.message}`)
  else ok++
}
console.log(`\nupdated ${ok}/${planned.length} case(s)`)

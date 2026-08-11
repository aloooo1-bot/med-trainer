/**
 * One-off data fix: replace the 8 key questions the 2026-08-11 audit found
 * pre-answered by their own case's visible HPI (scripts/key-question-audit-report.json).
 *
 * Each replacement targets information verified to exist in THAT case's
 * hiddenHistory (so the patient agent can answer it and the grader can fairly
 * score it) and not already covered by the case's other key questions.
 *
 * Updates BOTH case_data and the served ground_truth tier. Idempotent: a row
 * whose old question is already gone is skipped with a note.
 *
 * Usage: node scripts/fix-preanswered-key-questions.mjs [--dry-run]
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { splitCase } from '../app/lib/server/caseTiers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const dryRun = process.argv.includes('--dry-run')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

/** old → new, per case. Grounding for each replacement is in the comment. */
const REPLACEMENTS = {
  // Hidden: tooth extraction with only 3 days of a prescribed amoxicillin course
  // — the seeding mechanism. Seizures/weakness (old Q) are stated in the HPI.
  'img-MPX2266_synpic21022': {
    old: 'Have you had episodes of confusion, seizures, or new weakness?',
    new: 'Did you take antibiotics after the dental procedure, and did you finish the full course?',
  },
  // Hidden: "completely anorexic" — classic appendicitis discriminator. Pain
  // migration (old Q) is narrated in the HPI. Worded without any HPI phrasing
  // ("since the pain began") so the audit heuristic stays clean.
  'gastrointestinal-foundations-acute-appendicitis-0': {
    old: 'Where exactly did the pain start, and has it moved since it began?',
    new: 'How is your appetite — have you felt like eating today?',
  },
  // Hidden: "denies rhinorrhea or nasal congestion; mild sore throat" — the
  // pertinent negative separating influenza from a common cold. Vaccination
  // status (old Q) is stated in the HPI.
  'infectious-clinical-influenza-0': {
    old: 'Have you received an influenza vaccine this season?',
    new: 'Do you have a runny nose, nasal congestion, or sore throat along with these symptoms?',
  },
  // Hidden: "gradually increased his exercise tolerance … denies dyspnea" —
  // functional status on exertion, the substance of a post-CABG follow-up.
  // Rest-symptom denials (old Q) are stated in the HPI.
  'img-MPX1580_synpic57545': {
    old: 'Have you had any chest pain, pressure, or shortness of breath since your surgery?',
    new: 'How much activity can you manage now — do you get chest pain or breathlessness when you exert yourself?',
  },
  // Hidden: "He has not had a screening colonoscopy" + father with colon cancer
  // — the malignancy-workup pivot. Weight loss (old Q) is stated in the HPI.
  'img-MPX1161_synpic40025': {
    old: 'Have you had any unintentional weight loss?',
    new: 'Have you ever had a colonoscopy or any other colon cancer screening?',
  },
  // Hidden: "never been hospitalized for pneumonia" — recurrence/obstruction
  // signal. Travel/sick-contact denials (old Q) are stated in the HPI (and the
  // hidden history's sick grandchild contradicts that HPI denial, so the
  // replacement deliberately avoids the contact question entirely).
  'img-MPX2313_synpic27141-clinical': {
    old: 'Have you had any recent travel, exposure to sick contacts, or known TB exposure?',
    new: 'Have you ever had pneumonia before, or been hospitalized for a lung infection?',
  },
  // Hidden: "She is not pregnant. Her last menstrual period was 10 days ago" —
  // pivotal for antibiotic choice. Fever/back-pain denials (old Q) are in the HPI.
  'local-urine-uti-0': {
    old: 'Do you have any flank or back pain, fever, or chills?',
    new: 'Is there any chance you could be pregnant — when was your last menstrual period?',
  },
  // Hidden: "Apgars 3/5/7. Infant was intubated in the delivery room." The old
  // question restated exam findings the HPI already gives (scaphoid abdomen,
  // displaced heart sounds) — and was an exam maneuver, not history.
  'img-MPX1896_synpic27390': {
    old: 'Is the abdomen scaphoid, and where are the heart sounds best auscultated?',
    new: 'What were the Apgar scores, and what resuscitation was required in the delivery room?',
  },
}

let changed = 0, skipped = 0, failed = 0
for (const [id, { old, new: next }] of Object.entries(REPLACEMENTS)) {
  const { data, error } = await supabase.from('cases').select('id, case_data, ground_truth').eq('id', id).single()
  if (error || !data) { console.error(`✗ ${id}: fetch failed — ${error?.message}`); failed++; continue }

  const c = data.case_data
  const idx = (c.keyQuestions ?? []).indexOf(old)
  if (idx === -1) { console.log(`· ${id}: old question not present (already fixed?) — skipped`); skipped++; continue }

  const keyQuestions = [...c.keyQuestions]
  keyQuestions[idx] = next
  const nextCase = { ...c, keyQuestions }

  console.log(`${dryRun ? '[dry] ' : ''}✓ ${id}`)
  console.log(`    − ${old}`)
  console.log(`    + ${next}`)
  if (dryRun) { changed++; continue }

  // Tiered rows are served from ground_truth — keep both columns in step.
  const update = { case_data: nextCase }
  if (data.ground_truth) update.ground_truth = splitCase(nextCase).groundTruth
  const { error: upErr } = await supabase.from('cases').update(update).eq('id', id)
  if (upErr) { console.error(`✗ ${id}: update failed — ${upErr.message}`); failed++; continue }
  changed++
}

console.log(`\n${changed} updated, ${skipped} skipped, ${failed} failed${dryRun ? ' (dry run — nothing written)' : ''}`)
if (failed > 0) process.exit(1)

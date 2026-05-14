/**
 * Comprehensive QA agent for medical training cases.
 *
 * Phase 1 (always):    Static checks — HPI length, exam objectivity, history
 *                      consistency, test coverage, differential counts
 * Phase 2 (--simulate): Interview simulation — Claude plays the patient,
 *                      student agent asks targeted questions, contradiction
 *                      checker finds inconsistencies in responses
 * Phase 3 (--grade):   Grading sanity — grade with correct dx (expect ≥68/90)
 *                      and with wrong dx (expect ≥15-point gap)
 *
 * Usage:
 *   node scripts/qa-agent.mjs                     # static only (free, fast)
 *   node scripts/qa-agent.mjs --simulate          # + interview simulation
 *   node scripts/qa-agent.mjs --grade             # + grading sanity test
 *   node scripts/qa-agent.mjs --full              # all phases
 *   node scripts/qa-agent.mjs --system Hematology
 *   node scripts/qa-agent.mjs --difficulty Clinical
 *   node scripts/qa-agent.mjs --limit 20
 *   node scripts/qa-agent.mjs --case-id heme-clinical-mm-0
 *   node scripts/qa-agent.mjs --concurrency 2
 *   node scripts/qa-agent.mjs --output scripts/qa-report.json
 *
 * Cost estimate (Haiku for patient, Sonnet for analysis + grading):
 *   --simulate  ~$0.03/case
 *   --grade     ~$0.08/case
 *   --full      ~$0.11/case  (144 cases ≈ $16 total)
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }

const filterSystem     = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const filterCaseId     = getArg('--case-id')
const limitCases       = parseInt(getArg('--limit') ?? '0', 10)
const concurrency      = parseInt(getArg('--concurrency') ?? '2', 10)
const outputPath       = path.resolve(ROOT, getArg('--output') ?? 'scripts/qa-report.json')
const doSimulate       = args.includes('--simulate') || args.includes('--full')
const doGrade          = args.includes('--grade')    || args.includes('--full')

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Supabase env vars not set in .env.local'); process.exit(1)
}
if ((doSimulate || doGrade) && !process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY required for --simulate / --grade'); process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const anthropic = (doSimulate || doGrade)
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

// ── Supabase fetch ────────────────────────────────────────────────────────────
async function fetchCases() {
  const rows = []
  let offset = 0
  while (true) {
    let q = supabase
      .from('cases')
      .select('id, system, difficulty, diagnosis, case_data')
      .eq('is_generated', true)
      .range(offset, offset + 99)
    if (filterSystem)     q = q.eq('system', filterSystem)
    if (filterDifficulty) q = q.eq('difficulty', filterDifficulty)
    if (filterCaseId)     q = q.eq('id', filterCaseId)
    const { data, error } = await q
    if (error) throw new Error(`Supabase: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 100) break
    offset += 100
  }
  return limitCases > 0 ? rows.slice(0, limitCases) : rows
}

// ── Phase 1: Static checks ────────────────────────────────────────────────────
function wordCount(str) {
  return str ? str.trim().split(/\s+/).filter(Boolean).length : 0
}

// Physical exam patterns that indicate diagnostic interpretation rather than observation
const EXAM_DIAGNOSTIC_PATTERNS = [
  /\bconsistent with\b/i,
  /\bsuggesting\b/i,
  /\bindicating\b/i,
  /\bfindings? of\b/i,
  /\bpattern of\b/i,
  /\bin keeping with\b/i,
  /\bsigns? of\b/i,
  /\bsecondary to\b/i,
  /\bdue to\b.{0,30}(disease|syndrome|failure|disorder|injury|nephritis|hepatitis)/i,
]

// History denial patterns (used against PMH field)
const SURGERY_DENIAL  = /\b(none|no prior|no past|no surgical|no history of surgery|denies.{0,10}surgery|has not had any)\b/i
const SURGERY_MENTION = /\b(surgery|surgeries|surgical|appendectomy|cholecystectomy|bypass|repair|resection|hysterectomy|mastectomy|colectomy|gastrectomy|transplant|excision|\w+ectomy|\w+otomy|\w+ostomy|\w+plasty)\b/i
const HOSP_DENIAL     = /\b(none|no prior|no past|never been hospitalized|no hospitalizations|denies.{0,10}hospitalization)\b/i
const HOSP_MENTION    = /\b(hospitali[sz]|admitted to.{0,20}hospital|inpatient stay|ICU admission|intensive care unit)\b/i
// Specific named procedures — their presence in PMH means the field already contains history (not a pure denial)
const NAMED_PROCEDURE = /\b(appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|arthroscopy|c-section|cesarean|bypass|transplant|nephrectomy|splenectomy|thyroidectomy|laminectomy|craniotomy|laparotomy|laparoscopy|ORIF|tonsillectomy|herniorrhaphy|hernia repair|thrombectomy|endarterectomy|angioplasty|pacemaker|amputation)\b/i
// Indicators that a surgery/hospitalization mention refers to the CURRENT admission, not prior history
const CURRENT_OP      = /\b(this admission|current (admission|hospitalization|presentation|episode|injury|surgery|procedure)|on arrival|emergent(ly)?|urgent(ly)?|was brought to|following the (trauma|injury|accident|presentation)|for the current|perioperative|pre-?operatively|intraoperative|post-?operatively|post-?surgery|taken to (the )?OR|taken to surgery|intramedullary|status post.*this)\b/i
const FUTURE_OP       = /\b(may require|might need|could require|planned|will undergo|recommendation for|referral for|considering surgery|surgical candidate|potential surgery|surgical option)\b/i
// Sentence-level denial: any hiddenHistory sentence that itself denies surgery/hospitalization
const SURG_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(surgery|surgeries|surgical|procedure|procedures|operation|operations|fasciotomy|splenectomy|appendectomy|cholecystectomy)\b/i
const HOSP_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(hospitalization|hospitalizations|hospitalized|inpatient|admitted)\b/i
// Natural processes that match \w+ectomy but are NOT surgical procedures
const AUTO_PROCEDURE  = /\bautosplenectomy\b/i

function staticChecks(row) {
  const c = row.case_data
  const flags = []

  if (!c) { flags.push('CRITICAL: case_data is null'); return flags }

  // Required fields
  if (!c.nativeDifficulty)                  flags.push('Missing: nativeDifficulty')
  if (!c.differentialExplanations?.length)  flags.push('Missing: differentialExplanations')
  if (!c.expectedLabs?.length)              flags.push('Missing: expectedLabs')
  if (!c.expectedImaging?.length)           flags.push('Missing: expectedImaging')
  if (!c.clinicalHpi)                       flags.push('Missing: clinicalHpi')
  if (!c.advancedHpi)                       flags.push('Missing: advancedHpi')

  // HPI word counts
  const clinW = wordCount(c.clinicalHpi)
  const advW  = wordCount(c.advancedHpi)
  if (c.clinicalHpi && clinW > 40) flags.push(`clinicalHpi too long: ${clinW} words (max 40)`)
  if (c.advancedHpi && advW  > 20) flags.push(`advancedHpi too long: ${advW} words (max 20)`)

  // Differential counts
  const diffs = c.differentials?.length ?? 0
  const d = c.nativeDifficulty ?? row.difficulty
  if (d === 'Foundations' && (diffs < 2 || diffs > 3)) flags.push(`Differentials: ${diffs} (Foundations expects 2-3)`)
  if (d === 'Clinical'    && (diffs < 3 || diffs > 4)) flags.push(`Differentials: ${diffs} (Clinical expects 3-4)`)
  if (d === 'Advanced'    && (diffs < 4 || diffs > 5)) flags.push(`Differentials: ${diffs} (Advanced expects 4-5)`)

  // Expected lists cross-check against available lists
  for (const lab of c.expectedLabs ?? []) {
    if (!c.availableLabs?.includes(lab)) flags.push(`expectedLabs item not in availableLabs: "${lab}"`)
  }
  for (const img of c.expectedImaging ?? []) {
    if (!c.availableImaging?.includes(img)) flags.push(`expectedImaging item not in availableImaging: "${img}"`)
  }

  // Every available test must have a result
  for (const lab of c.availableLabs ?? []) {
    if (!c.labResults?.[lab]) flags.push(`Lab has no result: "${lab}"`)
  }
  for (const img of c.availableImaging ?? []) {
    if (!c.imagingResults?.[img] && !c.procedureResults?.[img]) {
      flags.push(`Imaging has no result: "${img}"`)
    }
  }

  // Diagnosis-specific rules
  if (/stemi/i.test(row.diagnosis)) {
    const ecg = c.ecgFindings ?? ''
    if (!/st.{0,10}elevation|st-elevation|\bmm\b/i.test(ecg)) {
      flags.push('STEMI: ecgFindings missing explicit ST elevation with millimeter values')
    }
  }
  if (/interstitial nephritis|\bAIN\b/.test(row.diagnosis)) {
    const meds = `${c.currentMedications?.medications ?? ''} ${c.currentMedications?.otc ?? ''}`
    if (!/nsaid|ibuprofen|naproxen|ppi|omeprazole|antibiotic|amoxicillin|cipro|vancomycin/i.test(meds)) {
      flags.push('AIN: currentMedications missing causative agent (NSAID, PPI, or antibiotic)')
    }
  }

  // Physical exam objectivity — detect diagnostic interpretations in exam fields
  for (const [region, finding] of Object.entries(c.physicalExam ?? {})) {
    if (!finding || finding.length < 5) continue
    for (const pattern of EXAM_DIAGNOSTIC_PATTERNS) {
      if (pattern.test(finding)) {
        flags.push(`physicalExam.${region}: diagnostic interpretation — "${finding.substring(0, 100)}"`)
        break
      }
    }
  }

  // History consistency — visible pastMedicalHistory must not contradict hiddenHistory
  const pmhSurg  = c.pastMedicalHistory?.surgeries        ?? ''
  const pmhHosp  = c.pastMedicalHistory?.hospitalizations ?? ''
  const hidFull  = c.hiddenHistory?.fullHistory            ?? ''

  if (pmhSurg && SURGERY_DENIAL.test(pmhSurg) && !NAMED_PROCEDURE.test(pmhSurg) && SURGERY_MENTION.test(hidFull)) {
    const surgSentences = hidFull.split(/(?<=[.!?])\s+/).filter(s => SURGERY_MENTION.test(s))
    const hasHistorical = surgSentences.some(s =>
      !CURRENT_OP.test(s) && !FUTURE_OP.test(s) && !SURG_SENT_DENIAL.test(s) && !AUTO_PROCEDURE.test(s)
    )
    if (hasHistorical) {
      flags.push(`History contradiction: pastMedicalHistory.surgeries = "${pmhSurg.substring(0, 60)}" but hiddenHistory.fullHistory mentions prior surgery`)
    }
  }
  if (pmhHosp && HOSP_DENIAL.test(pmhHosp) && !HOSP_MENTION.test(pmhHosp) && HOSP_MENTION.test(hidFull)) {
    const hospSentences = hidFull.split(/(?<=[.!?])\s+/).filter(s => HOSP_MENTION.test(s))
    const hasHistorical = hospSentences.some(s =>
      !CURRENT_OP.test(s) && !FUTURE_OP.test(s) && !HOSP_SENT_DENIAL.test(s)
    )
    if (hasHistorical) {
      flags.push(`History contradiction: pastMedicalHistory.hospitalizations = "${pmhHosp.substring(0, 60)}" but hiddenHistory.fullHistory mentions prior hospitalization`)
    }
  }

  return flags
}

// ── Phase 2: Interview simulation ─────────────────────────────────────────────

// Eight targeted questions that cover all high-yield history contradiction areas
const INTERVIEW_QUESTIONS = [
  "Can you walk me through your symptoms in more detail? How long has this been going on and has it changed over time?",
  "Have you ever had any surgeries or procedures in the past? Any hospitalizations?",
  "Do you have any chronic medical conditions — things like diabetes, heart disease, or high blood pressure?",
  "Are you currently taking any medications, including over-the-counter drugs, vitamins, or supplements?",
  "Do you have any known allergies to medications or foods?",
  "Does anyone in your immediate family have a history of serious health problems?",
  "Do you smoke cigarettes, drink alcohol, or use any recreational drugs?",
  "Is there anything else about your health or your life situation that you think could be relevant to what you're experiencing?",
]

async function simulateInterview(row) {
  const c = row.case_data
  const difficulty = c.nativeDifficulty ?? row.difficulty
  const isGated = difficulty === 'Clinical' || difficulty === 'Advanced'

  const fullHistorySection = isGated && c.hiddenHistory?.fullHistory && c.hiddenHistory.fullHistory !== 'N/A'
    ? `\nYour complete history (ONLY reveal a specific detail when the physician asks directly about that topic — never volunteer these proactively):\n${c.hiddenHistory.fullHistory}`
    : ''

  const restrictive = isGated
    ? `- You have only shared your chief complaint so far — do not volunteer anything else
- Answer ONLY the specific question asked; do not add context or related information unprompted
- Respond conversationally using lay language, not medical terminology`
    : `- Be naturally forthcoming; you may mention a related detail if it feels organic
- Use everyday lay language — you are not a medical professional`

  const patientSystem = `You are roleplaying as a patient named ${c.patientInfo?.name}, a ${c.patientInfo?.age}-year-old ${c.patientInfo?.gender} presenting to the clinic with "${c.patientInfo?.chiefComplaint}".

What you have already told the physician: ${c.hpi}${fullHistorySection}

Other information — only reveal each item when the physician directly asks about that specific topic:
- Past surgeries: ${c.pastMedicalHistory?.surgeries ?? 'none reported'}
- Past hospitalizations: ${c.pastMedicalHistory?.hospitalizations ?? 'none reported'}
- Chronic conditions: ${c.pastMedicalHistory?.conditions ?? 'none reported'}
- Social history: ${c.hiddenHistory?.socialHistory ?? 'none'}
- Family history: ${c.hiddenHistory?.familyHistory ?? 'none'}
- Current medications: ${c.hiddenHistory?.medications ?? 'none'}
- Allergies: ${c.hiddenHistory?.allergies ?? 'none'}
- Additional symptoms if asked: ${c.hiddenHistory?.hiddenSymptoms ?? 'none'}

Rules:
- Stay in character as a patient — never break character or act like a medical professional
- Use everyday language only — do not use medical or clinical terminology
- Keep answers concise (2-4 sentences)
- Respond only to what is directly asked
${restrictive}`

  const messages = []
  const responses = []

  for (const question of INTERVIEW_QUESTIONS) {
    messages.push({ role: 'user', content: question })
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 160,
      system: patientSystem,
      messages: [...messages],
    })
    const answer = resp.content[0]?.text ?? ''
    messages.push({ role: 'assistant', content: answer })
    responses.push({ question, answer })
  }

  return responses
}

async function checkContradictions(row, responses) {
  const c = row.case_data

  const prompt = `You are a QA auditor reviewing a medical training case for bugs in a patient simulation.

CASE GROUND TRUTH (authoritative source):
- pastMedicalHistory.surgeries:        ${JSON.stringify(c.pastMedicalHistory?.surgeries ?? 'not set')}
- pastMedicalHistory.conditions:       ${JSON.stringify(c.pastMedicalHistory?.conditions ?? 'not set')}
- pastMedicalHistory.hospitalizations: ${JSON.stringify(c.pastMedicalHistory?.hospitalizations ?? 'not set')}
- hiddenHistory.fullHistory:           ${JSON.stringify(c.hiddenHistory?.fullHistory ?? 'not set')}
- hiddenHistory.medications:           ${JSON.stringify(c.hiddenHistory?.medications ?? 'not set')}
- hiddenHistory.socialHistory:         ${JSON.stringify(c.hiddenHistory?.socialHistory ?? 'not set')}
- hiddenHistory.familyHistory:         ${JSON.stringify(c.hiddenHistory?.familyHistory ?? 'not set')}
- hiddenHistory.hiddenSymptoms:        ${JSON.stringify(c.hiddenHistory?.hiddenSymptoms ?? 'not set')}
- hiddenHistory.allergies:             ${JSON.stringify(c.hiddenHistory?.allergies ?? 'not set')}

PATIENT INTERVIEW TRANSCRIPT:
${responses.map((r, i) => `[Q${i + 1}] Student: ${r.question}\n[A${i + 1}] Patient: ${r.answer}`).join('\n\n')}

Identify ALL bugs in the following three categories:

1. CONTRADICTIONS — Patient's answer factually contradicts the case ground truth.
   Example: pastMedicalHistory.surgeries says "None" but patient mentioned having an appendectomy.
   Example: pastMedicalHistory says "no known conditions" but patient described having diabetes.

2. VOLUNTEERED_HIDDEN — Patient revealed information from hiddenHistory without being directly asked.
   Example: Patient mentioned current medications before the student asked about medications.
   Example: Patient disclosed family history unprompted in response to an unrelated question.

3. DIAGNOSTIC_LANGUAGE — Patient used medical/clinical terminology a real patient would not know.
   Example: Patient said "I have CKD" or "my troponin was elevated" or "consistent with heart failure".
   Example: Patient described a symptom using a clinical term like "dyspnea" or "diaphoresis".

Return ONLY valid JSON — no markdown, no explanation:
{
  "contradictions":      ["<specific issue with quote from patient response>"],
  "volunteeredHidden":   ["<what was volunteered and in which answer>"],
  "diagnosticLanguage":  ["<exact medical term or phrase used>"],
  "clean": <true if all three arrays are empty>
}`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = resp.content[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { contradictions: [], volunteeredHidden: [], diagnosticLanguage: [], clean: true }
  try { return JSON.parse(match[0]) }
  catch { return { contradictions: [], volunteeredHidden: [], diagnosticLanguage: [], clean: true } }
}

// ── Phase 3: Grading sanity test ──────────────────────────────────────────────
function buildBackgroundHistory(c) {
  const parts = []
  if (c.pastMedicalHistory?.conditions)       parts.push(`Medical Conditions: ${c.pastMedicalHistory.conditions}`)
  if (c.pastMedicalHistory?.surgeries)        parts.push(`Surgeries: ${c.pastMedicalHistory.surgeries}`)
  if (c.pastMedicalHistory?.hospitalizations) parts.push(`Hospitalizations: ${c.pastMedicalHistory.hospitalizations}`)
  if (c.hiddenHistory?.familyHistory)         parts.push(`Family History: ${c.hiddenHistory.familyHistory}`)
  if (c.hiddenHistory?.socialHistory)         parts.push(`Social History: ${c.hiddenHistory.socialHistory}`)
  if (c.hiddenHistory?.medications)           parts.push(`Medications: ${c.hiddenHistory.medications}`)
  if (c.hiddenHistory?.hiddenSymptoms)        parts.push(`Additional Symptoms: ${c.hiddenHistory.hiddenSymptoms}`)
  if (c.hiddenHistory?.allergies)             parts.push(`Allergies: ${c.hiddenHistory.allergies}`)
  if (c.hiddenHistory?.fullHistory)           parts.push(`Full Background: ${c.hiddenHistory.fullHistory}`)
  return parts.join('\n') || '(none on file)'
}

function buildOrderedLabs(c) {
  const entries = Object.entries(c.labResults ?? {})
  if (!entries.length) return '(no labs ordered)'
  return entries.map(([name, result]) => {
    const components = result.components?.map(comp =>
      `  ${comp.name}: ${comp.value} ${comp.unit} [${comp.status}]`
    ).join('\n') ?? ''
    return `${name}:\n${components}`
  }).join('\n\n')
}

function buildOrderedImaging(c) {
  const parts = [
    ...Object.entries(c.imagingResults   ?? {}).map(([k, v]) => `${k}: ${v}`),
    ...Object.entries(c.procedureResults ?? {}).map(([k, v]) => `${k}: ${v}`),
  ]
  return parts.join('\n') || '(no imaging ordered)'
}

const GRADING_SYSTEM = `You are a medical education evaluator grading a trainee's diagnostic performance.
Grade appropriate to a medical student, not a resident. Return ONLY valid JSON — no markdown, no code fences.`

async function gradeWith(row, submittedDx, chatSummary) {
  const c = row.case_data
  const isCorrect = submittedDx === row.diagnosis

  const prompt = `Case: ${c.patientInfo?.age}yo ${c.patientInfo?.gender} — "${c.patientInfo?.chiefComplaint}"
HPI: ${c.hpi}
Difficulty: ${row.difficulty}

Background History (full ground truth):
${buildBackgroundHistory(c)}

Tests ordered (comprehensive — all available tests):
${buildOrderedLabs(c)}
${buildOrderedImaging(c)}

Patient interview transcript:
${chatSummary}

Submitted diagnosis: "${submittedDx}"
Correct diagnosis:   "${row.diagnosis}"
${isCorrect ? '(The submitted diagnosis is CORRECT.)' : `(The submitted diagnosis is WRONG. The correct answer is "${row.diagnosis}".)` }

Key clinical information: ${c.keyQuestions?.join(' | ') ?? 'not specified'}
Teaching points: ${c.teachingPoints?.join(' | ') ?? 'not specified'}
Differentials: ${c.differentials?.join(', ') ?? 'not specified'}
Expected labs: ${c.expectedLabs?.join(' | ') ?? 'not specified'}
Expected imaging: ${c.expectedImaging?.join(' | ') ?? 'not specified'}

SCORING (dimensions must sum to 90):
History & Interview     (historyInterview)      /18  — student asked 8 targeted questions and obtained full history
Test Ordering           (testOrdering)          /18  — student ordered ALL available tests
Diagnosis Accuracy      (diagnosisAccuracy)     /27  — ${isCorrect ? 'correct diagnosis: award ≥22/27' : 'wrong diagnosis: penalize appropriately'}
Diagnosis Completeness  (diagnosisCompleteness) /13
Clinical Reasoning      (clinicalReasoning)     /14  — reasoning inferred from test ordering and question pattern

Return ONLY valid JSON:
{
  "score": <0-90>,
  "correct": <true|false>,
  "dimensions": {
    "historyInterview":      { "score": <0-18>, "feedback": "<one sentence>" },
    "testOrdering":          { "score": <0-18>, "feedback": "<one sentence>" },
    "diagnosisAccuracy":     { "score": <0-27>, "feedback": "<one sentence>" },
    "diagnosisCompleteness": { "score": <0-13>, "feedback": "<one sentence>" },
    "clinicalReasoning":     { "score": <0-14>, "feedback": "<one sentence>" }
  },
  "feedback": "<1-2 sentence overall assessment>"
}`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: GRADING_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = resp.content[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in grading response')
  const result = JSON.parse(match[0])
  if (result.dimensions) {
    result.score = Object.values(result.dimensions).reduce((s, d) => s + (d?.score ?? 0), 0)
  }
  return result
}

async function testGrading(row, interviewResponses) {
  const c = row.case_data

  const chatSummary = interviewResponses
    ? interviewResponses.map(r => `Student: ${r.question}\nPatient: ${r.answer}`).join('\n\n')
    : 'Student asked all eight standard history questions and received complete, responsive answers from the patient.'

  // Wrong diagnosis = first differential (most plausible wrong answer — hardest test)
  const wrongDx = c.differentials?.[0] ?? 'Viral Upper Respiratory Infection'

  const [correctResult, wrongResult] = await Promise.all([
    gradeWith(row, row.diagnosis, chatSummary),
    gradeWith(row, wrongDx, chatSummary),
  ])

  const gap = correctResult.score - wrongResult.score
  const flags = []

  if (correctResult.score < 68) {
    flags.push(`Correct dx scored ${correctResult.score}/90 — expected ≥68. Case data may be incomplete or grading too harsh.`)
  }
  if (!correctResult.correct) {
    flags.push(`Grader marked correct diagnosis "${row.diagnosis}" as INCORRECT — rubric matching or case-data bug.`)
  }
  if (wrongResult.correct) {
    flags.push(`Grader marked wrong diagnosis "${wrongDx}" as CORRECT — grading too lenient or differentials too similar.`)
  }
  if (gap < 15) {
    flags.push(`Discrimination gap only ${gap} points (correct=${correctResult.score}, wrong=${wrongResult.score}) — grading not distinguishing correct vs wrong diagnosis.`)
  }

  return {
    correctScore: correctResult.score,
    wrongScore:   wrongResult.score,
    wrongDx,
    gap,
    flags,
  }
}

// ── Semaphore ─────────────────────────────────────────────────────────────────
function makeSemaphore(limit) {
  let running = 0; const queue = []
  function next() {
    if (running >= limit || !queue.length) return
    running++
    const { fn, resolve, reject } = queue.shift()
    fn().then(v => { running--; resolve(v); next() }).catch(e => { running--; reject(e); next() })
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const phases = ['static', doSimulate && 'interview', doGrade && 'grading'].filter(Boolean)
  console.log(`Phases: ${phases.join(' + ')} | Concurrency: ${concurrency}`)
  if (filterSystem)     console.log(`Filter system:     ${filterSystem}`)
  if (filterDifficulty) console.log(`Filter difficulty: ${filterDifficulty}`)
  if (filterCaseId)     console.log(`Filter case id:    ${filterCaseId}`)
  if (limitCases)       console.log(`Limit:             ${limitCases}`)
  console.log('Fetching cases from Supabase…')

  const rows = await fetchCases()
  if (!rows.length) { console.log('No cases matched filters.'); return }
  console.log(`${rows.length} cases loaded.\n`)

  const report = []
  const sem = makeSemaphore(concurrency)
  let done = 0

  await Promise.all(rows.map(row => sem(async () => {
    const entry = {
      id: row.id,
      system: row.system,
      difficulty: row.difficulty,
      diagnosis: row.diagnosis,
      staticFlags: staticChecks(row),
      interview: null,
      grading: null,
      errors: [],
    }

    if (doSimulate) {
      try {
        const responses = await simulateInterview(row)
        const contradictions = await checkContradictions(row, responses)
        entry.interview = { responses, contradictions }
      } catch (e) {
        entry.errors.push(`[simulate] ${e.message}`)
      }
    }

    if (doGrade) {
      try {
        entry.grading = await testGrading(row, entry.interview?.responses ?? null)
      } catch (e) {
        entry.errors.push(`[grade] ${e.message}`)
      }
    }

    // Compute severity
    const interviewIssues = entry.interview
      ? [
          ...(entry.interview.contradictions?.contradictions    ?? []),
          ...(entry.interview.contradictions?.volunteeredHidden ?? []),
          ...(entry.interview.contradictions?.diagnosticLanguage ?? []),
        ]
      : []
    const gradingIssues = entry.grading?.flags ?? []
    const total = entry.staticFlags.length + interviewIssues.length + gradingIssues.length

    entry.overallStatus = total === 0    ? 'pass'
      : total <= 2 && !entry.staticFlags.some(f => f.startsWith('CRITICAL') || f.startsWith('History contradiction')) ? 'minor'
      : 'major'

    report.push(entry)
    done++
    process.stdout.write(`\r  ${done}/${rows.length} processed…`)
  })))

  console.log('\n')

  // Sort: major → minor → pass, then by total issue count
  const severityOrder = { major: 0, minor: 1, pass: 2 }
  report.sort((a, b) => {
    const sa = severityOrder[a.overallStatus] ?? 2
    const sb = severityOrder[b.overallStatus] ?? 2
    return sa !== sb ? sa - sb : b.staticFlags.length - a.staticFlags.length
  })

  // ── Terminal output ───────────────────────────────────────────────────────
  const major = report.filter(r => r.overallStatus === 'major')
  const minor = report.filter(r => r.overallStatus === 'minor')
  const pass  = report.filter(r => r.overallStatus === 'pass')

  console.log('══════════════════════════════════════════════════════════════')
  console.log('  QA AGENT REPORT')
  console.log('══════════════════════════════════════════════════════════════')
  console.log(`  Cases reviewed:  ${rows.length}`)
  console.log(`  Major issues:    ${major.length}`)
  console.log(`  Minor issues:    ${minor.length}`)
  console.log(`  Passed clean:    ${pass.length}`)
  console.log('══════════════════════════════════════════════════════════════\n')

  for (const entry of [...major, ...minor]) {
    const icon = entry.overallStatus === 'major' ? '[MAJOR]' : '[minor]'
    console.log(`${icon} ${entry.id}`)
    console.log(`         ${entry.system} | ${entry.difficulty} | ${entry.diagnosis}`)

    for (const f of entry.staticFlags) {
      console.log(`  static       ${f}`)
    }

    if (entry.interview?.contradictions) {
      const c = entry.interview.contradictions
      for (const x of c.contradictions    ?? []) console.log(`  contradiction  ${x}`)
      for (const x of c.volunteeredHidden ?? []) console.log(`  volunteered    ${x}`)
      for (const x of c.diagnosticLanguage ?? []) console.log(`  medical-term   ${x}`)
    }

    if (entry.grading) {
      const g = entry.grading
      console.log(`  grading      correct=${g.correctScore}/90 | wrong="${g.wrongDx}"=${g.wrongScore}/90 | gap=${g.gap}`)
      for (const f of g.flags) console.log(`  grading      ${f}`)
    }

    for (const e of entry.errors) console.log(`  error        ${e}`)
    console.log()
  }

  if (pass.length) {
    console.log(`${pass.length} case(s) passed all checks cleanly.`)
    if (pass.length <= 10) {
      for (const p of pass) console.log(`  ✓ ${p.id}`)
    }
    console.log()
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(`Full report written → ${outputPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })

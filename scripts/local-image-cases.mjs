/**
 * Generate cases anchored to local images in public/images/.
 *
 * Unlike image-first-cases.mjs (which fetches remote Open-i radiology images),
 * this script generates cases for the 5 special-modality categories already
 * curated locally: biopsy, derm, fundus, smear, urine.
 *
 * The trainer renders these via app/lib/specialImageLookup.ts at view time —
 * keyword-matching the case's diagnosis + *Findings field to pick a random
 * local image from the right category folder. No Supabase verified_images
 * column needed; no network calls to external image APIs.
 *
 * Cases are written with id: local-{modality}-{category}-0
 *
 * Usage:
 *   node scripts/local-image-cases.mjs              # generate all 17
 *   node scripts/local-image-cases.mjs --dry-run    # generate + validate, skip DB write
 *   node scripts/local-image-cases.mjs --force      # regenerate existing rows
 *   node scripts/local-image-cases.mjs --limit 3    # first N combos only
 *   node scripts/local-image-cases.mjs --concurrency 5
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(path.resolve(__dirname, '..'), '.env.local') })

if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1)
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const dryRun      = args.includes('--dry-run')
const force       = args.includes('--force')
const concurrency = parseInt(getArg('--concurrency') ?? '3', 10)
const limit       = parseInt(getArg('--limit') ?? '0', 10)

// ── Clients ───────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ── Combos ────────────────────────────────────────────────────────────────────
// Each entry maps a local image folder to a clinical case.
// findingsField + findingsKeyword must match MODALITY_RULES in specialImageLookup.ts
// so the runtime image picker selects the correct category folder at render time.
const COMBOS = [
  // ── SMEAR ──────────────────────────────────────────────────────────────────
  {
    modality: 'smear', category: 'malaria_falciparum',
    diagnosis: 'Plasmodium falciparum Malaria', system: 'Infectious', difficulty: 'Clinical',
    expectedImagingName: 'Peripheral Blood Smear',
    imagingCategory: 'peripheral smear',
    findingsField: 'hematologyFindings', findingsKeyword: 'plasmodium falciparum',
  },

  // ── BIOPSY ─────────────────────────────────────────────────────────────────
  {
    modality: 'biopsy', category: 'breast_cancer',
    diagnosis: 'Invasive Ductal Carcinoma of the Breast', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Core Needle Breast Biopsy',
    imagingCategory: 'breast biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'ductal carcinoma',
  },
  {
    modality: 'biopsy', category: 'colon_cancer',
    diagnosis: 'Colorectal Adenocarcinoma', system: 'Gastrointestinal', difficulty: 'Clinical',
    expectedImagingName: 'Colonoscopy with Biopsy',
    imagingCategory: 'colorectal biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'colorectal',
  },
  {
    modality: 'biopsy', category: 'gastric',
    diagnosis: 'Helicobacter pylori-Associated Gastric Cancer', system: 'Gastrointestinal', difficulty: 'Advanced',
    expectedImagingName: 'Upper Endoscopy with Gastric Biopsy',
    imagingCategory: 'gastric biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'gastric',
  },
  {
    modality: 'biopsy', category: 'liver',
    diagnosis: 'Alcoholic Liver Cirrhosis', system: 'Gastrointestinal', difficulty: 'Clinical',
    expectedImagingName: 'Liver Biopsy (Percutaneous)',
    imagingCategory: 'liver biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'cirrhosis',
  },

  // ── DERM ───────────────────────────────────────────────────────────────────
  {
    modality: 'derm', category: 'melanoma',
    diagnosis: 'Cutaneous Melanoma', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Dermoscopy and Skin Biopsy',
    imagingCategory: 'dermoscopy',
    findingsField: 'skinFindings', findingsKeyword: 'melanoma',
  },
  {
    modality: 'derm', category: 'basal_cell',
    diagnosis: 'Basal Cell Carcinoma', system: 'Hematologic / Oncologic', difficulty: 'Foundations',
    expectedImagingName: 'Skin Biopsy (Punch Biopsy)',
    imagingCategory: 'skin biopsy',
    findingsField: 'skinFindings', findingsKeyword: 'basal cell',
  },
  {
    modality: 'derm', category: 'squamous_cell',
    diagnosis: 'Cutaneous Squamous Cell Carcinoma', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Skin Biopsy (Punch Biopsy)',
    imagingCategory: 'skin biopsy',
    findingsField: 'skinFindings', findingsKeyword: 'squamous cell',
  },
  {
    modality: 'derm', category: 'nevus',
    diagnosis: 'Dysplastic Melanocytic Nevus', system: 'Hematologic / Oncologic', difficulty: 'Foundations',
    expectedImagingName: 'Dermoscopy',
    imagingCategory: 'dermoscopy',
    findingsField: 'skinFindings', findingsKeyword: 'dysplastic nevus',
  },

  // ── FUNDUS ─────────────────────────────────────────────────────────────────
  {
    modality: 'fundus', category: 'amd',
    diagnosis: 'Neovascular Age-Related Macular Degeneration', system: 'Neurologic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography and OCT',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'macular degeneration',
  },
  {
    modality: 'fundus', category: 'diabetic_retinopathy',
    diagnosis: 'Proliferative Diabetic Retinopathy', system: 'Endocrine / Metabolic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography (Dilated Eye Exam)',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'diabetic retinopathy',
  },
  {
    modality: 'fundus', category: 'glaucoma',
    diagnosis: 'Primary Open-Angle Glaucoma', system: 'Neurologic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography with Tonometry',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'glaucoma',
  },
  {
    modality: 'fundus', category: 'hypertensive',
    diagnosis: 'Grade III Hypertensive Retinopathy', system: 'Cardiovascular', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography (Dilated Eye Exam)',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'hypertensive retinopathy',
  },

  // ── URINE ──────────────────────────────────────────────────────────────────
  {
    modality: 'urine', category: 'uti',
    diagnosis: 'Acute Uncomplicated Cystitis (UTI)', system: 'Renal', difficulty: 'Foundations',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'bacteria urine',
  },
  {
    modality: 'urine', category: 'nephrotic',
    diagnosis: 'Minimal Change Disease (Nephrotic Syndrome)', system: 'Renal', difficulty: 'Clinical',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'nephrotic',
  },
  {
    modality: 'urine', category: 'nephritic',
    diagnosis: 'IgA Nephropathy (Berger Disease)', system: 'Renal', difficulty: 'Clinical',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'rbc casts',
  },
  {
    modality: 'urine', category: 'kidney_stone',
    diagnosis: 'Calcium Oxalate Nephrolithiasis', system: 'Renal', difficulty: 'Foundations',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'calcium oxalate',
  },
]

// ── Shared prompts (mirrors image-first-cases.mjs) ────────────────────────────
const CASE_SYSTEM_PROMPT = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. Draw from diverse ethnicities and countries each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.). Never reuse first names or last names across cases.`

const DIFFICULTY_RULES = {
  Foundations: `DIFFICULTY — FOUNDATIONS:
- Common, high-prevalence diagnosis with a classic, unambiguous presentation
- Labs and imaging directly confirm the diagnosis with clearly abnormal values
- Physical exam findings are classic and confined to the primary organ system
- 2-3 differentials; the correct diagnosis is clearly favored`,

  Clinical: `DIFFICULTY — CLINICAL:
- Common-to-moderate prevalence diagnosis encountered by general internists or ER physicians
- ONE atypical feature that actively misleads toward a competing differential
- ONE comorbidity that meaningfully changes the presentation or lab interpretation
- At least one lab requiring correlation with another finding to interpret correctly
- 3-4 genuine differentials, at least one requiring a confirmatory test to exclude`,

  Advanced: `DIFFICULTY — ADVANCED:
- ONE uncommon or rare diagnosis — do NOT stack multiple rare conditions
- Comorbidities must be common (hypertension, diabetes, COPD, CKD)
- ONE objective red herring that actively supports a wrong diagnosis
- Lab and imaging findings require synthesis across multiple data points
- ONE pathognomonic or definitively discriminating result available in the test list
- 4-5 differentials with at least two strongly supported by early data`,
}

const CRITICAL_RULES = `Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component. Single-value tests also use a one-item components array.
CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs.
CRITICAL: Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The lab/imaging results must include at least one finding that definitively confirms the correct diagnosis over its closest differential.
STEMI RULE: When the diagnosis is any form of STEMI, ecgFindings MUST explicitly state the affected leads with millimeter elevation.
PAST HISTORY CONSISTENCY RULE: The pastMedicalHistory fields shown to the patient (conditions, surgeries, hospitalizations) MUST NOT contradict hiddenHistory.fullHistory. If pastMedicalHistory.surgeries states "None" or "No prior surgeries", then hiddenHistory.fullHistory MUST NOT reveal any surgeries. The patient's visible history and hidden history must be completely consistent — the hidden history may ADD detail, but must never contradict what was already stated.
PHYSICAL EXAM OBJECTIVITY RULE: Every physicalExam field MUST describe only objective, observable findings (e.g., "dullness to percussion at right base", "pitting edema 2+ bilateral lower extremities", "JVD at 45 degrees"). NEVER include diagnostic interpretations, disease names, or phrases like "consistent with X", "suggesting X", or "findings of X". The exam reports what the clinician sees, hears, and feels — not what it means. Diagnosis is the user's task.
CLINICAL HPI WORD LIMIT RULE: The clinicalHpi field is a HARD MAXIMUM of 40 words. Count every word. If your draft exceeds 40 words, cut it. State only: age, sex, primary symptom, and duration. Do NOT add associated symptoms, characterization, radiation, pertinent positives/negatives, or social context — those belong in hiddenHistory.fullHistory. Two to three sentences only.
FOUNDATIONS HPI WORD LIMIT RULE: The hpi field is a HARD MAXIMUM of 60 words. Count every word. If your draft exceeds 60 words, cut it. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN in hpi: associated symptoms, review of systems positives, family history, social history details, exam findings on arrival, and ANY diagnosis-narrowing detail. Move everything forbidden into hiddenHistory.fullHistory — the patient will reveal these during the clinical interview when asked. The hpi must leave the differential open.`

const JSON_SCHEMA = `{
  "patientInfo": { "name": "First Last", "age": <number>, "gender": "Male or Female", "chiefComplaint": "<brief>", "height": "<e.g. 5'9\\">", "heightInches": <integer> },
  "hpi": "<2-3 sentences. HARD MAXIMUM 60 WORDS — count every word and cut if over. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN: associated symptoms, review of systems positives, family history, exam findings, and ANY detail that narrows the differential to a single diagnosis. Everything forbidden here belongs in hiddenHistory.fullHistory.>",
  "clinicalHpi": "<2-3 sentences, MAXIMUM 40 WORDS>",
  "advancedHpi": "<HARD LIMIT 20 WORDS: age, sex, vague symptom, one misleading detail>",
  "vitals": { "bp": "<sys/dia mmHg>", "hr": <bpm>, "rr": <brpm>, "temp": <F>, "spo2": <pct>, "weight": "<lbs>" },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", ...EXACTLY DIFF_COUNT],
  "differentialExplanations": ["<dx>: <why it's on the list and what distinguishes it>", ...one per differential],
  "expectedLabs": ["<exact lab name from availableLabs>", ...3-7 in clinical priority order],
  "expectedImaging": ["IMAGE_TEST_NAME"],
  "keyQuestions": ["<question>", "<question>", "<question>", "<question>", "<question>"],
  "teachingPoints": ["<pearl 1>", "<pearl 2>", "<pearl 3>", "<pearl 4>"],
  "reviewOfSystems": {
    "Constitutional": "<positives first, then denials>", "HEENT": "<findings>",
    "Cardiovascular": "<findings>", "Respiratory": "<findings>", "Gastrointestinal": "<findings>",
    "Genitourinary": "<findings>", "Musculoskeletal": "<findings>", "Neurological": "<findings>",
    "Psychiatric": "<findings>", "Integumentary": "<findings>", "Endocrine": "<findings>",
    "Hematologic/Lymphatic": "<findings>", "Allergic/Immunologic": "<findings>"
  },
  "physicalExam": {
    "General": "<appearance>", "HEENT": "<findings>", "Neck": "<findings>",
    "Cardiovascular": "<findings>", "Pulmonary": "<findings>", "Abdomen": "<findings>",
    "Extremities": "<findings>", "Neurological": "<findings>", "Skin": "<findings>"
  },
  "availableLabs": ["<lab name>", ...10-14 relevant and distractor labs],
  "availableImaging": ["IMAGE_TEST_NAME", ...include 2-4 other relevant studies],
  "labGroups": [{ "name": "<panel name>", "tests": ["<exact lab name>", ...] }, ...group every lab],
  "labResults": {
    "<exact lab name from availableLabs>": {
      "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }]
    }
  },
  "imagingResults": {},
  "procedureResults": {
    "IMAGE_TEST_NAME": "IMAGE_FINDINGS_DESCRIPTION"
  },
  "hiddenHistory": {
    "fullHistory": "<complete clinical history withheld from HPI>",
    "socialHistory": "<smoking, alcohol, drugs, occupation, living>",
    "familyHistory": "<relevant family history>",
    "medications": "<current medications with doses>",
    "hiddenSymptoms": "<1-2 symptoms patient hasn't mentioned>",
    "allergies": "<drug allergies or NKDA>"
  },
  "imagingCategory": "IMAGE_CATEGORY",
  "ecgFindings": "<ECG description or 'Normal sinus rhythm. No acute ST changes.'>",
  "hematologyFindings": "<peripheral smear findings — MUST include 'plasmodium falciparum' if malaria case>",
  "urineFindings": "<urine microscopy findings — include specific sediment findings>",
  "skinFindings": "<dermoscopy/skin findings — describe lesion morphology>",
  "fundusFindings": "<fundus findings — describe retinal findings>",
  "biopsyFindings": "<histopathology findings — describe tissue/cellular findings>",
  "pastMedicalHistory": { "conditions": "<chronic diagnoses>", "surgeries": "<prior surgeries>", "hospitalizations": "<prior hospitalizations>" },
  "currentMedications": { "medications": "<prescriptions with doses>", "otc": "<OTC/supplements>" },
  "socialHistory": { "smoking": "<tobacco use>", "alcohol": "<drinks/week>", "drugs": "<recreational>", "occupation": "<job>", "living": "<living situation>", "other": "<travel, diet, exposures>" },
  "relevantTests": [
    { "name": "<test name>", "category": "<Hematology|Metabolic & Chemistry|Urinalysis & Renal|Coagulation|Immunology & Serology|Infectious Disease|Cardiac|Arterial Blood Gas & Respiratory|Toxicology & Drug Levels|Imaging|Procedures & Special Tests>", "isImaging": <true|false>, "labResult": { "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }] }, "imagingResult": "<narrative if isImaging>" }
  ]
}`

// ── Helpers ───────────────────────────────────────────────────────────────────
function repairJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object in response')
  let json = match[0]
  json = json.replace(/"(unit|value|referenceRange|status)":\s+([^",{\[\s\n][^,\n}\]]*")/g, '"$1": "$2')
  json = json.replace(/,(\s*[}\]])/g, '$1')
  return json
}

const SURG_DENIAL      = /\b(none|no prior|no past|no surgical|no history of surgery|denies.{0,10}surgery|has not had any)\b/i
const SURG_MENTION     = /\b(surgery|surgeries|surgical|appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|bypass|repair|resection|transplant|excision|\w+ectomy|\w+otomy|\w+ostomy|\w+plasty)\b/i
const HOSP_DENIAL      = /\b(none|no prior|no past|never been hospitalized|no hospitalizations|denies.{0,10}hospitalization)\b/i
const HOSP_MENTION     = /\b(hospitali[sz]|admitted to.{0,20}hospital|inpatient stay|ICU admission|intensive care unit admission)\b/i
const NAMED_PROCEDURE  = /\b(appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|arthroscopy|c-section|cesarean|bypass|transplant|nephrectomy|splenectomy|thyroidectomy|laminectomy|craniotomy|laparotomy|laparoscopy|ORIF|tonsillectomy|herniorrhaphy|hernia repair|thrombectomy|endarterectomy|angioplasty|pacemaker|amputation)\b/i
const CURRENT_OP       = /\b(this admission|current (admission|hospitalization|presentation|episode|injury|surgery)|on arrival|emergent(ly)?|urgent(ly)?|was brought|following the (trauma|injury|accident)|for the current|perioperative|pre-?operatively|post-?operatively|post-?surgery|status post.*this)\b/i
const FUTURE_OP        = /\b(may require|might need|could require|planned|will undergo|referral for|considering|surgical candidate|recommended for surgery|potential surgery|surgical option)\b/i
const SURG_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(surgery|surgeries|surgical|procedure|procedures|operation|operations|fasciotomy|splenectomy|appendectomy|cholecystectomy)\b/i
const HOSP_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(hospitalization|hospitalizations|hospitalized|inpatient|admitted)\b/i
const AUTO_PROCEDURE   = /\bautosplenectomy\b/i

function reconcileHistoryConsistency(caseData) {
  const pmh    = caseData.pastMedicalHistory
  const hidden = caseData.hiddenHistory
  if (!pmh || !hidden?.fullHistory) return caseData

  const full = hidden.fullHistory
  const sentences = full.split(/(?<=[.!?])\s+/)

  let updated = false
  const newPmh = { ...pmh }

  if (SURG_DENIAL.test(pmh.surgeries ?? '') && !NAMED_PROCEDURE.test(pmh.surgeries ?? '') && SURG_MENTION.test(full)) {
    const historical = sentences.filter(s =>
      SURG_MENTION.test(s) && !CURRENT_OP.test(s) && !FUTURE_OP.test(s) &&
      !SURG_SENT_DENIAL.test(s) && !AUTO_PROCEDURE.test(s)
    )
    if (historical.length > 0) {
      newPmh.surgeries = historical.map(s => s.trim().replace(/[.!?]+$/, '')).join('; ')
      updated = true
    }
  }

  if (HOSP_DENIAL.test(pmh.hospitalizations ?? '') && !HOSP_MENTION.test(pmh.hospitalizations ?? '') && HOSP_MENTION.test(full)) {
    const historical = sentences.filter(s =>
      HOSP_MENTION.test(s) && !CURRENT_OP.test(s) && !FUTURE_OP.test(s) && !HOSP_SENT_DENIAL.test(s)
    )
    if (historical.length > 0) {
      newPmh.hospitalizations = historical.map(s => s.trim().replace(/[.!?]+$/, '')).join('; ')
      updated = true
    }
  }

  return updated ? { ...caseData, pastMedicalHistory: newPmh } : caseData
}

// ── Case generator ────────────────────────────────────────────────────────────
async function generateCase(combo) {
  const { diagnosis, system, difficulty, expectedImagingName, imagingCategory, findingsField, findingsKeyword } = combo
  const diffCount = difficulty === 'Foundations' ? '2-3' : difficulty === 'Clinical' ? '3-4' : '4-5'

  const schema = JSON_SCHEMA
    .replace(/IMAGE_TEST_NAME/g, expectedImagingName)
    .replace('IMAGE_FINDINGS_DESCRIPTION', `<detailed ${expectedImagingName} findings consistent with ${diagnosis}>`)
    .replace('IMAGE_CATEGORY', imagingCategory)
    .replace('DIFF_COUNT', diffCount)

  const prompt = `Generate a ${system} clinical training case. The diagnosis MUST be "${diagnosis}".

SPECIAL MODALITY REQUIREMENT:
- "${expectedImagingName}" MUST appear in both availableImaging and procedureResults (it is a procedure/special test, not radiology).
- The "${findingsField}" field MUST contain the phrase "${findingsKeyword}" — this is required for the trainer's image-lookup system to display the correct image category. Weave it naturally into a clinically accurate description.

${DIFFICULTY_RULES[difficulty]}

${CRITICAL_RULES}

${schema}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: CASE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  return JSON.parse(repairJson(response.content[0]?.text ?? ''))
}

// ── Validation ────────────────────────────────────────────────────────────────
function validate(caseData, combo) {
  const { expectedImagingName, findingsField, findingsKeyword } = combo
  const findings = (caseData[findingsField] ?? '').toLowerCase()
  if (!findings.includes(findingsKeyword.toLowerCase())) {
    throw new Error(`"${findingsField}" missing keyword "${findingsKeyword}" (got: "${caseData[findingsField]?.slice(0, 80)}")`)
  }
  const imaging = caseData.availableImaging ?? []
  if (!imaging.includes(expectedImagingName)) {
    throw new Error(`availableImaging missing "${expectedImagingName}" (got: ${JSON.stringify(imaging)})`)
  }
}

// ── Process one combo ─────────────────────────────────────────────────────────
async function processCombo(combo, stats) {
  const caseId = `local-${combo.modality}-${combo.category}-0`
  process.stdout.write(`[${caseId}] ${combo.diagnosis} — `)

  let caseData
  try {
    caseData = await generateCase(combo)
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
    stats.errors++
    return
  }

  try {
    validate(caseData, combo)
  } catch (e) {
    console.log(`VALIDATION FAILED: ${e.message}`)
    stats.errors++
    return
  }

  caseData = reconcileHistoryConsistency(caseData)
  caseData.nativeDifficulty = combo.difficulty

  if (dryRun) {
    const preview = caseData[combo.findingsField]?.slice(0, 100) ?? '(empty)'
    console.log(`OK (dry-run)`)
    console.log(`    ${combo.findingsField}: ${preview}`)
    stats.generated++
    return
  }

  const { error } = await supabase.from('cases').upsert({
    id:             caseId,
    system:         combo.system,
    difficulty:     combo.difficulty,
    diagnosis:      combo.diagnosis,
    variant_index:  0,
    case_data:      caseData,
    is_generated:   true,
    generated_at:   new Date().toISOString(),
  }, { onConflict: 'id' })

  if (error) {
    console.log(`DB ERROR: ${error.message}`)
    stats.errors++
    return
  }

  console.log('OK')
  stats.generated++
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  let combos = COMBOS
  if (limit > 0) combos = combos.slice(0, limit)

  if (!force) {
    const { data } = await supabase.from('cases').select('id').like('id', 'local-%')
    const existingIds = new Set((data ?? []).map(r => r.id))
    const before = combos.length
    combos = combos.filter(c => !existingIds.has(`local-${c.modality}-${c.category}-0`))
    const skipped = before - combos.length
    if (skipped > 0) console.log(`${skipped} already exist (use --force to regenerate)`)
  }

  console.log(`\n${combos.length} local-image case(s) to generate${dryRun ? ' — DRY RUN' : ''}\n`)

  const stats = { generated: 0, errors: 0 }
  const queue = [...combos]
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const combo = queue.shift()
      if (!combo) break
      await processCombo(combo, stats)
    }
  }))

  console.log('\n─────────────────────────────────────────────────────')
  console.log(`Generated : ${stats.generated}`)
  console.log(`Errors    : ${stats.errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })

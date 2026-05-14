/**
 * Image-anchored case generation (supplement to manifest cases).
 *
 * Instead of generating cases first and searching for images, this script
 * inverts the pipeline:
 *
 *   1. Harvest images from Open-i across all pathology categories
 *   2. Agent 1 (Claude vision): analyze each image → confirm pathology,
 *      assign system + difficulty, extract imaging findings
 *   3. Agent 2 (Claude text): generate a complete clinical case whose
 *      imagingResults accurately reflect the actual image
 *   4. Store in Supabase with verified_images already populated
 *
 * Every case produced has a confirmed image. No post-hoc verification needed.
 *
 * Cases use id format: img-{imageUid}
 * They live alongside manifest cases in the same `cases` table.
 * Trainer integration (serving these to users) is a follow-up task.
 *
 * Usage:
 *   node scripts/image-first-cases.mjs
 *   node scripts/image-first-cases.mjs --system Respiratory
 *   node scripts/image-first-cases.mjs --difficulty Foundations
 *   node scripts/image-first-cases.mjs --per-diagnosis 3   # images per DIAG_QUERY entry (default 2)
 *   node scripts/image-first-cases.mjs --concurrency 2     # parallel images (default 1)
 *   node scripts/image-first-cases.mjs --dry-run           # analyze images, skip DB write
 *   node scripts/image-first-cases.mjs --force             # regenerate existing img- cases
 *
 * Requires in .env.local:
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import {
  DIAG_QUERY, getTestParams, fetchOpenI, isNormalQuery,
} from './lib/imaging-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(path.resolve(__dirname, '..'), '.env.local') })

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set.'); process.exit(1)
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Supabase env vars not set.'); process.exit(1)
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
const filterSystem     = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const perDiagnosis     = parseInt(getArg('--per-diagnosis') ?? '2', 10)
const concurrency      = parseInt(getArg('--concurrency') ?? '1', 10)
const dryRun           = args.includes('--dry-run')
const force            = args.includes('--force')

// ── Clients ───────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ── Constants ─────────────────────────────────────────────────────────────────
const SYSTEMS = [
  'Cardiovascular', 'Respiratory', 'Neurologic', 'Gastrointestinal',
  'Renal', 'Endocrine / Metabolic', 'Infectious', 'Hematologic / Oncologic',
  'Musculoskeletal', 'Psychiatric', 'Toxicologic', 'Trauma',
]

const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

const MODALITY_TEST_NAMES = {
  xray: 'Chest X-Ray (PA/Lateral)',
  ct:   'CT Scan',
  mri:  'MRI',
  us:   'Ultrasound',
}

// ── Shared prompts (mirrors fill-library.mjs) ─────────────────────────────────
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

// ── History reconciliation (shared with fill-library.mjs) ─────────────────────
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
      SURG_MENTION.test(s) &&
      !CURRENT_OP.test(s) &&
      !FUTURE_OP.test(s) &&
      !SURG_SENT_DENIAL.test(s) &&
      !AUTO_PROCEDURE.test(s)
    )
    if (historical.length > 0) {
      newPmh.surgeries = historical.map(s => s.trim().replace(/[.!?]+$/, '')).join('; ')
      updated = true
    }
  }

  if (HOSP_DENIAL.test(pmh.hospitalizations ?? '') && !HOSP_MENTION.test(pmh.hospitalizations ?? '') && HOSP_MENTION.test(full)) {
    const historical = sentences.filter(s =>
      HOSP_MENTION.test(s) &&
      !CURRENT_OP.test(s) &&
      !FUTURE_OP.test(s) &&
      !HOSP_SENT_DENIAL.test(s)
    )
    if (historical.length > 0) {
      newPmh.hospitalizations = historical.map(s => s.trim().replace(/[.!?]+$/, '')).join('; ')
      updated = true
    }
  }

  return updated ? { ...caseData, pastMedicalHistory: newPmh } : caseData
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
FOUNDATIONS HPI WORD LIMIT RULE: The hpi field is a HARD MAXIMUM of 60 words. Count every word. If your draft exceeds 60 words, cut it. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN in hpi: associated symptoms, review of systems positives, family history, social history details, exam findings on arrival, and ANY diagnosis-narrowing detail (e.g. heat intolerance, exophthalmos, tremor, radiation, toxin names). Move everything forbidden into hiddenHistory.fullHistory — the patient will reveal these during the clinical interview when asked. The hpi must leave the differential open.`

const JSON_SCHEMA = `{
  "patientInfo": { "name": "First Last", "age": <number>, "gender": "Male or Female", "chiefComplaint": "<brief>", "height": "<e.g. 5'9\\\">", "heightInches": <integer> },
  "hpi": "<2-3 sentences. HARD MAXIMUM 60 WORDS — count every word and cut if over. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN: associated symptoms, review of systems positives, family history, exam findings, and ANY detail that narrows the differential to a single diagnosis. Everything forbidden here belongs in hiddenHistory.fullHistory.>",
  "clinicalHpi": "<2-3 sentences, MAXIMUM 40 WORDS>",
  "advancedHpi": "<HARD LIMIT 20 WORDS: age, sex, vague symptom, one misleading detail>",
  "vitals": { "bp": "<sys/dia mmHg>", "hr": <bpm>, "rr": <brpm>, "temp": <F>, "spo2": <pct>, "weight": "<lbs>" },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", ...EXACTLY DIFF_COUNT],
  "differentialExplanations": ["<dx>: <why it's on the list and what distinguishes it>", ...one per differential],
  "expectedLabs": ["<exact lab name from availableLabs>", ...3-7 in clinical priority order],
  "expectedImaging": ["<exact study name from availableImaging>", ...0-3 key studies — RETURN AN EMPTY ARRAY [] if imaging is not part of the standard workup for this diagnosis (e.g. lab-only diagnoses like ITP, hemophilia, viral URI). Do NOT invent imaging just to fill the array.],
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
  "availableImaging": ["IMAGE_TEST_NAME", ...include the primary imaging study and 2-4 others],
  "labGroups": [{ "name": "<panel name>", "tests": ["<exact lab name>", ...] }, ...group every lab],
  "labResults": {
    "<exact lab name from availableLabs>": {
      "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }]
    }
  },
  "imagingResults": {
    "IMAGE_TEST_NAME": "IMAGE_FINDINGS_DESCRIPTION",
    "<other study>": "<report>"
  },
  "procedureResults": {},
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
  "hematologyFindings": "<peripheral smear findings or blank>",
  "urineFindings": "<urine microscopy findings or blank>",
  "skinFindings": "<dermoscopy findings or blank>",
  "fundusFindings": "<fundus findings or blank>",
  "biopsyFindings": "<histopathology findings or blank>",
  "pastMedicalHistory": { "conditions": "<chronic diagnoses>", "surgeries": "<prior surgeries>", "hospitalizations": "<prior hospitalizations>" },
  "currentMedications": { "medications": "<prescriptions with doses>", "otc": "<OTC/supplements>" },
  "socialHistory": { "smoking": "<tobacco use>", "alcohol": "<drinks/week>", "drugs": "<recreational>", "occupation": "<job>", "living": "<living situation>", "other": "<travel, diet, exposures>" },
  "relevantTests": [
    { "name": "<test name>", "category": "<Hematology|Metabolic & Chemistry|Urinalysis & Renal|Coagulation|Immunology & Serology|Infectious Disease|Cardiac|Arterial Blood Gas & Respiratory|Toxicology & Drug Levels|Imaging|Procedures & Special Tests>", "isImaging": <true|false>, "labResult": { "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }] }, "imagingResult": "<narrative if isImaging>" }
  ]
}`

// ── Helpers ───────────────────────────────────────────────────────────────────
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function repairJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object in response')
  let json = match[0]
  json = json.replace(/"(unit|value|referenceRange|status)":\s+([^",{\[\s\n][^,\n}\]]*")/g, '"$1": "$2')
  json = json.replace(/,(\s*[}\]])/g, '$1')
  return json
}

async function downloadImageBase64(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MedTrainer-ImageFirst/1.0' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const mediaType = contentType.split(';')[0].trim()
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
    throw new Error(`Unsupported image type: ${mediaType}`)
  }
  const buffer = await res.arrayBuffer()
  return { base64: Buffer.from(buffer).toString('base64'), mediaType }
}

// Find the exact test name in availableImaging that maps to the given modality key
function matchTestName(availableImaging, targetModality) {
  for (const t of availableImaging) {
    const params = getTestParams(t)
    if (params && params !== 'skip' && params.modality === targetModality) return t
  }
  return null
}

// ── Agent 1: Image Analyst ────────────────────────────────────────────────────
const ANALYST_SYSTEM = `You are an expert radiologist and medical educator. You will analyze a medical image and provide structured metadata to help generate a clinical training case.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "usable": true or false,
  "reason": "brief reason if not usable, else blank",
  "diagnosis": "<specific medical diagnosis shown>",
  "system": "<exactly one of: Cardiovascular | Respiratory | Neurologic | Gastrointestinal | Renal | Endocrine / Metabolic | Infectious | Hematologic / Oncologic | Musculoskeletal | Psychiatric | Toxicologic | Trauma>",
  "difficulty": "<exactly one of: Foundations | Clinical | Advanced>",
  "modality": "<e.g. Chest X-Ray, CT Chest, MRI Brain, Abdominal Ultrasound>",
  "findings": "<1-2 sentences describing what the image shows in radiology report style>",
  "imagingCategory": "<1-3 word radiology descriptor e.g. lobar consolidation, pneumothorax, disc herniation>"
}`

async function analyzeImage(base64, mediaType, caption, abstract) {
  const contextText = [
    caption ? `Caption: ${caption}` : '',
    abstract ? `Abstract excerpt: ${abstract.slice(0, 200)}` : '',
  ].filter(Boolean).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 400,
    system: [{ type: 'text', text: ANALYST_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `Analyze this medical image.\n${contextText}` },
      ],
    }],
  })

  const raw = (response.content[0]?.text ?? '').trim()
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
}

// ── Agent 2: Case Generator ───────────────────────────────────────────────────
async function generateCase(base64, mediaType, analysis) {
  const { diagnosis, system, difficulty, modality, findings, imagingCategory } = analysis
  const diffCount = difficulty === 'Foundations' ? '2-3' : difficulty === 'Clinical' ? '3-4' : '4-5'
  const diffRules = DIFFICULTY_RULES[difficulty] ?? DIFFICULTY_RULES.Foundations

  // Inject the actual image test name and findings into the schema template
  const schema = JSON_SCHEMA
    .replace(/IMAGE_TEST_NAME/g, modality)
    .replace('IMAGE_FINDINGS_DESCRIPTION', `${findings} [This is the actual image attached to this case — write the report to match exactly what is shown.]`)
    .replace('IMAGE_CATEGORY', imagingCategory)
    .replace('DIFF_COUNT', diffCount)

  const prompt = `Generate a realistic ${system} clinical training case. The diagnosis MUST be "${diagnosis}".
The case includes an actual medical image (attached). The imaging findings in imagingResults["${modality}"] MUST accurately describe what is visible in the attached image.

${diffRules}

${CRITICAL_RULES}

${schema}`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    system: CASE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  })

  const raw = response.content[0]?.text ?? ''
  return JSON.parse(repairJson(raw))
}

// ── Pre-flight: verify Open-i is reachable ────────────────────────────────────
async function checkOpenI() {
  try {
    const res = await fetch('https://openi.nlm.nih.gov/api/search?query=pneumonia&it=x&m=1&n=1', {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const text = await res.text()
    if (text.trimStart().startsWith('<')) return { ok: false, reason: 'API returned HTML — site may be under maintenance' }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err?.name === 'TimeoutError' ? 'timeout' : (err?.message ?? String(err)) }
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write('Checking Open-i connectivity… ')
  const { ok: reachable, reason } = await checkOpenI()
  if (!reachable) {
    console.error(`FAILED\n\n${reason}\n\nTry again later.`)
    process.exit(1)
  }
  console.log('OK')

  // Load existing image-first case IDs to skip
  let existingIds = new Set()
  if (!force) {
    const { data } = await supabase
      .from('cases')
      .select('id')
      .like('id', 'img-%')
    for (const row of data ?? []) existingIds.add(row.id)
    console.log(`${existingIds.size} existing image-first cases (use --force to regenerate)`)
  }

  // Build harvest list from DIAG_QUERY, skipping "normal" queries
  const harvestList = []
  for (const [keys, queries] of DIAG_QUERY) {
    const diagName = keys[0]

    // Pick the best modality for this diagnosis
    const modOrder = ['xray', 'ct', 'mri', 'us']
    for (const mod of modOrder) {
      if (!queries[mod]) continue
      if (isNormalQuery(queries[mod])) continue

      // Map modality key to Open-i params
      const itMap  = { xray:'x', ct:'xm', mri:'m', us:'u' }
      const collMap = { xray:'cxr,mpx', ct:'mpx', mri:'mpx', us:'mpx' }

      harvestList.push({
        diagName,
        modality: mod,
        query: queries[mod],
        it: itMap[mod],
        coll: collMap[mod],
      })
      break // one modality per diagnosis entry (best match)
    }
  }

  // Apply system/difficulty filter (can't know difficulty until Agent 1 runs,
  // but we can filter the harvest by system-associated diagnoses later)
  console.log(`\n${harvestList.length} pathology categories to harvest`)
  if (filterSystem) console.log(`  System filter:     ${filterSystem}`)
  if (filterDifficulty) console.log(`  Difficulty filter: ${filterDifficulty}`)
  if (dryRun) console.log('  DRY RUN — no writes\n')
  else        console.log()

  const stats = { fetched: 0, skippedDup: 0, skippedUnusable: 0, generated: 0, errors: 0 }
  const seenUids = new Set(existingIds)

  // Collect all images to process
  const imageQueue = []
  for (const entry of harvestList) {
    const results = await fetchOpenI(entry.query, entry.it, entry.coll)
    for (const img of results.slice(0, perDiagnosis)) {
      const caseId = `img-${img.uid}`
      if (seenUids.has(caseId) || seenUids.has(img.uid)) {
        stats.skippedDup++
        continue
      }
      seenUids.add(caseId)
      imageQueue.push({ ...img, entry, caseId })
    }
    stats.fetched += Math.min(results.length, perDiagnosis)
  }

  console.log(`Harvested ${stats.fetched} images → ${imageQueue.length} to process (${stats.skippedDup} duplicates skipped)\n`)

  // Process with controlled concurrency
  const queue = [...imageQueue]
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const img = queue.shift()
      if (!img) break
      await processImage(img, stats)
    }
  })
  await Promise.all(workers)

  console.log('\n─────────────────────────────────────────────────────')
  console.log(`Images fetched       : ${stats.fetched}`)
  console.log(`Duplicates skipped   : ${stats.skippedDup}`)
  console.log(`Unusable images      : ${stats.skippedUnusable}`)
  console.log(`Cases generated      : ${stats.generated}`)
  console.log(`Errors               : ${stats.errors}`)
  console.log()
}

async function processImage(img, stats) {
  const { caseId, imageUrl, thumbnailUrl, uid, caption, modality: imgModality, abstract, entry } = img

  process.stdout.write(`[${caseId}] ${entry.diagName} — `)

  // Download image
  let imageData
  try {
    imageData = await downloadImageBase64(imageUrl)
  } catch (e) {
    process.stdout.write(`download failed: ${e.message}\n`)
    stats.errors++
    return
  }
  const { base64, mediaType } = imageData

  // Agent 1: analyze
  let analysis
  try {
    analysis = await analyzeImage(base64, mediaType, caption, abstract)
  } catch (e) {
    process.stdout.write(`Agent 1 failed: ${e.message}\n`)
    stats.errors++
    return
  }

  if (!analysis.usable) {
    process.stdout.write(`unusable — ${analysis.reason}\n`)
    stats.skippedUnusable++
    return
  }

  // Apply post-analysis filters
  if (filterSystem && analysis.system !== filterSystem) {
    process.stdout.write(`system mismatch (${analysis.system})\n`)
    return
  }
  if (filterDifficulty && analysis.difficulty !== filterDifficulty) {
    process.stdout.write(`difficulty mismatch (${analysis.difficulty})\n`)
    return
  }

  process.stdout.write(`${analysis.system} / ${analysis.difficulty} — ${analysis.diagnosis}\n`)

  if (dryRun) { stats.generated++; return }

  // Agent 2: generate case
  let caseData
  try {
    caseData = await generateCase(base64, mediaType, analysis)
  } catch (e) {
    process.stdout.write(`  Agent 2 failed: ${e.message}\n`)
    stats.errors++
    return
  }

  // Bug fixes applied at generation time:
  // (1) nativeDifficulty — img- cases were missing this field
  caseData.nativeDifficulty = analysis.difficulty
  // (2) history consistency — patch PMH if hiddenHistory reveals prior surgery/hospitalization
  caseData = reconcileHistoryConsistency(caseData)

  // Find the exact test name in availableImaging that maps to this modality
  const testName = matchTestName(caseData.availableImaging ?? [], entry.modality)
    ?? analysis.modality  // fallback to Agent 1's modality label

  // Build verified_images entry (image is the source, so it's pre-verified)
  const verifiedImages = {
    [testName]: {
      uid,
      imageUrl,
      thumbnailUrl,
      caption,
      modality:           imgModality,
      agentVerified:      true,
      confidence:         1.0,
      verificationReason: 'Image was the source for case generation — findings are anchored to this image.',
      verifiedAt:         new Date().toISOString(),
    },
  }

  // Save to Supabase
  const { error } = await supabase
    .from('cases')
    .upsert({
      id:             caseId,
      system:         analysis.system,
      difficulty:     analysis.difficulty,
      diagnosis:      analysis.diagnosis,
      variant_index:  0,
      case_data:      caseData,
      is_generated:   true,
      generated_at:   new Date().toISOString(),
      verified_images: verifiedImages,
    }, { onConflict: 'id' })

  if (error) {
    console.error(`  [DB ERROR] ${error.message}`)
    stats.errors++
  } else {
    console.log(`  => Saved: "${analysis.diagnosis}" (${analysis.system} / ${analysis.difficulty})`)
    stats.generated++
  }
}

main().catch(e => { console.error(e); process.exit(1) })

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
// Special-modality combos now live in scripts/lib/imageCaseCombos.mjs (single
// source, shared with the coverage planner). findingsField + findingsKeyword
// still match MODALITY_RULES in specialImageLookup.ts so the runtime image
// picker selects the correct category folder at render time.
import { SPECIAL_COMBOS as COMBOS } from './lib/imageCaseCombos.mjs'


import { CASE_SYSTEM_PROMPT, DIFFICULTY_RULES, CRITICAL_RULES, repairJson, reconcileHistoryConsistency } from './lib/casePromptScript.mjs'


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

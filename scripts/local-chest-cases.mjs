/**
 * Generate image-first chest cases from the local NIH ChestX-ray14 films.
 *
 * Unlike special-modality cases (findings in a *Findings field, image via
 * procedureResults), chest is RADIOLOGY: the film's finding is described in a
 * imagingResults radiology report, and the case is bound to ONE specific film
 * so image and case can't disagree (image-first). If that film has a reviewed
 * laterality (scripts/review-images.mjs → attributes.json), the case is
 * authored to that side; otherwise it is authored laterality-neutral.
 *
 * Each case is written with id: local-chest-{Finding}-0 and carries
 * localChestImage (the bound film) so the runtime serves that exact image.
 *
 * Usage:
 *   node scripts/local-chest-cases.mjs --dry-run        # generate + validate, no DB write
 *   node scripts/local-chest-cases.mjs                  # generate all 13
 *   node scripts/local-chest-cases.mjs --limit 3
 *   node scripts/local-chest-cases.mjs --category Effusion
 *   node scripts/local-chest-cases.mjs --force          # overwrite existing rows
 *
 * Requires ANTHROPIC_API_KEY (+ Supabase env for non-dry-run writes).
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { CHEST_COMBOS } from './lib/imageCaseCombos.mjs'
import { CASE_SYSTEM_PROMPT, DIFFICULTY_RULES, CRITICAL_RULES, repairJson, reconcileHistoryConsistency } from './lib/casePromptScript.mjs'
import { listDatasetImages, readAttributes, readBlocklist } from './lib/imageReview.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
config({ path: path.join(ROOT, '.env.local') })

const args = process.argv.slice(2)
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null }
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const limit = parseInt(getArg('--limit') ?? '0', 10)
const onlyCategory = getArg('--category')

if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set. Use --dry-run to plan the film binding without the API.')
  process.exit(1)
}

// ── Film binding: pick one specific film per finding (prefer reviewed) ─────────
async function pickBoundFilm(category) {
  const images = (await listDatasetImages('chest')).filter(img => img.category === category)
  if (!images.length) return null
  const attrs = await readAttributes('chest')
  const blocked = new Set(await readBlocklist('chest'))
  const usable = images.filter(img => !blocked.has(img.key))
  if (!usable.length) return null
  // Prefer a reviewed film (has a laterality attribute) so we can author the
  // case to a definite side; otherwise take the first usable film.
  const reviewed = usable.filter(img => attrs[img.key]?.laterality && attrs[img.key].laterality !== 'unknown')
  const chosen = reviewed[0] ?? usable[0]
  const laterality = attrs[chosen.key]?.laterality ?? 'unknown'
  return { publicPath: chosen.publicPath, key: chosen.key, laterality, reviewed: reviewed.length > 0 }
}

// ── Chest JSON schema (radiology: imagingResults, no findings keyword) ─────────
const CHEST_JSON_SCHEMA = `{
  "patientInfo": { "name": "First Last", "age": <number>, "gender": "Male or Female", "chiefComplaint": "<brief>", "height": "<e.g. 5'9\\">", "heightInches": <integer> },
  "hpi": "<2-3 sentences, HARD MAX 60 WORDS: chief complaint, primary symptom(s), duration only. Everything else → hiddenHistory.fullHistory.>",
  "clinicalHpi": "<2-3 sentences, MAX 40 WORDS>",
  "advancedHpi": "<HARD LIMIT 20 WORDS: age, sex, vague symptom, one misleading detail>",
  "vitals": { "bp": "<sys/dia mmHg>", "hr": <bpm>, "rr": <brpm>, "temp": <F>, "spo2": <pct>, "weight": "<lbs>" },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", ...EXACTLY DIFF_COUNT],
  "differentialExplanations": ["<dx>: <why it's on the list and what distinguishes it>", ...one per differential],
  "expectedLabs": ["<exact lab name from availableLabs>", ...3-7 in clinical priority order],
  "expectedImaging": ["Chest X-Ray (PA and Lateral)"],
  "keyQuestions": ["<question>", "<question>", "<question>", "<question>", "<question>"],
  "teachingPoints": ["<pearl 1>", "<pearl 2>", "<pearl 3>", "<management pearl>"],
  "reviewOfSystems": {
    "Constitutional": "<positives first, then denials>", "HEENT": "<findings>",
    "Cardiovascular": "<findings>", "Respiratory": "<findings>", "Gastrointestinal": "<findings>",
    "Genitourinary": "<findings>", "Musculoskeletal": "<findings>", "Neurological": "<findings>",
    "Psychiatric": "<findings>", "Integumentary": "<findings>", "Endocrine": "<findings>",
    "Hematologic/Lymphatic": "<findings>", "Allergic/Immunologic": "<findings>"
  },
  "physicalExam": {
    "General": "<appearance>", "HEENT": "<findings>", "Neck": "<findings>",
    "Cardiovascular": "<findings>", "Pulmonary": "PULMONARY_EXAM", "Abdomen": "<findings>",
    "Extremities": "<findings>", "Neurological": "<findings>", "Skin": "<findings>"
  },
  "availableLabs": ["<lab name>", ...10-14 relevant and distractor labs],
  "availableImaging": ["Chest X-Ray (PA and Lateral)", ...2-4 other relevant studies],
  "labGroups": [{ "name": "<panel name>", "tests": ["<exact lab name>", ...] }, ...group every lab],
  "labResults": {
    "<exact lab name from availableLabs>": {
      "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }]
    }
  },
  "imagingResults": {
    "Chest X-Ray (PA and Lateral)": "RADIOLOGY_REPORT"
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
  "pastMedicalHistory": { "conditions": "<chronic diagnoses>", "surgeries": "<prior surgeries>", "hospitalizations": "<prior hospitalizations>" },
  "currentMedications": { "medications": "<prescriptions with doses>", "otc": "<OTC/supplements>" },
  "socialHistory": { "smoking": "<tobacco use>", "alcohol": "<drinks/week>", "drugs": "<recreational>", "occupation": "<job>", "living": "<living situation>", "other": "<travel, diet, exposures>" },
  "relevantTests": [
    { "name": "<test name>", "category": "<Hematology|Metabolic & Chemistry|Urinalysis & Renal|Coagulation|Immunology & Serology|Infectious Disease|Cardiac|Arterial Blood Gas & Respiratory|Toxicology & Drug Levels|Imaging|Procedures & Special Tests>", "isImaging": <true|false>, "labResult": { "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }] }, "imagingResult": "<narrative if isImaging>" }
  ]
}`

function lateralityClause(laterality) {
  if (laterality === 'left' || laterality === 'right') {
    return `LATERALITY LOCK: The bound chest film shows a ${laterality.toUpperCase()}-sided abnormality. The radiology report, imagingCategory, and the Pulmonary physical exam MUST describe the finding on the ${laterality} side (and ONLY that side). Do not describe the contralateral side as abnormal.`
  }
  if (laterality === 'bilateral') {
    return `LATERALITY LOCK: The bound film shows BILATERAL findings. The report, imagingCategory, and Pulmonary exam MUST describe bilateral involvement.`
  }
  return `LATERALITY: No specific side is fixed for this film. Keep the radiology report and exam laterality-neutral (do not assert a specific side) OR describe the finding generically.`
}

async function generateChestCase(combo, film) {
  const { diagnosis, system, difficulty, imagingCategory } = combo
  const diffCount = difficulty === 'Foundations' ? '2-3' : difficulty === 'Clinical' ? '3-4' : '4-5'
  const lat = film?.laterality ?? 'unknown'

  const pulmExam = (lat === 'left' || lat === 'right')
    ? `<objective ${lat}-sided pulmonary exam findings consistent with ${imagingCategory}; contralateral side clear>`
    : `<objective pulmonary exam findings consistent with ${imagingCategory}>`
  const report = (lat === 'left' || lat === 'right')
    ? `<radiology-style report describing ${imagingCategory} in the ${lat} lung/hemithorax — objective findings only, NEVER name the diagnosis>`
    : `<radiology-style report describing ${imagingCategory} — objective findings only, NEVER name the diagnosis>`

  const schema = CHEST_JSON_SCHEMA
    .replace('RADIOLOGY_REPORT', report)
    .replace('PULMONARY_EXAM', pulmExam)
    .replace('IMAGE_CATEGORY', (lat === 'left' || lat === 'right') ? `${lat} ${imagingCategory}` : imagingCategory)
    .replace('DIFF_COUNT', diffCount)

  const prompt = `Generate a ${system} clinical training case. The diagnosis MUST be "${diagnosis}".

CHEST RADIOLOGY REQUIREMENT:
- "Chest X-Ray (PA and Lateral)" MUST appear in availableImaging with a radiology report in imagingResults (NOT procedureResults).
- The report must describe the radiographic finding "${imagingCategory}" objectively, and MUST NOT name the diagnosis.
- ${lateralityClause(lat)}

${DIFFICULTY_RULES[difficulty]}

${CRITICAL_RULES}

${schema}`

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: CASE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })
  return JSON.parse(repairJson(response.content[0]?.text ?? ''))
}

function validate(caseData, film) {
  const imaging = caseData.availableImaging ?? []
  if (!imaging.some(i => /chest x-?ray/i.test(i))) {
    throw new Error(`availableImaging missing a chest X-ray (got: ${JSON.stringify(imaging)})`)
  }
  const key = Object.keys(caseData.imagingResults ?? {}).find(k => /chest x-?ray/i.test(k))
  if (!key || !caseData.imagingResults[key]) {
    throw new Error('imagingResults missing the chest X-ray report')
  }
  // Laterality consistency: if the film is a definite side, the report must not
  // assert the opposite side.
  if (film?.laterality === 'left' || film?.laterality === 'right') {
    const report = caseData.imagingResults[key].toLowerCase()
    const opposite = film.laterality === 'left' ? 'right' : 'left'
    const oppRe = new RegExp(`\\b${opposite}(?:[-\\s]sided?)?\\b`)
    const sameRe = new RegExp(`\\b${film.laterality}(?:[-\\s]sided?)?\\b`)
    if (oppRe.test(report) && !sameRe.test(report)) {
      throw new Error(`report asserts ${opposite} side but bound film is ${film.laterality}`)
    }
  }
}

async function processCombo(combo, stats) {
  const caseId = `local-chest-${combo.category}-0`
  const film = await pickBoundFilm(combo.category)
  if (!film) {
    console.log(`[${caseId}] SKIP — no usable film in public/imaging for "${combo.category}"`)
    stats.skipped++
    return
  }
  process.stdout.write(`[${caseId}] ${combo.diagnosis} ← ${film.key} (${film.laterality}${film.reviewed ? ', reviewed' : ', unreviewed'}) — `)

  if (dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.log('planned (dry-run, no API key)')
    stats.planned++
    return
  }

  let caseData
  try {
    caseData = await generateChestCase(combo, film)
    caseData = reconcileHistoryConsistency(caseData)
    validate(caseData, film)
  } catch (e) {
    console.log(`FAILED: ${e.message}`)
    stats.errors++
    return
  }

  // Stamp the image-first binding + native difficulty.
  caseData.localChestImage = film.publicPath
  caseData.localChestCategory = combo.category
  caseData.nativeDifficulty = combo.difficulty

  if (dryRun) { console.log('generated OK (dry-run, not saved)'); stats.generated++; return }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const { splitCase } = await import('../app/lib/server/caseTiers.mjs')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const tiers = splitCase(caseData)
    const { error } = await supabase.from('cases').upsert({
      id: caseId, system: combo.system, difficulty: combo.difficulty, diagnosis: combo.diagnosis,
      variant_index: 0, case_data: caseData,
      presentation_data: tiers.presentation, patient_knowledge: tiers.patientKnowledge,
      clinical_findings: tiers.clinicalFindings, ground_truth: tiers.groundTruth,
      is_generated: true, generated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) throw new Error(error.message)
    console.log('saved')
    stats.generated++
  } catch (e) {
    console.log(`SAVE FAILED: ${e.message}`)
    stats.errors++
  }
}

async function main() {
  let combos = CHEST_COMBOS
  if (onlyCategory) combos = combos.filter(c => c.category.toLowerCase() === onlyCategory.toLowerCase())
  if (limit > 0) combos = combos.slice(0, limit)
  if (!force && !dryRun && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('Supabase env vars required to save (or use --dry-run).'); process.exit(1)
  }

  console.log(`\n${combos.length} chest case(s) to ${dryRun ? 'plan/validate' : 'generate'}\n`)
  const stats = { generated: 0, errors: 0, skipped: 0, planned: 0 }
  for (const combo of combos) await processCombo(combo, stats)

  console.log('\n─────────────────────────────────────────────')
  console.log(`Generated: ${stats.generated}  Planned: ${stats.planned}  Skipped: ${stats.skipped}  Errors: ${stats.errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })

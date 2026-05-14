/**
 * Batch case library filler — generates cases directly into Supabase.
 *
 * This script mirrors the exact prompt used in app/page.tsx (generateCase).
 * If the prompt in page.tsx changes, update the constants here too.
 *
 * Usage:
 *   node scripts/fill-library.mjs
 *   node scripts/fill-library.mjs --system Cardiovascular
 *   node scripts/fill-library.mjs --system Cardiovascular --difficulty Foundations
 *   node scripts/fill-library.mjs --variant 0          # only variant 0 (default: all)
 *   node scripts/fill-library.mjs --concurrency 3      # parallel API calls (default: 3)
 *   node scripts/fill-library.mjs --force              # regenerate even if already generated
 *   node scripts/fill-library.mjs --dry-run            # print what would be generated
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
import { MANIFEST, VARIANT_SEEDS } from './case-manifest.mjs'
import { config } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Load .env.local ───────────────────────────────────────────────────────────
config({ path: path.join(ROOT, '.env.local') })

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set in .env.local or environment.')
  process.exit(1)
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.')
  process.exit(1)
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function getArg(flag) {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : null
}
const filterSystem = getArg('--system')
const filterDifficulty = getArg('--difficulty')
const filterVariant = getArg('--variant') !== null ? parseInt(getArg('--variant'), 10) : null
const filterIds = getArg('--ids') ? new Set(getArg('--ids').split(',').map(s => s.trim())) : null
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const concurrency = parseInt(getArg('--concurrency') ?? '3', 10)

// ── Clients ───────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── ID helpers ────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function makeCaseId(system, difficulty, diagnosis, variantIndex) {
  return `${slugify(system)}-${slugify(difficulty)}-${slugify(diagnosis)}-${variantIndex}`
}

// ── Prompts (must match app/page.tsx generateCase) ────────────────────────────
const SYSTEM_PROMPT = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. Draw from diverse ethnicities and countries each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.). Never reuse first names or last names across cases.`

const DIFFICULTY_RULES = {
  Foundations: `DIFFICULTY — FOUNDATIONS:
- Common, high-prevalence diagnosis with a classic, unambiguous presentation
- ONE age-appropriate comorbidity is permitted (e.g. hypertension in a cardiac case, type 2 diabetes in a renal case) but it must not alter the diagnosis, obscure the clinical picture, or introduce lab ambiguity
- Labs and imaging directly confirm the diagnosis — values are clearly abnormal in the expected direction with no misleading results
- Physical exam findings are classic and confined to the primary organ system
- The patient's history, when asked, provides straightforward supporting detail that reinforces the diagnosis
- 2-3 differentials generated; the correct diagnosis is clearly favored by the combination of history, exam, and objective data`,

  Clinical: `DIFFICULTY — CLINICAL:
- Common-to-moderate prevalence diagnosis encountered regularly by general internists, hospitalists, or emergency physicians
- DO NOT generate rare diseases (prevalence <1:10,000), subspecialty-only diagnoses, or conditions requiring fellowship-level expertise
- ONE atypical feature that actively misleads toward a competing differential — this must be a specific finding (e.g. pleuritic chest pain in a PE case that mimics pericarditis, or fever in a PE case that suggests pneumonia) not just a vague "unusual presentation"
- ONE comorbidity that meaningfully changes either the expected presentation, the lab interpretation, or the clinical management — it must do clinical work, not just exist as background
- At least one lab value that cannot be interpreted correctly in isolation — it requires correlation with another finding (history, imaging, or a second lab) to reach the right conclusion
- Physical exam includes one finding that supports a plausible wrong differential
- 3-4 genuine differentials, at least one requiring a specific confirmatory test to exclude`,

  Advanced: `DIFFICULTY — ADVANCED:
- ONE uncommon or rare diagnosis — do NOT stack multiple rare conditions
- Comorbidities must be common conditions (hypertension, diabetes, COPD, CKD, obesity) — they may complicate interpretation but must not themselves be rare
- ONE objective red herring in the data: a lab value, vital sign, or physical exam finding that actively supports a wrong diagnosis (e.g. a mildly elevated troponin in an aortic dissection case, or an elevated creatinine that points toward renal failure when the primary diagnosis is something else)
- Physical exam must include at least one finding that subtly distinguishes the correct diagnosis from its closest mimic — it should not be prominently flagged, but must be present for a careful examiner to notice
- Lab and imaging findings require synthesis across multiple data points — no single result is diagnostic on its own except the pathognomonic confirmatory test
- The case MUST include one pathognomonic or definitively discriminating result available in availableLabs or availableImaging that rules in the correct diagnosis when specifically ordered — this finding must not appear in hiddenHistory alone
- 4-5 differentials with at least two that are strongly supported by early data before the discriminating test is ordered`,
}

const JSON_SCHEMA = `{
  "patientInfo": {
    "name": "First Last",
    "age": <number>,
    "gender": "Male or Female",
    "chiefComplaint": "<brief chief complaint>",
    "height": "<height in feet and inches e.g. 5'9\\">",
    "heightInches": <total height in inches as integer e.g. 69>
  },
  "hpi": "<2-3 sentences. HARD MAXIMUM 60 WORDS — count every word and cut if over. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN: associated symptoms, review of systems positives, family history, social history details, exam findings, and ANY detail that narrows the differential to a single diagnosis (e.g. heat intolerance, exophthalmos, tremor, toxin/substance names, radiation, aggravating/relieving factors). Everything forbidden here belongs in hiddenHistory.fullHistory so the patient can reveal it during the clinical interview.>",
  "clinicalHpi": "<2-3 sentences ONLY. MAXIMUM 40 WORDS TOTAL. State age, sex, primary symptom, and duration. STOP THERE. Do NOT include associated symptoms, characterization, radiation, pertinent positives or negatives — all additional detail belongs in hiddenHistory.fullHistory>",
  "advancedHpi": "<HARD LIMIT: 20 WORDS MAXIMUM — count every word before writing. Format: [Age]yo [sex] with [vague symptom]. [One misleading/incidental detail]. Nothing else. Example: '52yo male with fatigue. Recently started a new blood pressure medication.'>",
  "vitals": {
    "bp": "<systolic/diastolic mmHg>",
    "hr": <beats per minute>,
    "rr": <breaths per minute>,
    "temp": <Fahrenheit decimal>,
    "spo2": <percent integer>,
    "weight": "<lbs>"
  },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", ...GENERATE EXACTLY DIFF_COUNT DIFFERENTIALS — no more, no fewer],
  "differentialExplanations": ["<dx 1>: <1 sentence — why it belongs on the differential and the single most important finding that distinguishes it from the correct diagnosis>", ...one entry per differential — MUST match differentials array length],
  "expectedLabs": ["<exact lab name copied character-for-character from availableLabs that a competent physician MUST order to diagnose or manage this case>", ...list 3-7 key labs in order of clinical priority],
  "expectedImaging": ["<exact imaging/procedure name copied character-for-character from availableImaging that should be ordered>", ...list 0-3 key studies — RETURN AN EMPTY ARRAY [] if imaging is not part of the standard diagnostic workup for this diagnosis (e.g. ITP, hemophilia, von Willebrand disease, viral URI, simple migraine, hypothyroidism, primary hyperaldosteronism workup, most endocrine and hematologic diagnoses are lab-only). Do NOT invent imaging just to fill the array.],
  "keyQuestions": [
    "<important question the physician should have asked the patient>",
    "<important question>",
    "<important question>",
    "<important question>",
    "<important question>"
  ],
  "teachingPoints": ["<clinical pearl 1>", "<clinical pearl 2>", "<clinical pearl 3>", "<clinical pearl 4>"],
  "reviewOfSystems": {
    "Constitutional":          "<explicit findings — state positives first, then denials. e.g. 'Fatigue present. Denies fever, chills, night sweats, weight loss.'>",
    "HEENT":                   "<explicit findings — state positives first, then denials>",
    "Cardiovascular":          "<explicit findings — state positives first, then denials>",
    "Respiratory":             "<explicit findings — state positives first, then denials>",
    "Gastrointestinal":        "<explicit findings — state positives first, then denials>",
    "Genitourinary":           "<explicit findings — state positives first, then denials>",
    "Musculoskeletal":         "<explicit findings — state positives first, then denials>",
    "Neurological":            "<explicit findings — state positives first, then denials>",
    "Psychiatric":             "<explicit findings — state positives first, then denials>",
    "Integumentary":           "<explicit findings — state positives first, then denials>",
    "Endocrine":               "<explicit findings — state positives first, then denials>",
    "Hematologic/Lymphatic":   "<explicit findings — state positives first, then denials>",
    "Allergic/Immunologic":    "<explicit findings — state positives first, then denials>"
  },
  "physicalExam": {
    "General": "<appearance and demeanor>",
    "HEENT": "<findings>",
    "Neck": "<findings>",
    "Cardiovascular": "<auscultation, pulses, JVD, edema>",
    "Pulmonary": "<auscultation, percussion, work of breathing>",
    "Abdomen": "<inspection, auscultation, palpation, organomegaly>",
    "Extremities": "<findings>",
    "Neurological": "<findings>",
    "Skin": "<findings>"
  },
  "availableLabs": ["<lab name>", "<lab name>", ...include 10-14 relevant and distractor labs],
  "availableImaging": ["<study name>", ...include 3-5 relevant and distractor studies],
  CARDIAC TEST RULE: When the case involves cardiovascular pathology, chest pain, dyspnea, or syncope — always include "Electrocardiogram (ECG/EKG)" in availableImaging (NEVER in availableLabs) with a narrative ECG report in imagingResults describing rhythm, rate, PR/QRS/QTc intervals, axis, and any ST or T-wave changes. Also include "Troponin I or T (high sensitivity)" and "BNP / NT-proBNP" in availableLabs with numeric values in labResults.
  "labGroups": [
    { "name": "<panel name e.g. Complete Blood Count (CBC)>", "tests": ["<exact lab name from availableLabs>", ...] },
    ...group every lab from availableLabs into a named panel; standalone tests get their own single-item group
  ],
  "labResults": {
    "<panel name from availableLabs e.g. Complete Blood Count (CBC)>": {
      "components": [
        { "name": "<analyte e.g. WBC>", "value": "<numeric value e.g. 7.2>", "unit": "<unit e.g. x10³/µL>", "referenceRange": "<range e.g. 4.5-11.0>", "status": "<normal|abnormal|critical>" },
        { "name": "<analyte e.g. Hemoglobin>", "value": "...", "unit": "...", "referenceRange": "...", "status": "..." }
      ]
    }
  },
  "imagingResults": {
    "<each imaging study from availableImaging e.g. Chest X-Ray, CT Chest, MRI Brain>": "<radiology-style report impression, 2-3 sentences>"
  },
  "procedureResults": {
    "<procedure name exactly as listed in availableImaging e.g. Upper Endoscopy (EGD), Colonoscopy, Bronchoscopy, Lumbar Puncture>": "<narrative procedure report describing visualized findings, 2-4 sentences — include what was seen, any specimens taken, and immediate impression>"
  },
  PROCEDURE RULE: For any diagnostic procedure in availableImaging (endoscopy, colonoscopy, bronchoscopy, lumbar puncture, paracentesis, thoracentesis, arthrocentesis), generate a narrative result in procedureResults using the EXACT same procedure name as the key, copied character-for-character from availableImaging. Only include procedures clinically relevant to the diagnosis. Imaging studies (X-ray, CT, MRI, ultrasound, echo) go in imagingResults, NOT procedureResults.
  "hiddenHistory": {
    "fullHistory": "<Complete clinical history withheld from the HPI: all associated symptoms, true onset, duration, character, radiation, aggravating/relieving factors, pertinent positives, pertinent negatives, and the most pathognomonic finding. Gate the most diagnostic detail — only reveal it if the physician asks about it specifically by name or direct description. Reveal each finding only when the physician directly asks.>",
    "socialHistory": "<smoking pack-years, alcohol drinks/week, recreational drugs, occupation, living situation, recent travel>",
    "familyHistory": "<relevant family history with relationships and conditions>",
    "medications": "<current medications with doses and frequencies>",
    "hiddenSymptoms": "<1-2 symptoms patient hasn't mentioned but will confirm if asked directly>",
    "allergies": "<drug allergies with reaction type, or NKDA>"
  },
  "imagingCategory": "<1-3 word radiological descriptor of the key imaging finding expected in this case, using radiology terminology — e.g. 'bilateral pleural effusion', 'pneumothorax', 'pulmonary consolidation', 'sigmoid mass', 'renal cortical thinning'. This should reflect what an imaging study would show, not the diagnosis name.>",
  "ecgFindings": "<1-2 sentence description of what the ECG shows in this case, using standard ECG terminology. Examples: 'Sinus tachycardia at 108 bpm. No ST changes or arrhythmia.' | 'Atrial fibrillation with rapid ventricular response at 130 bpm. No ST changes.' | 'Normal sinus rhythm with ST elevation in leads V2-V5 consistent with anterior STEMI. Reciprocal ST depression in inferior leads.' | 'Sinus bradycardia at 48 bpm. First-degree AV block with PR interval 220ms.' This field drives ECG image selection and display.>",
  "hematologyFindings": "<If peripheral blood smear is clinically relevant, describe what it shows — e.g. 'Parasitized RBCs with ring forms visible, consistent with Plasmodium falciparum.' or 'Microcytic hypochromic red cells with target cells, consistent with iron deficiency anemia.' Omit or leave blank if not relevant to the case.>",
  "urineFindings": "<If urinalysis or urine microscopy is clinically relevant, describe the microscopy findings — e.g. 'WBCs and bacteria visible; leukocyte esterase positive. Consistent with UTI.' or 'RBC casts present; dysmorphic RBCs noted. Consistent with glomerulonephritis.' Omit or leave blank if not relevant.>",
  "skinFindings": "<If a skin lesion or biopsy is relevant, describe the dermoscopic appearance — e.g. 'Irregular border with atypical pigment network and regression areas, concerning for melanoma.' Omit or leave blank if not relevant.>",
  "fundusFindings": "<If ophthalmoscopy or fundoscopy is relevant, describe fundus findings — e.g. 'Bilateral flame hemorrhages, disc swelling, and AV nicking consistent with hypertensive retinopathy.' or 'Increased cup-to-disc ratio >0.7 with superior rim thinning, suspicious for glaucoma.' Omit or leave blank if not relevant.>",
  "biopsyFindings": "<If histopathology (H&E biopsy) is relevant, describe what the pathology shows — e.g. 'Dysplastic glandular epithelium with nuclear pleomorphism and cribriform architecture, consistent with adenocarcinoma.' Omit or leave blank if not relevant.>",
  "pastMedicalHistory": {
    "conditions": "<chronic diagnoses and health problems — if none, write exactly 'None.' and nothing else; never name the diagnosis or related conditions>",
    "surgeries": "<prior surgeries and procedures — if none, write exactly 'None.' and nothing else; never name the diagnosis or related procedures>",
    "hospitalizations": "<prior hospitalizations and ER visits — if none, write exactly 'None.' and nothing else; never name the diagnosis or related events>"
  },
  "currentMedications": {
    "medications": "<prescription medications with doses and frequencies, or 'None'>",
    "otc": "<OTC drugs, vitamins, and supplements, or 'None'>"
  },
  "socialHistory": {
    "smoking": "<tobacco or vaping use with pack-years if applicable, or 'Never smoker'>",
    "alcohol": "<alcohol use in drinks per week, or 'Denies'>",
    "drugs": "<recreational drug use, or 'Denies'>",
    "occupation": "<current job and work environment>",
    "living": "<living situation, family members, marital status>",
    "other": "<relevant travel, exercise habits, diet, chemical exposures>"
  },
  "relevantTests": [
    RELEVANT TESTS RULE: Generate 5-10 tests that are specifically relevant to THIS case's primary diagnosis AND each significant comorbidity. Include both the gold-standard confirmatory test and 1-2 meaningful alternatives. These supplement the standard availableLabs/availableImaging — focus on specialty tests a student might miss (e.g. vWF Antigen + Ristocetin Cofactor + Factor VIII Activity for von Willebrand disease, or X-Ray Knee + MRI Knee for a musculoskeletal knee case, or ESR + CRP + RF + Anti-CCP for a rheumatoid arthritis case). Provide realistic result values appropriate to the diagnosis.
    {
      "name": "<exact test name as it would appear on an order — e.g. 'vWF Antigen', 'X-Ray Knee (AP/Lateral)', 'Factor VIII Activity'>",
      "category": "<one of: Hematology | Metabolic & Chemistry | Urinalysis & Renal | Coagulation | Immunology & Serology | Infectious Disease | Cardiac | Arterial Blood Gas & Respiratory | Toxicology & Drug Levels | Imaging | Procedures & Special Tests>",
      "isImaging": <true for X-ray, CT, MRI, US, nuclear study, ECG, endoscopy; false for all lab tests>,
      "labResult": {
        "components": [
          { "name": "<analyte name>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }
        ]
      },
      "imagingResult": "<radiology or procedure narrative — omit if isImaging is false>"
    }
  ]
}`

const CRITICAL_RULES = `Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component (e.g. CBC must expand into WBC, Hemoglobin, Hematocrit, Platelets, etc.). Single-value tests also use a one-item components array.
CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result. Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs — copy it character-for-character. Do NOT use abbreviations or shortened names as keys. For example if availableLabs contains "Prothrombin Time (PT) / INR", the labResults key must be "Prothrombin Time (PT) / INR" not "PT/INR" or "PT" or "Coagulation Panel".
CRITICAL: The lab/imaging results must include at least one finding that definitively confirms the correct diagnosis over its closest differential (e.g. for gout: monosodium urate crystals on synovial fluid; for PE: filling defect on CT-PA; for MI: ST elevation + troponin). Do not generate ambiguous results that leave the diagnosis unconfirmable from the data provided.
STEMI RULE: When the diagnosis is any form of STEMI (inferior, anterior, lateral, posterior, STEMI equivalent), the ecgFindings field MUST explicitly state the affected leads with millimeter elevation (e.g. "2mm ST elevation in leads II, III, and aVF with reciprocal ST depression in I and aVL, consistent with inferior STEMI"). Never write borderline or possible ST elevation for a STEMI diagnosis — the ECG must be unambiguously diagnostic.
AIN/DRUG-INDUCED NEPHRITIS RULE: When the diagnosis is Acute Interstitial Nephritis (AIN), drug-induced nephropathy, or similar medication-triggered renal injury, the causative agent (NSAID, antibiotic, PPI, etc.) MUST appear prominently in currentMedications.otc or currentMedications.medications with duration (e.g. "Ibuprofen 600mg TID × 3 weeks"). It must be listed as a recent or current medication, not just mentioned in passing.
FIBRILLARY GN EXCLUSION: Do NOT generate Fibrillary Glomerulonephritis as a diagnosis at any difficulty. For Advanced Renal cases, choose instead: IgA Nephropathy (Berger's Disease), Focal Segmental Glomerulosclerosis (FSGS), Membranous Nephropathy, ANCA-associated vasculitis, or Thrombotic Microangiopathy.
WHIPPLE'S BIOPSY RULE: When the diagnosis is Whipple's Disease (Tropheryma whipplei), "Upper Endoscopy (EGD) with Small Bowel Biopsy" MUST be included in availableImaging, and the procedureResults entry for it MUST explicitly describe PAS-positive macrophages with foamy cytoplasm distending the lamina propria — the pathognomonic histological finding without which the diagnosis cannot be confirmed.
CLL DISCRIMINATOR RULE: When the diagnosis is Chronic Lymphocytic Leukemia (CLL) or CLL with AIHA, "Flow Cytometry (Peripheral Blood)" MUST be included in availableLabs and its labResults MUST show CD5+/CD19+/CD23+ lymphocyte population — the immunophenotype that distinguishes CLL from PNH, lymphoma, and other B-cell malignancies.
WALDENSTRÖM DISCRIMINATOR RULE: When the diagnosis is Waldenström Macroglobulinemia, "Serum Protein Electrophoresis (SPEP) with Immunofixation" MUST be in availableLabs and its labResults MUST show an IgM monoclonal spike. The hiddenHistory.fullHistory or hiddenSymptoms MUST include at least one hyperviscosity symptom (blurred vision, headache, epistaxis, or neurological changes) to distinguish from Multiple Myeloma (which produces IgG/IgA, not IgM).
PAST HISTORY CONSISTENCY RULE: The pastMedicalHistory fields shown to the patient (conditions, surgeries, hospitalizations) MUST NOT contradict hiddenHistory.fullHistory. If pastMedicalHistory.surgeries states "None" or "No prior surgeries", then hiddenHistory.fullHistory MUST NOT reveal any surgeries. The patient's visible history and hidden history must be completely consistent — the hidden history may ADD detail, but must never contradict what was already stated.
PHYSICAL EXAM OBJECTIVITY RULE: Every physicalExam field MUST describe only objective, observable findings (e.g., "dullness to percussion at right base", "pitting edema 2+ bilateral lower extremities", "JVD at 45 degrees"). NEVER include diagnostic interpretations, disease names, or phrases like "consistent with X", "suggesting X", or "findings of X". The exam reports what the clinician sees, hears, and feels — not what it means. Diagnosis is the user's task.
CLINICAL HPI WORD LIMIT RULE: The clinicalHpi field is a HARD MAXIMUM of 40 words. Count every word. If your draft exceeds 40 words, cut it. State only: age, sex, primary symptom, and duration. Do NOT add associated symptoms, characterization, radiation, pertinent positives/negatives, or social context — those belong in hiddenHistory.fullHistory. Two to three sentences only.
FOUNDATIONS HPI WORD LIMIT RULE: The hpi field is a HARD MAXIMUM of 60 words. Count every word. If your draft exceeds 60 words, cut it. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN in hpi: associated symptoms, review of systems positives, family history, social history details, exam findings on arrival, and ANY diagnosis-narrowing detail (e.g. heat intolerance, exophthalmos, tremor, radiation, toxin names). Move everything forbidden into hiddenHistory.fullHistory — the patient will reveal these during the clinical interview when asked. The hpi must leave the differential open.`

// ── History reconciliation ────────────────────────────────────────────────────
// Detects contradictions between pastMedicalHistory (visible to student) and
// hiddenHistory.fullHistory, then patches PMH to be consistent.
// A contradiction exists when PMH denies a surgery/hospitalization but
// hiddenHistory reveals one that happened before the current admission.
const SURG_DENIAL      = /\b(none|no prior|no past|no surgical|no history of surgery|denies.{0,10}surgery|has not had any)\b/i
const SURG_MENTION     = /\b(surgery|surgeries|surgical|appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|bypass|repair|resection|transplant|excision|\w+ectomy|\w+otomy|\w+ostomy|\w+plasty)\b/i
const HOSP_DENIAL      = /\b(none|no prior|no past|never been hospitalized|no hospitalizations|denies.{0,10}hospitalization)\b/i
const HOSP_MENTION     = /\b(hospitali[sz]|admitted to.{0,20}hospital|inpatient stay|ICU admission|intensive care unit admission)\b/i
// Named procedures — their presence in PMH means it already has real history (not a pure denial)
const NAMED_PROCEDURE  = /\b(appendectomy|cholecystectomy|colectomy|gastrectomy|hysterectomy|mastectomy|arthroscopy|c-section|cesarean|bypass|transplant|nephrectomy|splenectomy|thyroidectomy|laminectomy|craniotomy|laparotomy|laparoscopy|ORIF|tonsillectomy|herniorrhaphy|hernia repair|thrombectomy|endarterectomy|angioplasty|pacemaker|amputation)\b/i
// Mentions that refer to the CURRENT admission, not prior history
const CURRENT_OP       = /\b(this admission|current (admission|hospitalization|presentation|episode|injury|surgery)|on arrival|emergent(ly)?|urgent(ly)?|was brought|following the (trauma|injury|accident)|for the current|perioperative|pre-?operatively|post-?operatively|post-?surgery|status post.*this)\b/i
// Mentions that are future/planned, not past
const FUTURE_OP        = /\b(may require|might need|could require|planned|will undergo|referral for|considering|surgical candidate|recommended for surgery|potential surgery|surgical option)\b/i
// Sentences in hiddenHistory that themselves deny surgery/hospitalization (not genuine contradictions)
const SURG_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(surgery|surgeries|surgical|procedure|procedures|operation|operations|fasciotomy|splenectomy|appendectomy|cholecystectomy)\b/i
const HOSP_SENT_DENIAL = /\b(no|not|never|denies?|without)\b.{0,100}\b(hospitalization|hospitalizations|hospitalized|inpatient|admitted)\b/i
// Natural pathological processes that match \w+ectomy but are not surgical procedures
const AUTO_PROCEDURE   = /\bautosplenectomy\b/i

function reconcileHistoryConsistency(caseData) {
  const pmh    = caseData.pastMedicalHistory
  const hidden = caseData.hiddenHistory
  if (!pmh || !hidden?.fullHistory) return caseData

  const full = hidden.fullHistory
  const sentences = full.split(/(?<=[.!?])\s+/)

  let updated = false
  const newPmh = { ...pmh }

  // Surgery reconciliation — only when PMH is a pure denial (no named procedures already listed)
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

  // Hospitalization reconciliation — only when PMH doesn't already mention a hospitalization
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

function buildPrompt(system, diagnosis, nativeDifficulty, variantIndex) {
  const variantSeed = variantIndex > 0 ? VARIANT_SEEDS[variantIndex] : null
  const variantInstruction = variantSeed ? `\nVARIANT INSTRUCTION: ${variantSeed}` : ''
  const diffRules = DIFFICULTY_RULES[nativeDifficulty] ?? DIFFICULTY_RULES.Foundations
  const diffCount = nativeDifficulty === 'Foundations' ? '2-3' : nativeDifficulty === 'Clinical' ? '3-4' : '4-5'
  const schema = JSON_SCHEMA.replace('DIFF_COUNT', diffCount)
  return `Generate a realistic ${system} clinical case. The diagnosis for this case MUST be "${diagnosis}". Do not substitute a different diagnosis. Strictly follow the difficulty rules below.

${diffRules}

${CRITICAL_RULES}
${schema}${variantInstruction}`
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function getGeneratedIds() {
  const generated = new Set()
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('id')
      .eq('is_generated', true)
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Supabase query failed: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) generated.add(row.id)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return generated
}

async function saveToSupabase(id, system, difficulty, diagnosis, variantIndex, caseData) {
  const { error } = await supabase
    .from('cases')
    .upsert({
      id,
      system,
      difficulty,
      diagnosis,
      variant_index: variantIndex,
      case_data: caseData,
      is_generated: true,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
}

// ── JSON repair ───────────────────────────────────────────────────────────────
function repairJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Claude response')
  let json = match[0]

  // Fix missing opening quote on string component fields.
  // Pattern: "key": unquoted-value" → "key": "unquoted-value"
  // The captured group already includes the closing quote, so we only prepend ".
  json = json.replace(
    /"(unit|value|referenceRange|status)":\s+([^",{\[\s\n][^,\n}\]]*")/g,
    '"$1": "$2'
  )

  // Fix trailing commas before ] or }
  json = json.replace(/,(\s*[}\]])/g, '$1')

  return json
}

// ── Generation ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function generateCase(system, difficulty, diagnosis, variantIndex) {
  const MAX_RETRIES = 3
  let lastError

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const isRateLimit = lastError?.message?.includes('429')
      const delay = isRateLimit ? 65_000 : 2 ** attempt * 2_000
      if (isRateLimit) process.stdout.write('\n  Rate limited — waiting 65s…\n')
      else process.stdout.write(`\n  Retry ${attempt}/${MAX_RETRIES} (${lastError?.message?.slice(0, 50)})…\n`)
      await sleep(delay)
    }

    try {
      const prompt = buildPrompt(system, diagnosis, difficulty, variantIndex)
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 12000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content[0]?.text ?? ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in Claude response')

      // Try direct parse, then repair on failure
      let parsed
      try {
        parsed = JSON.parse(match[0])
      } catch {
        parsed = JSON.parse(repairJson(text))
      }

      parsed.nativeDifficulty = difficulty

      // Merge relevantTests into the available lists (mirrors page.tsx logic)
      if (Array.isArray(parsed.relevantTests)) {
        for (const rt of parsed.relevantTests) {
          if (!rt.name) continue
          if (rt.isImaging && rt.imagingResult) {
            if (!parsed.imagingResults) parsed.imagingResults = {}
            parsed.imagingResults[rt.name] = rt.imagingResult
            if (!parsed.availableImaging) parsed.availableImaging = []
            if (!parsed.availableImaging.includes(rt.name)) parsed.availableImaging.push(rt.name)
          } else if (!rt.isImaging && rt.labResult) {
            if (!parsed.labResults) parsed.labResults = {}
            parsed.labResults[rt.name] = rt.labResult
            if (!parsed.availableLabs) parsed.availableLabs = []
            if (!parsed.availableLabs.includes(rt.name)) parsed.availableLabs.push(rt.name)
          }
        }
      }

      return reconcileHistoryConsistency(parsed)
    } catch (e) {
      lastError = e
    }
  }

  throw lastError
}

// ── Semaphore ─────────────────────────────────────────────────────────────────
function makeSemaphore(limit) {
  let running = 0
  const queue = []
  function next() {
    if (running >= limit || queue.length === 0) return
    running++
    const { fn, resolve, reject } = queue.shift()
    fn().then(v => { running--; resolve(v); next() }).catch(e => { running--; reject(e); next() })
  }
  return fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Build the work list
  const variants = filterVariant !== null ? [filterVariant] : VARIANT_SEEDS.map((_, i) => i)
  const work = []

  for (const [system, byDiff] of Object.entries(MANIFEST)) {
    if (filterSystem && system !== filterSystem) continue
    for (const [difficulty, diagnoses] of Object.entries(byDiff)) {
      if (filterDifficulty && difficulty !== filterDifficulty) continue
      for (const diagnosis of diagnoses) {
        for (const vi of variants) {
          work.push({ system, difficulty, diagnosis, variantIndex: vi, id: makeCaseId(system, difficulty, diagnosis, vi) })
        }
      }
    }
  }

  if (dryRun) {
    console.log(`Dry run — would generate ${work.length} cases:`)
    for (const { id } of work) console.log(`  ${id}`)
    return
  }

  // Filter out already-generated cases
  console.log('Checking Supabase for existing generated cases…')
  let generatedIds
  try {
    generatedIds = await getGeneratedIds()
  } catch (e) {
    console.error('Failed to query Supabase:', e.message)
    process.exit(1)
  }

  const todo = (force ? work : work.filter(w => !generatedIds.has(w.id)))
    .filter(w => !filterIds || filterIds.has(w.id))
  const skipped = work.length - todo.length

  if (todo.length === 0) {
    console.log(`All ${work.length} cases already generated. Use --force to regenerate.`)
    return
  }

  console.log(`${todo.length} to generate, ${skipped} already done. Concurrency: ${concurrency}\n`)

  const sem = makeSemaphore(concurrency)
  let done = 0
  let failed = 0
  const failures = []

  await Promise.all(todo.map(item => sem(async () => {
    const label = `[${item.system} / ${item.difficulty} / v${item.variantIndex}] ${item.diagnosis}`
    try {
      const caseData = await generateCase(item.system, item.difficulty, item.diagnosis, item.variantIndex)
      await saveToSupabase(item.id, item.system, item.difficulty, item.diagnosis, item.variantIndex, caseData)
      done++
      process.stdout.write(`\r✓ ${done}/${todo.length} — ${label.slice(0, 80).padEnd(80)}`)
    } catch (e) {
      failed++
      failures.push({ id: item.id, error: e.message })
      process.stdout.write(`\n✗ FAILED ${label}: ${e.message}\n`)
    }
  })))

  console.log(`\n\nDone. ${done} generated, ${failed} failed.`)

  if (failures.length > 0) {
    console.log('\nFailed cases:')
    for (const f of failures) console.log(`  ${f.id}: ${f.error}`)
  }

  // claude-sonnet-4-6: $3/M input, $15/M output — rough 4K in / 8K out per case
  const estimatedCost = done * ((4000 * 3 + 8000 * 15) / 1_000_000)
  console.log(`\nEstimated API cost: ~$${estimatedCost.toFixed(2)} (rough estimate — actual output tokens vary)`)
}

main().catch(e => { console.error(e); process.exit(1) })

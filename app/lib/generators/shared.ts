/**
 * Shared constants and utilities for clinical case generation.
 * Used by admin API routes (PATCH/regenerate) and importable from server-side Next.js code.
 */

// Reads ADMIN_EMAILS env var (comma-separated) with the literal address as fallback.
// Use isAdmin() for access checks; ADMIN_EMAIL kept for single-email legacy callers.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAILS ?? 'jorellana9100@gmail.com')
  .split(',')[0].trim()

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.ADMIN_EMAILS ?? 'jorellana9100@gmail.com')
    .split(',').map(s => s.trim()).filter(Boolean)
  return list.includes(email)
}

export const CASE_SYSTEM_PROMPT = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. Draw from diverse ethnicities and countries each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.). Never reuse first names or last names across cases.`

export const DIFFICULTY_RULES: Record<string, string> = {
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
- ONE atypical feature that actively misleads toward a competing differential — this must be a specific finding not just a vague "unusual presentation"
- ONE comorbidity that meaningfully changes either the expected presentation, the lab interpretation, or the clinical management
- At least one lab value that cannot be interpreted correctly in isolation — it requires correlation with another finding to reach the right conclusion
- Physical exam includes one finding that supports a plausible wrong differential
- 3-4 genuine differentials, at least one requiring a specific confirmatory test to exclude`,

  Advanced: `DIFFICULTY — ADVANCED:
- ONE uncommon or rare diagnosis — do NOT stack multiple rare conditions
- Comorbidities must be common conditions (hypertension, diabetes, COPD, CKD, obesity)
- ONE objective red herring in the data: a lab value, vital sign, or physical exam finding that actively supports a wrong diagnosis
- Physical exam must include at least one finding that subtly distinguishes the correct diagnosis from its closest mimic
- Lab and imaging findings require synthesis across multiple data points — no single result is diagnostic on its own except the pathognomonic confirmatory test
- The case MUST include one pathognomonic or definitively discriminating result available in availableLabs or availableImaging
- 4-5 differentials with at least two that are strongly supported by early data before the discriminating test is ordered`,
}

export const CRITICAL_RULES = `Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component. Single-value tests also use a one-item components array.
CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs.
CRITICAL: Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The lab/imaging results must include at least one finding that, when interpreted clinically, points to the correct diagnosis over its closest differential — describe findings objectively; do not name the diagnosis in result text.
STEMI RULE: When the diagnosis is any form of STEMI, ecgFindings MUST explicitly state the affected leads with millimeter elevation.
PAST HISTORY CONSISTENCY RULE: The pastMedicalHistory fields shown to the patient (conditions, surgeries, hospitalizations) MUST NOT contradict hiddenHistory.fullHistory. The hidden history may ADD detail, but must never contradict what was already stated.
PHYSICAL EXAM OBJECTIVITY RULE: Every physicalExam field MUST describe only objective, observable findings. NEVER include diagnostic interpretations, disease names, or phrases like "consistent with X" or "suggesting X".
INTERPRETATION OBJECTIVITY RULE: In imagingResults, procedureResults, hematologyFindings, urineFindings, fundusFindings, skinFindings, biopsyFindings, and relevantTests[].imagingResult — NEVER include phrases like "consistent with [disease]", "suggestive of [disease]", "indicating [disease]", "compatible with [disease]", "characteristic of [disease]", "diagnostic of [disease]", "concerning for [disease]", or "findings of [disease]". Do NOT name the diagnosis in these fields. Describe only what is physically observed: morphological features, measurements, signal characteristics, distribution. STEMI EXCEPTION: ecgFindings for STEMI cases must retain "consistent with [anatomic-area] STEMI" per the STEMI RULE.
CLINICAL HPI WORD LIMIT RULE: The clinicalHpi field is a HARD MAXIMUM of 40 words. State only: age, sex, primary symptom, and duration.
FOUNDATIONS HPI WORD LIMIT RULE: The hpi field is a HARD MAXIMUM of 60 words. State ONLY: the chief complaint, primary symptom(s), and duration. Move everything else into hiddenHistory.fullHistory.
MANAGEMENT TEACHING POINT RULE: At least ONE of the four teachingPoints MUST be a concrete management/treatment point — name a specific first-line agent, dose, threshold, target, or guideline-anchored decision rule (e.g., "Initiate IV labetalol; reduce MAP by no more than 25% in the first hour" | "tPA window is 4.5h from last-known-well; absolute contraindications include BP >185/110, recent surgery <14 days, active bleeding"). A pearl that only describes pathophysiology, epidemiology, or diagnostic criteria does NOT satisfy this rule. Generic statements like "treat the underlying cause" are insufficient.
KEY QUESTIONS COVERAGE RULE: Every clinically pivotal item in hiddenHistory (predisposing structural lesion, prior TIA or sentinel event, critical precipitant, key exposure, family thrombophilia, prior episode) MUST be elicitable through at least one entry in keyQuestions. Walk through hiddenHistory.fullHistory, familyHistory, medications, and hiddenSymptoms — for any finding that materially changes the diagnosis, risk stratification, or management, write a directed question that would surface it. Generic questions like "Any other symptoms?" do NOT count.
DANGEROUS MIMIC RULE: At least ONE differential MUST be the single most dangerous "can't-miss" mimic of the primary diagnosis — a condition that, if missed, causes serious immediate harm and shares enough features to plausibly mislead a clinician before the key discriminating test is ordered (e.g., STEMI for Acute Pericarditis; Cauda Equina Syndrome for Lumbar Disc Herniation with Radiculopathy; Pulmonary Embolism for PCP Pneumonia; HHS for DKA). Identify this mimic explicitly in differentialExplanations and name the one finding or test that definitively distinguishes it from the correct diagnosis.
PMH LEAK RULE: The pastMedicalHistory fields (conditions, surgeries, hospitalizations) MUST NOT leak the diagnosis through negation or denial. NEVER write phrases like "No prior [organ/system] disease", "No history of [organ/system]", "Denies [organ/system] disorders", "Never had [organ/system]", "Negative for [organ/system]", or any similar exclusion where the organ/system overlaps the diagnosis. Negative pertinents belong in reviewOfSystems, NEVER in pastMedicalHistory. If the patient has no chronic conditions, conditions MUST be EXACTLY "None." — no extra text, no negative pertinents, no medication mentions. Field lane enforcement: conditions = chronic diagnoses ONLY (never medications); surgeries = prior procedures ONLY; hospitalizations = prior inpatient stays ONLY. Medications including oral contraceptives, vitamins, and supplements belong in currentMedications.medications or currentMedications.otc, NEVER in pastMedicalHistory.conditions.`

export const JSON_SCHEMA_TEMPLATE = `{
  "patientInfo": { "name": "First Last", "age": <number>, "gender": "Male or Female", "chiefComplaint": "<brief>", "height": "<e.g. 5'9\\">", "heightInches": <integer> },
  "hpi": "<2-3 sentences. HARD MAXIMUM 60 WORDS. State ONLY: chief complaint, primary symptom(s), and duration.>",
  "clinicalHpi": "<2-3 sentences, MAXIMUM 40 WORDS. Do NOT use comorbidity adjectives (diabetic, hypertensive, obese, asthmatic, cirrhotic, etc.) or name chronic diseases — those belong in pastMedicalHistory.conditions, which the student must elicit.>",
  "advancedHpi": "<HARD LIMIT 20 WORDS: age, sex, ONE vague non-specific complaint, optional duration. Write 'X-year-old', never 'Xyo'. STRICTLY FORBIDDEN: contextual hooks, recent events, exposures, travel, dental or surgical history, medications, lab/vital values, family or social context — every such detail belongs in hiddenHistory.fullHistory. Do NOT use comorbidity adjectives or name chronic diseases.>",
  "vitals": { "bp": "<sys/dia mmHg>", "hr": <bpm>, "rr": <brpm>, "temp": <F>, "spo2": <pct>, "weight": "<lbs>" },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", ...EXACTLY DIFF_COUNT],
  "differentialExplanations": ["<dx>: <why it's on the list and what distinguishes it>", ...one per differential],
  "expectedLabs": ["<exact lab name from availableLabs>", ...3-7 in clinical priority order],
  "expectedImaging": ["<imaging study name copied from availableImaging>", ...0-3 key studies — use empty array [] if imaging is not standard for this diagnosis],
  "keyQuestions": ["<directed question that elicits a pivotal hiddenHistory item — see KEY QUESTIONS COVERAGE RULE>", "<directed question that elicits a pivotal hiddenHistory item>", "<directed question>", "<directed question>", "<directed question>"],
  "teachingPoints": ["<clinical pearl 1 — diagnosis or pathophysiology>", "<clinical pearl 2>", "<clinical pearl 3>", "<management pearl — concrete first-line agent, dose, threshold, target, or guideline rule. See MANAGEMENT TEACHING POINT RULE>"],
  "reviewOfSystems": {
    "Constitutional": "<findings>", "HEENT": "<findings>",
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
  "availableImaging": ["<study name>", ...3-5 relevant and distractor studies],
  "labGroups": [{ "name": "<panel name>", "tests": ["<exact lab name>", ...] }, ...group every lab],
  "labResults": {
    "<exact lab name from availableLabs>": {
      "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }]
    }
  },
  "imagingResults": { "<imaging study from availableImaging>": "<radiology narrative>" },
  "procedureResults": { "<procedure name exactly as in availableImaging>": "<narrative>" },
  "hiddenHistory": {
    "fullHistory": "<complete clinical history withheld from HPI>",
    "socialHistory": "<smoking, alcohol, drugs, occupation, living>",
    "familyHistory": "<relevant family history>",
    "medications": "<current medications with doses>",
    "hiddenSymptoms": "<1-2 symptoms patient hasn't mentioned>",
    "allergies": "<drug allergies or NKDA>"
  },
  "imagingCategory": "<1-3 word radiological descriptor>",
  "ecgFindings": "<ECG description or 'Normal sinus rhythm. No acute ST changes.'>",
  "hematologyFindings": "<peripheral smear findings or blank>",
  "urineFindings": "<urine microscopy findings or blank>",
  "skinFindings": "<dermoscopy/skin findings or blank>",
  "fundusFindings": "<fundus findings or blank>",
  "biopsyFindings": "<histopathology findings or blank>",
  "pastMedicalHistory": { "conditions": "<chronic diagnoses ONLY. If none, write exactly 'None.' and nothing else. NEVER negate a disease category ('No prior X disease', 'Denies X'). NEVER include medications — those go in currentMedications. See PMH LEAK RULE>", "surgeries": "<prior surgeries ONLY. If none, write exactly 'None.' and nothing else. NEVER negate a procedure category. See PMH LEAK RULE>", "hospitalizations": "<prior inpatient stays ONLY. If none, write exactly 'None.' and nothing else. NEVER write 'No prior hospitalizations for X'. See PMH LEAK RULE>" },
  "currentMedications": { "medications": "<prescriptions with doses>", "otc": "<OTC/supplements>" },
  "socialHistory": { "smoking": "<tobacco use>", "alcohol": "<drinks/week>", "drugs": "<recreational>", "occupation": "<job>", "living": "<living situation>", "other": "<travel, diet, exposures>" },
  "relevantTests": [
    { "name": "<test name>", "category": "<Hematology|Metabolic & Chemistry|Urinalysis & Renal|Coagulation|Immunology & Serology|Infectious Disease|Cardiac|Arterial Blood Gas & Respiratory|Toxicology & Drug Levels|Imaging|Procedures & Special Tests>", "isImaging": <true|false>, "labResult": { "components": [{ "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }] }, "imagingResult": "<narrative if isImaging>" }
  ]
}`

export function repairJson(text: string): string {
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

const ORGAN_SYSTEM_MAP: Array<[RegExp, string[]]> = [
  [/thyroid|graves|hashimoto|thyrotoxicos|hyperthyroid|hypothyroid/i, ['thyroid']],
  [/\bstemi\b|\bnstemi\b|\bmi\b|myocard|angina|coronary\s+artery|acute\s+coronary/i, ['cardiac', 'coronary', 'heart']],
  [/\brenal\b|kidney|nephro|glomerulo|\bckd\b|\baki\b/i, ['renal', 'kidney']],
  [/pulmonary\s+embol|\bpe\b|pulmonary\s+hypertens|\bcopd\b|\basthma\b|pneumonia|\brespiratory\b/i, ['pulmonary', 'lung', 'respiratory']],
  [/\bdka\b|\bhhs\b|\bdiabetes\b|diabetic|hyperglycemi/i, ['diabetic', 'diabetes', 'glucose']],
  [/hepat|liver\b|cirrhosis|biliary/i, ['hepatic', 'liver']],
  [/pancrea/i, ['pancreatic', 'pancreas']],
  [/gastro|esophag|stomach|bowel|colon|intestin|crohn|colitis/i, ['gastrointestinal', 'bowel', 'colon']],
  [/\bstroke\b|\btia\b|cerebral|seizure|\bepilepsy\b/i, ['neurological', 'brain', 'cerebral']],
  [/leukemia|lymphoma/i, ['hematologic', 'blood']],
  [/\barthritis\b|\blupus\b|\bsle\b/i, ['rheumatologic', 'arthritis']],
  [/adrenal|cortisol|cushing|addison/i, ['adrenal']],
  [/pituitary/i, ['pituitary']],
  [/breast\s+cancer|ductal\s+carcinoma/i, ['breast']],
  [/prostate\s+cancer/i, ['prostate']],
  [/ovarian|uterine/i, ['ovarian', 'uterine']],
]

const PMH_NEGATION_RE = /\b(no\b|never\b|denies?\b|denial\b|without\b|negative\s+for|absent\b|free\s+of|has\s+not\s+(?:had|been)|no\s+history\s+of|no\s+prior|no\s+past|no\s+known|no\s+previous)\b/i

const MEDICATION_NAMES_RE = /\b(oral\s+contraceptive|OCP|birth\s+control\s+pill|combined\s+oral|aspirin\b|ibuprofen\b|naproxen\b|acetaminophen\b|tylenol\b|statin\b|atorvastatin|simvastatin|rosuvastatin|metformin\b|insulin\b|levothyroxine|synthroid|warfarin\b|apixaban\b|rivaroxaban\b|lisinopril\b|amlodipine\b|metoprolol\b|atenolol\b|losartan\b|omeprazole\b|pantoprazole\b|vitamin\s+[A-Z]|vitamin\s+d|folic\s+acid|iron\s+supplement|calcium\s+supplement|supplement\b)/i

const CHRONIC_DISEASE_RE = /\b(hypertension\b|diabetes\b|COPD\b|CKD\b|chronic\s+kidney|asthma\b|obesity\b|CAD\b|CHF\b|heart\s+failure|cancer\b|carcinoma\b|lymphoma\b|leukemia\b|cirrhosis\b|epilepsy\b|hypothyroid|hyperthyroid|psoriasis\b|crohn\b|colitis\b|fibromyalgia\b|lupus\b|rheumatoid\b|sickle\s+cell|gout\b|HIV\b|hepatitis\b|atrial\s+fibrillation|afib\b|depression\b|anxiety\b|schizophrenia\b)/i

function getDiagnosisKeywords(diagnosis: string): string[] {
  const keywords: string[] = []
  for (const [pattern, kws] of ORGAN_SYSTEM_MAP) {
    if (pattern.test(diagnosis)) keywords.push(...kws)
  }
  if (keywords.length === 0) {
    diagnosis.split(/\s+/)
      .filter(w => w.length > 4 && !/^(acute|with|from|into|over|that|this|type|stage|grade|class|level|form|mild|moderate|severe|chronic|primary|secondary|associated)$/i.test(w))
      .forEach(w => keywords.push(w.replace(/[^a-z]/gi, '').toLowerCase()))
  }
  return [...new Set(keywords)]
}

export function sanitizePmhLeak(caseData: Record<string, unknown>): Record<string, unknown> {
  const pmh = caseData.pastMedicalHistory as Record<string, string> | undefined
  if (!pmh) return caseData

  const diagnosis = (caseData.diagnosis as string | undefined) ?? ''
  const keywords = getDiagnosisKeywords(diagnosis)

  let updated = false
  const newPmh = { ...pmh }

  const fields = ['conditions', 'surgeries', 'hospitalizations'] as const
  for (const field of fields) {
    const val = (newPmh[field] ?? '') as string
    if (!val || /^none\.?\s*$/i.test(val.trim())) continue

    // Negation-leak: negation token AND diagnosis keyword co-occur
    if (PMH_NEGATION_RE.test(val) && keywords.some(kw => new RegExp(`\\b${kw}`, 'i').test(val))) {
      newPmh[field] = 'None.'
      updated = true
      continue
    }

    // Medication-bleed in conditions: medication present without any real chronic diagnosis
    if (field === 'conditions' && MEDICATION_NAMES_RE.test(val) && !CHRONIC_DISEASE_RE.test(val)) {
      newPmh[field] = 'None.'
      updated = true
    }
  }

  return updated ? { ...caseData, pastMedicalHistory: newPmh } : caseData
}

export function reconcileHistoryConsistency(caseData: Record<string, unknown>): Record<string, unknown> {
  const pmh    = caseData.pastMedicalHistory as Record<string, string> | undefined
  const hidden = caseData.hiddenHistory as Record<string, string> | undefined
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

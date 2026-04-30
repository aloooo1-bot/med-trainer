/**
 * Shared case-generation prompts.
 * Plain JS (no TypeScript) so it is importable from both the Next.js app
 * (page.tsx) and the offline generation script (scripts/generate-library.mjs).
 */

const DIFFICULTY_RULES = {
  Foundations: `DIFFICULTY — FOUNDATIONS:
- Common, high-prevalence diagnosis
- Classic textbook symptom presentation
- No significant comorbidities
- Lab values clearly point toward diagnosis
- 1-2 obvious differentials
- Output required: Diagnosis only`,

  Clinical: `DIFFICULTY — CLINICAL:
- Moderate prevalence diagnosis
- DIAGNOSIS SCOPE: Must be a diagnosis a general internist, hospitalist, or emergency physician encounters regularly. DO NOT generate rare diseases (prevalence <1:10,000), subspecialty-only diagnoses, or conditions requiring fellowship-level expertise (e.g., antisynthetase syndrome, Erdheim-Chester disease, HLH, Castleman disease). Appropriate examples: community-acquired pneumonia, CHF exacerbation, DVT/PE, type 2 diabetes complication, UTI/pyelonephritis, appendicitis, cellulitis, migraine, hypertensive urgency, GERD, pancreatitis, asthma exacerbation, ACS, hepatitis.
- 1-2 atypical or missing classic features
- One comorbidity that adds complexity
- Some lab values are ambiguous or mildly misleading
- 3-4 differentials worth considering
- Output required: SOAP note + Diagnosis`,

  Advanced: `DIFFICULTY — ADVANCED:
- ONE uncommon or rare diagnosis (not multiple stacked rare conditions)
- Comorbidities must be common conditions (hypertension, diabetes, COPD, CKD, etc.) — never combine multiple rare diagnoses
- Atypical presentation with red herrings
- Lab/imaging findings require synthesis
- The case MUST contain at least one pathognomonic or definitively discriminating result that rules in the correct diagnosis over the top differential
- Must justify top 3 differentials with evidence
- Output required: SOAP note + Diagnosis + Differential justification`,
}

const HPI_SPEC = {
  Foundations: '"<detailed 4-5 sentence HPI: onset, duration, character, radiation, associated symptoms, timing, exacerbating/relieving factors>"',
  Clinical:    '"<2-3 sentences ONLY. MAXIMUM 40 WORDS TOTAL. State age, sex, primary symptom, and duration. STOP THERE. Do NOT include associated symptoms, characterization, radiation, pertinent positives or negatives — all additional detail belongs in hiddenHistory.fullHistory>"',
  Advanced:    '"<1-2 sentences ONLY. MAXIMUM 20 WORDS TOTAL. State age and sex. Include ONE non-specific symptom with NO duration or characterization. Add ONE misleading or incidental detail that does NOT point toward the primary diagnosis. Include nothing else>"',
}

const HIDDEN_HISTORY_SPEC = {
  Foundations: 'N/A',
  Clinical:    '<Full detailed clinical history withheld from HPI: all associated symptoms, true onset, duration, character, radiation, aggravating/relieving factors, pertinent positives, pertinent negatives. Reveal only when the physician asks directly about each specific finding.>',
  Advanced:    '<Complete clinical history withheld from the vague HPI: all associated symptoms including the most pathognomonic finding, B-symptoms if present, any symptom that significantly narrows the differential. Gate the most diagnostic finding — only reveal it if the physician asks about it specifically by name or direct description.>',
}

const CRITICAL_RULES = `CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result. Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs — copy it character-for-character. Do NOT use abbreviations or shortened names as keys.
CRITICAL: The lab/imaging results must include at least one finding that definitively confirms the correct diagnosis over its closest differential (e.g. for gout: monosodium urate crystals on synovial fluid; for PE: filling defect on CT-PA; for MI: ST elevation + troponin). Do not generate ambiguous results that leave the diagnosis unconfirmable from the data provided.
STEMI RULE: When the diagnosis is any form of STEMI (inferior, anterior, lateral, posterior, STEMI equivalent), the ecgFindings field MUST explicitly state the affected leads with millimeter elevation (e.g. "2mm ST elevation in leads II, III, and aVF with reciprocal ST depression in I and aVL, consistent with inferior STEMI"). Never write borderline or possible ST elevation for a STEMI diagnosis — the ECG must be unambiguously diagnostic.
AIN/DRUG-INDUCED NEPHRITIS RULE: When the diagnosis is Acute Interstitial Nephritis (AIN), drug-induced nephropathy, or similar medication-triggered renal injury, the causative agent MUST appear prominently in currentMedications.otc or currentMedications.medications with duration.
FIBRILLARY GN EXCLUSION: Do NOT generate Fibrillary Glomerulonephritis as a diagnosis at any difficulty. For Advanced Renal cases, choose instead: IgA Nephropathy, FSGS, Membranous Nephropathy, ANCA-associated vasculitis, or Thrombotic Microangiopathy.
WHIPPLE'S BIOPSY RULE: When the diagnosis is Whipple's Disease, "Upper Endoscopy (EGD) with Small Bowel Biopsy" MUST be in availableImaging, and procedureResults MUST describe PAS-positive macrophages in the lamina propria.
CLL DISCRIMINATOR RULE: When the diagnosis is CLL or CLL with AIHA, "Flow Cytometry (Peripheral Blood)" MUST be in availableLabs with CD5+/CD19+/CD23+ results.
WALDENSTRÖM DISCRIMINATOR RULE: When the diagnosis is Waldenström Macroglobulinemia, "Serum Protein Electrophoresis (SPEP) with Immunofixation" MUST be in availableLabs with an IgM monoclonal spike, and at least one hyperviscosity symptom must appear in hiddenHistory.`

const JSON_SCHEMA = `{
  "patientInfo": {
    "name": "First Last",
    "age": <number>,
    "gender": "Male or Female",
    "chiefComplaint": "<brief chief complaint>",
    "height": "<height in feet and inches e.g. 5'9\\">",
    "heightInches": <total height in inches as integer e.g. 69>
  },
  "hpi": HPISPEC,
  "vitals": {
    "bp": "<systolic/diastolic mmHg>",
    "hr": <beats per minute>,
    "rr": <breaths per minute>,
    "temp": <Fahrenheit decimal>,
    "spo2": <percent integer>,
    "weight": "<lbs>"
  },
  "diagnosis": "<specific primary diagnosis>",
  "differentials": ["<dx 1>", "<dx 2>", "<dx 3>", "<dx 4>", "<dx 5>"],
  "keyQuestions": [
    "<important question the physician should have asked the patient>",
    "<important question>",
    "<important question>",
    "<important question>",
    "<important question>"
  ],
  "teachingPoints": ["<clinical pearl 1>", "<clinical pearl 2>", "<clinical pearl 3>", "<clinical pearl 4>"],
  "reviewOfSystems": {
    "Constitutional":        "<explicit findings — state positives first, then denials>",
    "HEENT":                 "<explicit findings — state positives first, then denials>",
    "Cardiovascular":        "<explicit findings — state positives first, then denials>",
    "Respiratory":           "<explicit findings — state positives first, then denials>",
    "Gastrointestinal":      "<explicit findings — state positives first, then denials>",
    "Genitourinary":         "<explicit findings — state positives first, then denials>",
    "Musculoskeletal":       "<explicit findings — state positives first, then denials>",
    "Neurological":          "<explicit findings — state positives first, then denials>",
    "Psychiatric":           "<explicit findings — state positives first, then denials>",
    "Integumentary":         "<explicit findings — state positives first, then denials>",
    "Endocrine":             "<explicit findings — state positives first, then denials>",
    "Hematologic/Lymphatic": "<explicit findings — state positives first, then denials>",
    "Allergic/Immunologic":  "<explicit findings — state positives first, then denials>"
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
  CARDIAC TEST RULE: When the case involves cardiovascular pathology, chest pain, dyspnea, or syncope — always include "Electrocardiogram (ECG/EKG)" in availableImaging with a narrative ECG report in imagingResults. Also include "Troponin I or T (high sensitivity)" and "BNP / NT-proBNP" in availableLabs.
  "labGroups": [
    { "name": "<panel name>", "tests": ["<exact lab name from availableLabs>"] }
  ],
  "labResults": {
    "<panel name from availableLabs>": {
      "components": [
        { "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }
      ]
    }
  },
  "imagingResults": {
    "<each imaging study from availableImaging>": "<radiology-style report impression, 2-3 sentences>"
  },
  "procedureResults": {
    "<procedure name exactly as in availableImaging>": "<narrative procedure report, 2-4 sentences>"
  },
  PROCEDURE RULE: For diagnostic procedures in availableImaging (endoscopy, colonoscopy, bronchoscopy, lumbar puncture, paracentesis, thoracentesis, arthrocentesis), generate a narrative result in procedureResults using the EXACT same name. Imaging studies go in imagingResults, NOT procedureResults.
  "hiddenHistory": {
    "fullHistory": "HIDDENHIST",
    "socialHistory": "<smoking pack-years, alcohol drinks/week, drugs, occupation, travel>",
    "familyHistory": "<relevant family history>",
    "medications": "<current medications with doses and frequencies>",
    "hiddenSymptoms": "<1-2 symptoms patient will confirm only if asked directly>",
    "allergies": "<drug allergies with reaction type, or NKDA>"
  },
  "imagingCategory": "<1-3 word radiological descriptor e.g. 'bilateral pleural effusion', 'pneumothorax', 'pulmonary consolidation'>",
  "ecgFindings": "<1-2 sentence ECG description using standard terminology. Drives ECG image selection.>",
  "hematologyFindings": "<peripheral smear findings if relevant, else empty string>",
  "urineFindings": "<urine microscopy findings if relevant, else empty string>",
  "skinFindings": "<dermoscopic findings if relevant, else empty string>",
  "fundusFindings": "<fundus findings if relevant, else empty string>",
  "biopsyFindings": "<histopathology findings if relevant, else empty string>",
  "pastMedicalHistory": {
    "conditions": "<chronic diagnoses, or 'None'>",
    "surgeries": "<prior surgeries, or 'None'>",
    "hospitalizations": "<prior hospitalizations, or 'None'>"
  },
  "currentMedications": {
    "medications": "<prescription medications with doses, or 'None'>",
    "otc": "<OTC drugs, vitamins, supplements, or 'None'>"
  },
  "socialHistory": {
    "smoking": "<tobacco use with pack-years, or 'Never smoker'>",
    "alcohol": "<drinks per week, or 'Denies'>",
    "drugs": "<recreational drug use, or 'Denies'>",
    "occupation": "<current job>",
    "living": "<living situation>",
    "other": "<travel, exercise, diet, exposures>"
  },
  "relevantTests": [
    RELEVANT TESTS RULE: Generate 5-10 tests specifically relevant to this diagnosis and comorbidities. Include the gold-standard confirmatory test and 1-2 alternatives. Focus on specialty tests a student might miss.
    {
      "name": "<test name as it would appear on an order>",
      "category": "<Hematology | Metabolic & Chemistry | Urinalysis & Renal | Coagulation | Immunology & Serology | Infectious Disease | Cardiac | Arterial Blood Gas & Respiratory | Toxicology & Drug Levels | Imaging | Procedures & Special Tests>",
      "isImaging": <true for X-ray, CT, MRI, US, ECG, endoscopy; false for lab tests>,
      "labResult": {
        "components": [
          { "name": "<analyte>", "value": "<value>", "unit": "<unit>", "referenceRange": "<range>", "status": "<normal|abnormal|critical>" }
        ]
      },
      "imagingResult": "<radiology or procedure narrative — omit if isImaging is false>"
    }
  ]
}
IMPORTANT: vitals.temp must be in Fahrenheit (normal is 98.6°F).`

/**
 * @param {string} namesClause - Instruction about name diversity/exclusions.
 * @returns {string}
 */
export function buildCaseSystemPrompt(namesClause) {
  const clause = namesClause ?? 'Draw from diverse ethnicities and countries each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.).'
  return `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. ${clause} Never reuse first names or last names across cases.`
}

/**
 * @param {string} system - e.g. "Cardiovascular"
 * @param {string} difficulty - "Foundations" | "Clinical" | "Advanced"
 * @param {string} [diagnosisHint] - Optional specific diagnosis to generate.
 * @param {string} [variantSeed] - Optional demographic/presentation constraint for library variants.
 * @returns {string}
 */
export function buildCasePrompt(system, difficulty, diagnosisHint, variantSeed) {
  const diffRules = DIFFICULTY_RULES[difficulty] ?? DIFFICULTY_RULES.Foundations
  const hpiSpec = HPI_SPEC[difficulty] ?? HPI_SPEC.Foundations
  const hiddenHist = HIDDEN_HISTORY_SPEC[difficulty] ?? HIDDEN_HISTORY_SPEC.Foundations

  const diagnosisLine = diagnosisHint
    ? `The diagnosis for this case MUST be: "${diagnosisHint}". Generate a realistic clinical presentation of this specific diagnosis at ${difficulty} difficulty. Do not substitute a different diagnosis.`
    : `Generate a realistic ${system} clinical case at ${difficulty} difficulty.`

  const variantLine = variantSeed
    ? `\nVARIANT CONSTRAINT (apply to this specific generation only):\n${variantSeed}\n`
    : ''

  const schema = JSON_SCHEMA
    .replace('HPISPEC', hpiSpec)
    .replace('HIDDENHIST', hiddenHist)

  return `${diagnosisLine}${variantLine}
Strictly follow the difficulty rules below.

${diffRules}

Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component.
${CRITICAL_RULES}
${schema}`
}

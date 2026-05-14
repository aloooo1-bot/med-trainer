/**
 * Shared case-generation prompts.
 * Plain JS so it is importable from both Next.js server code and offline scripts.
 * IMPORTANT: Keep in sync with the inline prompt in app/page.tsx (generateCase).
 */

export const DIFFICULTY_RULES = {
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

export const CRITICAL_RULES = `Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component (e.g. CBC must expand into WBC, Hemoglobin, Hematocrit, Platelets, etc.). Single-value tests also use a one-item components array.
CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result. Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs — copy it character-for-character. Do NOT use abbreviations or shortened names as keys. For example if availableLabs contains "Prothrombin Time (PT) / INR", the labResults key must be "Prothrombin Time (PT) / INR" not "PT/INR" or "PT" or "Coagulation Panel".
CRITICAL: The lab/imaging results must include at least one finding that, when interpreted clinically, points to the correct diagnosis over its closest differential — describe findings objectively (e.g. 'monosodium urate crystals on synovial fluid', 'filling defect in the right pulmonary artery on CT-PA', 'ST elevation in leads II/III/aVF'). Do not name the diagnosis in result text, and do not generate ambiguous results that leave the diagnosis unconfirmable.
STEMI RULE: When the diagnosis is any form of STEMI (inferior, anterior, lateral, posterior, STEMI equivalent), the ecgFindings field MUST explicitly state the affected leads with millimeter elevation (e.g. "2mm ST elevation in leads II, III, and aVF with reciprocal ST depression in I and aVL, consistent with inferior STEMI"). Never write borderline or possible ST elevation for a STEMI diagnosis — the ECG must be unambiguously diagnostic.
AIN/DRUG-INDUCED NEPHRITIS RULE: When the diagnosis is Acute Interstitial Nephritis (AIN), drug-induced nephropathy, or similar medication-triggered renal injury, the causative agent (NSAID, antibiotic, PPI, etc.) MUST appear prominently in currentMedications.otc or currentMedications.medications with duration (e.g. "Ibuprofen 600mg TID × 3 weeks"). It must be listed as a recent or current medication, not just mentioned in passing.
FIBRILLARY GN EXCLUSION: Do NOT generate Fibrillary Glomerulonephritis as a diagnosis at any difficulty. For Advanced Renal cases, choose instead: IgA Nephropathy (Berger's Disease), Focal Segmental Glomerulosclerosis (FSGS), Membranous Nephropathy, ANCA-associated vasculitis, or Thrombotic Microangiopathy.
WHIPPLE'S BIOPSY RULE: When the diagnosis is Whipple's Disease (Tropheryma whipplei), "Upper Endoscopy (EGD) with Small Bowel Biopsy" MUST be included in availableImaging, and the procedureResults entry for it MUST explicitly describe PAS-positive macrophages with foamy cytoplasm distending the lamina propria — the pathognomonic histological finding without which the diagnosis cannot be confirmed.
CLL DISCRIMINATOR RULE: When the diagnosis is Chronic Lymphocytic Leukemia (CLL) or CLL with AIHA, "Flow Cytometry (Peripheral Blood)" MUST be included in availableLabs and its labResults MUST show CD5+/CD19+/CD23+ lymphocyte population — the immunophenotype that distinguishes CLL from PNH, lymphoma, and other B-cell malignancies.
WALDENSTRÖM DISCRIMINATOR RULE: When the diagnosis is Waldenström Macroglobulinemia, "Serum Protein Electrophoresis (SPEP) with Immunofixation" MUST be in availableLabs and its labResults MUST show an IgM monoclonal spike. The hiddenHistory.fullHistory or hiddenSymptoms MUST include at least one hyperviscosity symptom (blurred vision, headache, epistaxis, or neurological changes) to distinguish from Multiple Myeloma (which produces IgG/IgA, not IgM).
INTERPRETATION OBJECTIVITY RULE: In imagingResults, procedureResults, hematologyFindings, urineFindings, fundusFindings, skinFindings, biopsyFindings, and relevantTests[].imagingResult — NEVER include phrases like "consistent with [disease]", "suggestive of [disease]", "suggesting [disease]", "indicative of [disease]", "compatible with [disease]", "characteristic of [disease]", "diagnostic of [disease]", "concerning for [disease]", or "findings of [disease]". Do NOT name the diagnosis anywhere in these fields. Describe only what is physically observed: specific morphological features, measurements, signal characteristics, distribution, color, and density. The student infers the diagnosis — the findings must not hand it to them. STEMI EXCEPTION: ecgFindings for STEMI cases must retain "consistent with [anatomic-area] STEMI" as required by the STEMI RULE.
MANAGEMENT TEACHING POINT RULE: At least ONE of the four teachingPoints MUST be a concrete management/treatment point — name a specific first-line agent, dose, threshold, target, or guideline-anchored decision rule. Examples: "Initiate IV labetalol; reduce MAP by no more than 25% in the first hour, then to 160/100 over 2-6 hours" | "tPA window is 4.5h from last-known-well; absolute contraindications include BP >185/110, recent surgery <14 days, active bleeding" | "Anticoagulate with apixaban 10mg BID x 7 days then 5mg BID for provoked DVT; minimum 3 months total" | "Empiric vancomycin + ceftriaxone for native-valve IE pending blood cultures; switch to nafcillin if MSSA confirmed". A pearl that only describes pathophysiology, epidemiology, or diagnostic criteria does NOT satisfy this rule — the management point must answer "what do I do for this patient and when". Generic statements like "treat the underlying cause" or "consult specialty" are insufficient.
KEY QUESTIONS COVERAGE RULE: Every clinically pivotal item in hiddenHistory (predisposing structural lesion, prior TIA or sentinel event, critical precipitant, key exposure, family thrombophilia, prior episode of the same disease) MUST be elicitable through at least one entry in keyQuestions. Before finalizing keyQuestions, walk through hiddenHistory.fullHistory, hiddenHistory.familyHistory, hiddenHistory.medications, and hiddenHistory.hiddenSymptoms — for any finding that materially changes the diagnosis, risk stratification, or management, write a directed question that would surface it (e.g., "Have you had any brief episodes of weakness, numbness, or vision changes that resolved on their own in the past few days?" elicits a hidden TIA; "Have you ever been told you have a heart murmur or abnormal valve?" elicits a hidden bicuspid aortic valve). Generic questions like "Any other symptoms?" do NOT count.
DANGEROUS MIMIC RULE: At least ONE differential MUST be the single most dangerous "can't-miss" mimic of the primary diagnosis — a condition that, if missed, causes serious immediate harm and shares enough features to plausibly mislead a clinician before the key discriminating test is ordered (e.g., STEMI for Acute Pericarditis; Cauda Equina Syndrome for Lumbar Disc Herniation with Radiculopathy; Pulmonary Embolism for PCP Pneumonia; HHS for DKA). Identify this mimic explicitly in differentialExplanations and name the one finding or test that definitively distinguishes it from the correct diagnosis.
PMH LEAK RULE: The pastMedicalHistory fields (conditions, surgeries, hospitalizations) MUST NOT leak the diagnosis through negation or denial. NEVER write phrases like "No prior [organ/system] disease", "No history of [organ/system]", "Denies [organ/system] disorders", "Never had [organ/system]", "Negative for [organ/system]", or any similar exclusion where the organ/system overlaps the diagnosis. Negative pertinents belong in reviewOfSystems, NEVER in pastMedicalHistory. If the patient has no chronic conditions, conditions MUST be EXACTLY "None." — no extra text, no negative pertinents, no medication mentions. Field lane enforcement: conditions = chronic diagnoses ONLY (never medications); surgeries = prior procedures ONLY; hospitalizations = prior inpatient stays ONLY. Medications including oral contraceptives, vitamins, and supplements belong in currentMedications.medications or currentMedications.otc, NEVER in pastMedicalHistory.conditions.`

export const JSON_SCHEMA = `{
  "patientInfo": {
    "name": "First Last",
    "age": <number>,
    "gender": "Male or Female",
    "chiefComplaint": "<brief chief complaint>",
    "height": "<height in feet and inches e.g. 5'9\\">",
    "heightInches": <total height in inches as integer e.g. 69>
  },
  "hpi": "<detailed 4-5 sentence HPI: onset, duration, character, radiation, associated symptoms, timing, exacerbating/relieving factors — enough detail that a Foundations-level student can identify the diagnosis>",
  "clinicalHpi": "<2-3 sentences ONLY. MAXIMUM 40 WORDS TOTAL. State age, sex, primary symptom, and duration. STOP THERE. Do NOT include associated symptoms, characterization, radiation, pertinent positives or negatives, OR any comorbidity adjective (diabetic, hypertensive, obese, asthmatic, cirrhotic, etc.) — chronic diseases belong ONLY in pastMedicalHistory.conditions, which the student must elicit.>",
  "advancedHpi": "<HARD LIMIT: 20 WORDS MAXIMUM — count every word before writing. Format: [Age]-year-old [sex] with [vague symptom] [optional: for X days/weeks]. NOTHING ELSE. ALWAYS write 'X-year-old', NEVER 'Xyo'. NEVER name a recent event, exposure, travel, dental or surgical visit, medication, lab value, or any contextual hook — those belong in hiddenHistory.fullHistory, where the student must elicit them. NEVER use comorbidity adjectives or name chronic diseases. Example: '52-year-old male with three weeks of fatigue.'>",
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
  "expectedImaging": ["<exact imaging/procedure name copied character-for-character from availableImaging that should be ordered>", ...list 1-3 key studies],
  "keyQuestions": [
    "<directed question that elicits a pivotal hiddenHistory item — see KEY QUESTIONS COVERAGE RULE>",
    "<directed question that elicits a pivotal hiddenHistory item>",
    "<directed question — at least 3 of 5 must map to a specific hiddenHistory finding>",
    "<directed question>",
    "<directed question>"
  ],
  "teachingPoints": ["<clinical pearl 1 — diagnosis or pathophysiology>", "<clinical pearl 2>", "<clinical pearl 3>", "<management pearl — concrete first-line agent, dose, threshold, target, or guideline rule. See MANAGEMENT TEACHING POINT RULE>"],
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
  "hematologyFindings": "<If peripheral blood smear is clinically relevant, describe objectively what is seen — e.g. 'Microcytic hypochromic red cells with anisopoikilocytosis, target cells, and central pallor exceeding 50% of cell diameter.' or 'Ring-form intraerythrocytic inclusions present; multiple infected cells visible per field.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "urineFindings": "<If urinalysis or urine microscopy is clinically relevant, describe objectively what is seen — e.g. 'Pyuria with bacteria visible on microscopy; positive leukocyte esterase and nitrites.' or 'RBC casts and dysmorphic red cells present on microscopy.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "skinFindings": "<If a skin lesion or biopsy is relevant, describe objectively what is observed — e.g. 'Irregular border, asymmetric pigment distribution, multiple shades of brown and black, regression areas on dermoscopy.' or 'Pearly, translucent papule with rolled border and central ulceration; superficial telangiectasias on dermoscopy.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "fundusFindings": "<If ophthalmoscopy or fundoscopy is relevant, describe objectively what is seen — e.g. 'Bilateral flame hemorrhages, cotton-wool spots, disc swelling, and AV nicking on dilated funduscopy.' or 'Increased cup-to-disc ratio >0.7 with superior rim thinning and temporal pallor.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "biopsyFindings": "<If histopathology (H&E biopsy) is relevant, describe objectively what the pathology shows — e.g. 'Dysplastic glandular epithelium with nuclear pleomorphism, increased mitotic figures, and cribriform architecture.' or 'Bridging fibrosis with nodular regeneration and hepatocyte ballooning on H&E.' Omit or leave blank if not relevant. NEVER name the diagnosis.>",
  "pastMedicalHistory": {
    "conditions": "<chronic diagnoses ONLY. If none, write exactly 'None.' and nothing else. NEVER negate a disease category ('No prior X disease', 'Denies X'). NEVER include medications — those go in currentMedications. See PMH LEAK RULE>",
    "surgeries": "<prior surgeries ONLY. If none, write exactly 'None.' and nothing else. NEVER negate a procedure category. See PMH LEAK RULE>",
    "hospitalizations": "<prior inpatient stays ONLY. If none, write exactly 'None.' and nothing else. NEVER write 'No prior hospitalizations for X'. See PMH LEAK RULE>"
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
    RELEVANT TESTS RULE: Generate 5-10 tests that are specifically relevant to THIS case's primary diagnosis AND each significant comorbidity. Include both the gold-standard confirmatory test and 1-2 meaningful alternatives. These supplement the standard availableLabs/availableImaging — focus on specialty tests a student might miss. Provide realistic result values appropriate to the diagnosis.
    {
      "name": "<exact test name as it would appear on an order>",
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

/**
 * @param {string|null} namesClause
 * @returns {string}
 */
export function buildCaseSystemPrompt(namesClause: string | null) {
  const clause = namesClause ?? 'Draw from diverse ethnicities and countries each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.).'
  return `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. ${clause} Never reuse first names or last names across cases.`
}

/**
 * @param {string} system
 * @param {string} difficulty - "Foundations" | "Clinical" | "Advanced"
 * @param {string} [diagnosis] - specific diagnosis to force
 * @param {string|null} [variantSeed] - unused (kept for backwards compat)
 * @returns {string}
 */
export function buildCasePrompt(system: string, difficulty: string, diagnosis?: string, variantSeed?: string | null) {
  const diffRules = DIFFICULTY_RULES[difficulty as keyof typeof DIFFICULTY_RULES] ?? DIFFICULTY_RULES.Foundations
  const diffCount = difficulty === 'Foundations' ? '2-3' : difficulty === 'Clinical' ? '3-4' : '4-5'
  const schema = JSON_SCHEMA.replace('DIFF_COUNT', diffCount)
  const diagnosisLine = diagnosis
    ? `The diagnosis for this case MUST be "${diagnosis}". Do not substitute a different diagnosis. `
    : ''

  return `Generate a realistic ${system} clinical case. ${diagnosisLine}Strictly follow the difficulty rules below.

${diffRules}

${CRITICAL_RULES}
${schema}`
}

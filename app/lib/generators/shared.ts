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
EXAM FOCUS RULE: relevantExamRegions must list every physicalExam key whose findings a competent physician would intentionally examine for this diagnosis. Use the exact same string keys as in physicalExam. Omit regions that are entirely normal/unremarkable and unrelated to the working diagnosis.
INTERPRETATION OBJECTIVITY RULE: In imagingResults, procedureResults, hematologyFindings, urineFindings, fundusFindings, skinFindings, biopsyFindings, and relevantTests[].imagingResult — NEVER include phrases like "consistent with [disease]", "suggestive of [disease]", "indicating [disease]", "compatible with [disease]", "characteristic of [disease]", "diagnostic of [disease]", "concerning for [disease]", or "findings of [disease]". Do NOT name the diagnosis in these fields. Describe only what is physically observed: morphological features, measurements, signal characteristics, distribution. STEMI EXCEPTION: ecgFindings for STEMI cases must retain "consistent with [anatomic-area] STEMI" per the STEMI RULE.
CLINICAL HPI WORD LIMIT RULE: The clinicalHpi field is a HARD MAXIMUM of 40 words. State only: age, sex, primary symptom, and duration. NEVER include severity ratings or pain scales (e.g., X/10).
FOUNDATIONS HPI WORD LIMIT RULE: The hpi field is a HARD MAXIMUM of 60 words. State ONLY: the chief complaint, primary symptom(s), and duration. Move everything else into hiddenHistory.fullHistory. NEVER include severity ratings or numerical pain scales (e.g., "rates it 7/10", "8 out of 10") — the student must elicit severity by asking the patient.
MANAGEMENT TEACHING POINT RULE: At least ONE of the four teachingPoints MUST be a concrete management/treatment point — name a specific first-line agent, dose, threshold, target, or guideline-anchored decision rule (e.g., "Initiate IV labetalol; reduce MAP by no more than 25% in the first hour" | "tPA window is 4.5h from last-known-well; absolute contraindications include BP >185/110, recent surgery <14 days, active bleeding"). A pearl that only describes pathophysiology, epidemiology, or diagnostic criteria does NOT satisfy this rule. Generic statements like "treat the underlying cause" are insufficient.
KEY QUESTIONS COVERAGE RULE: Every clinically pivotal item in hiddenHistory (predisposing structural lesion, prior TIA or sentinel event, critical precipitant, key exposure, family thrombophilia, prior episode) MUST be elicitable through at least one entry in keyQuestions. Walk through hiddenHistory.fullHistory, familyHistory, medications, and hiddenSymptoms — for any finding that materially changes the diagnosis, risk stratification, or management, write a directed question that would surface it. Generic questions like "Any other symptoms?" do NOT count.
DANGEROUS MIMIC RULE: At least ONE differential MUST be the single most dangerous "can't-miss" mimic of the primary diagnosis — a condition that, if missed, causes serious immediate harm and shares enough features to plausibly mislead a clinician before the key discriminating test is ordered (e.g., STEMI for Acute Pericarditis; Cauda Equina Syndrome for Lumbar Disc Herniation with Radiculopathy; Pulmonary Embolism for PCP Pneumonia; HHS for DKA). Identify this mimic explicitly in differentialExplanations and name the one finding or test that definitively distinguishes it from the correct diagnosis.
MENINGITIS EMPIRIC COVERAGE RULE: Teaching points for bacterial meningitis empiric therapy MUST include explicit age/risk stratification: (1) Immunocompetent, non-pregnant adults aged 16-50: ceftriaxone 2g IV q12h + vancomycin + dexamethasone. (2) Adults >50, immunocompromised, alcoholic, or pregnant: ADD ampicillin 2g IV q4h to cover Listeria monocytogenes. Stating the 16-50 regimen as a universal rule without the Listeria caveat is incomplete and will mislead students who later encounter older or immunocompromised patients.
PMH LEAK RULE: The pastMedicalHistory fields (conditions, surgeries, hospitalizations) MUST NOT leak the diagnosis through negation or denial. NEVER write phrases like "No prior [organ/system] disease", "No history of [organ/system]", "Denies [organ/system] disorders", "Never had [organ/system]", "Negative for [organ/system]", or any similar exclusion where the organ/system overlaps the diagnosis. Negative pertinents belong in reviewOfSystems, NEVER in pastMedicalHistory. If the patient has no chronic conditions, conditions MUST be EXACTLY "None." — no extra text, no negative pertinents, no medication mentions. Field lane enforcement: conditions = chronic diagnoses ONLY (never medications); surgeries = prior procedures ONLY; hospitalizations = prior inpatient stays ONLY. Medications including oral contraceptives, vitamins, and supplements belong in currentMedications.medications or currentMedications.otc, NEVER in pastMedicalHistory.conditions.
HPI-HIDDEN HISTORY NON-CONTRADICTION RULE: hiddenHistory.fullHistory, hiddenHistory.hiddenSymptoms, and hiddenHistory.socialHistory MUST NOT directly contradict explicit denials in hpi or clinicalHpi. If the HPI says "denies jaundice" or "denies prior chest pain", the corresponding hidden symptom CANNOT be "confirms yellowing of eyes when asked" or "reports 2-3 prior episodes of exertional chest tightness". The student must be able to elicit hidden findings through directed questioning WITHOUT the patient being made into an active liar. Two valid patterns: (a) HPI omits the topic entirely, hidden symptom is uncovered by a targeted question; OR (b) HPI provides a softened/vague acknowledgment ("no chest pain that I'd call serious — maybe some indigestion with exertion last month") that primes the targeted question. NEVER pair an explicit HPI denial with a contradicting hidden finding.
RENAL STONE PASSAGE RULE: Teaching points about kidney/ureteral stones MUST state: ≤4mm stones pass spontaneously in ~80-90% of cases; 4-6mm stones pass in ~50-60%. NEVER attribute the ~90% passage rate to "<5mm" stones — that threshold and rate are imprecise and will mislead learners.
BISAP BUN THRESHOLD RULE: When a pancreatitis case references the BISAP score, teaching points MUST use BUN >25 mg/dL as the threshold for the BUN criterion — NOT BUN >20 mg/dL. The validated BISAP cutoff is >25 mg/dL; using >20 mg/dL is incorrect and will mislead learners.
STI DUAL THERAPY RULE: When the case involves gonorrhea, the treatment teaching point MUST follow this exact framework — DO NOT deviate from it:
(1) Ceftriaxone 500mg IM targets gonorrhea (Neisseria gonorrhoeae).
(2) When chlamydia NAAT has NOT returned negative, doxycycline 100mg BID × 7 days is added empirically — doxycycline covers Chlamydia trachomatis, not gonorrhea.
(3) Once chlamydia NAAT is confirmed negative, ceftriaxone 500mg IM alone is sufficient.
ABSOLUTE PROHIBITIONS — every phrase below and its close variants are BANNED from this teaching point:
✗ "dual therapy" in any form (positive, negative, quoted, or modified — e.g., "empiric dual therapy", "not dual therapy", "dual-agent")
✗ Any clause containing "constitute" + regimen label (e.g., "does not constitute dual therapy", "constitutes dual therapy")
✗ Any sentence explaining what the regimen "is called", "is not called", "is", or "is not" as a named category
✗ "monotherapy vs. dual therapy" or any comparative regimen-naming frame
The only goal is for the student to understand WHAT each drug targets — not to learn or unlearn regimen nomenclature.
LAB RESULT DIRECTIVE: For Foundations-level gonorrhea cases, the Chlamydia trachomatis NAAT entry in labResults MUST return "DETECTED" (positive) — co-infection is clinically common (~30% of gonococcal urethritis cases) and a positive chlamydia NAAT makes the co-treatment rationale unambiguous. NEVER return "NOT DETECTED" / negative for chlamydia in a Foundations gonorrhea case — that creates a case-design inconsistency where the student sees a negative NAAT yet is taught/graded on empiric co-treatment, undermining antimicrobial-stewardship teaching.
EXAMPLE — what NOT to write and what to write instead:
✗ WRONG (rule violation): "Chlamydia trachomatis NAAT": { "components": [{ "name": "Chlamydia trachomatis NAAT", "value": "NOT DETECTED", "unit": "qualitative", "referenceRange": "Not detected", "status": "normal" }] }
✓ CORRECT: "Chlamydia trachomatis NAAT": { "components": [{ "name": "Chlamydia trachomatis NAAT", "value": "DETECTED", "unit": "qualitative", "referenceRange": "Not detected", "status": "abnormal" }] }
A negative chlamydia NAAT paired with teachingPoints that justify empiric co-treatment is a direct case-design contradiction — fix it at the lab value, not by softening the teachingPoint.
CRITERIA COUNT CONSISTENCY RULE: When a teaching point states "this patient meets N criteria" (DSM-5, Rome criteria, SIRS, etc.), the immediately following parenthetical enumeration MUST list exactly N items. Count the list before writing the number — do not assert a number and then enumerate a different count.
TIME-DEPENDENT REFERENCE RANGE RULE: When a lab result's interpretation depends on time post-event (acetaminophen/Rumack-Matthew nomogram, troponin rise-and-fall kinetics, lactate clearance, ammonia in liver failure), the labResults referenceRange field MUST include the time anchor (e.g., ">150 mcg/mL at 4h post-ingestion — threshold decreases with time; see Rumack-Matthew nomogram") or a note that the cutoff is time-dependent. A single fixed threshold is forbidden when the clinical reference range varies with time since ingestion or onset.
TROPONIN TIME-ZERO RULE: For STEMI/NSTEMI/ACS cases presenting within 0-3 hours of symptom onset, the time-zero (initial / "0 hours") troponin I value in labResults MUST be normal or borderline (e.g., 0.02-0.06 ng/mL, status "normal" or "borderline") — NOT critically elevated. Troponin begins rising 3-6 hours after myocardial injury, so a time-zero troponin of >0.1 ng/mL in a patient presenting within 90 minutes is biologically implausible and contradicts the standard teaching that serial troponin captures rise-and-fall kinetics. Demonstrate the rise on the 3-hour or 6-hour repeat value (status "high" or "critical") — never on the time-zero draw.
INFERIOR STEMI HEMODYNAMICS RULE: For inferior or right-ventricular STEMI cases, the CXR imagingResult MUST describe clear lung fields — pulmonary edema (vascular congestion, Kerley B lines, bilateral infiltrates) is hemodynamically implausible in isolated RV/inferior territory infarction. Pulmonary edema on CXR is only appropriate when the STEMI involves the anterior wall (LAD territory) with EF ≤35% or when acute mitral regurgitation is part of the case design.
STEMI LOCALISATION RULE: When the correct diagnosis includes a territorial qualifier (Inferior, Anterior, Lateral, Posterior, or RV STEMI), the diagnosis field MUST state that qualifier explicitly (e.g., "Inferior STEMI" not just "STEMI"). Any grading rubric matching the submitted diagnosis for full Diagnosis Accuracy credit MUST require the territorial qualifier to be present in the student's submission — accepting "STEMI" without a qualifier should yield only partial credit when a specific territory was taught and confirmed by ECG leads.
ACUTE EXACERBATION SPIROMETRY RULE: Spirometry (FEV1/FVC, flow-volume loops) is contraindicated during an acute asthma exacerbation because forced maneuvers can worsen bronchospasm. For acute asthma cases, availableLabs MUST NOT include formal spirometry. Use Peak Expiratory Flow (PEF) instead to assess severity at the bedside. Reserve formal spirometry for outpatient follow-up or stable-baseline case designs.
ASTHMA SEVERITY SpO2 RULE: Asthma exacerbation severity classifications MUST use these SpO2 thresholds: Mild exacerbation SpO2 ≥ 95%; Moderate exacerbation SpO2 90–94%; Severe/life-threatening exacerbation SpO2 < 90%. Do NOT use SpO2 88–89% as a moderate-severity teaching value — that range defines impending respiratory failure (severe/near-fatal tier), not moderate.
ASTHMA PEF AVAILABILITY RULE: Any asthma case whose HPI, hiddenHistory, or teachingPoints reference Peak Expiratory Flow (PEF) as a severity marker MUST include "Peak Expiratory Flow" in availableLabs (or availableImaging if device-based) with a resulted value in labResults that is consistent with the stated severity tier (< 40% predicted = severe; 40–69% = moderate; ≥ 70% = mild).
ORTHOPNEA SPECIFICITY RULE: Orthopnea (relief when sitting upright, worsening when supine) is a symptom of cardiac or large-airway disease, NOT asthma. Do NOT list orthopnea as a hiddenSymptom or positive reviewOfSystems finding in an asthma case. Asthma's positional characteristics include nocturnal worsening and exertional triggers — use these instead.
SAH CT SENSITIVITY RULE: When a teaching point cites the sensitivity of non-contrast CT for subarachnoid hemorrhage, state: 93–98% sensitivity within 6 hours of onset. Do NOT cite sensitivity >98% or "near-100%." Always reinforce that lumbar puncture remains indicated when clinical suspicion is high and CT is negative, because CT sensitivity falls below 90% after 24 hours.
KEY-QUESTION HIDDEN-ANSWER COVERAGE RULE: Every item in hiddenHistory.hiddenSymptoms and hiddenHistory.fullHistory that is clinically pivotal to the diagnosis MUST have at least one corresponding entry in keyQuestions that would elicit it, OR it must be a detail the patient volunteers unprompted in their narrative. Sentinel events (prior sentinel headache, loss of consciousness at onset, prior sickle crisis, prior similar episode) are NEVER optional — they MUST appear in keyQuestions. Do not penalise a student for "missing" a pivotal finding that was not elicitable through any listed keyQuestion.
BALTHAZAR vs MCTSI RULE: Pancreatitis case teachingPoints referencing CT-based severity scoring MUST use the Modified CT Severity Index (MCTSI) terminology: grade pancreatic inflammation (0–4) + grade necrosis (0–6) for a total of 0–10. If using Balthazar letter grades (A–E), explicitly define each grade's radiological criteria in the teaching point (A = normal pancreas; B = focal/diffuse enlargement; C = heterogeneous, peripancreatic fat; D = single peripancreatic collection; E = ≥2 collections or gas). Do not cite one scoring system and apply the point scale of another.
STEATORRHEA TIMING RULE: Steatorrhea (fatty, malabsorptive, bulky stools from exocrine insufficiency) reflects chronic pancreatic damage. Do NOT include steatorrhea as a hiddenSymptom or positive reviewOfSystems finding in an acute pancreatitis case unless the case explicitly establishes pre-existing chronic pancreatitis or known exocrine insufficiency as a documented comorbidity in pastMedicalHistory.
STONE HEMATURIA TEACHING RULE: Teaching points about ureteral/kidney stones MUST state that hematuria is present in 75–85% of cases and explicitly add: "Absence of hematuria does NOT rule out urolithiasis." Do not cite hematuria prevalence above 85% or omit the caveat about hematuria-negative presentations.
KEY-QUESTION COMPLETENESS RULE: Every clinically required history element that appears in rubric-graded missedQuestions or keyQuestions MUST have a verbatim match in the keyQuestions array. Do not generate a grading rubric that penalises students for omissions of items that were never listed in keyQuestions. If a question appears in the grading rubric, it must also appear in keyQuestions — one-to-one coverage is required.
URINE CULTURE TIMING RULE: Urine cultures require 24–48 hours for growth. In an acute ED or urgent-care case workup, the labResults entry for urine culture MUST be labelled "Pending — preliminary results at 24 hours" rather than returning a final positive or negative immediately. Final urine culture results (speciation + sensitivities) are only appropriate in cases set ≥24 hours after the initial presentation.
TSH KINETICS RULE: Teaching points about TSH MUST accurately reflect pituitary response kinetics: TSH does NOT have a long serum half-life. The pituitary gland requires 4–6 weeks to re-equilibrate its TSH output in response to a change in circulating thyroid hormone levels. Statements such as "TSH has a long half-life" are incorrect — the delay reflects pituitary adaptation time, not TSH half-life. Use: "TSH normalisation lags 4–6 weeks behind changes in circulating T3/T4 because the pituitary requires time to re-equilibrate its secretion."
HYPOTHYROIDISM ANEMIA RULE: When a hypothyroidism case includes anemia in the CBC (low hemoglobin/hematocrit), availableLabs MUST include BOTH reticulocyte count (the gating workup decision — production vs destruction) AND at least one of (iron studies [ferritin, serum iron, TIBC], B12, or folate). A teachingPoint MUST explain the anemia mechanism for the specific MCV pattern in the case (normocytic normochromic = chronic hypothyroidism; microcytic = coexisting iron deficiency, often from menorrhagia in young female patients; macrocytic = coexisting B12 deficiency, including pernicious-anemia overlap with autoimmune thyroid disease). A standalone low hemoglobin without a reticulocyte count makes the case unworkable — the student has no production/destruction discriminator — and a mechanism teachingPoint absent the MCV-specific etiology is incomplete.
MONOSPOT SENSITIVITY RULE: Teaching points about the heterophile antibody (Monospot) test for EBV infection MUST cite: sensitivity 25–50% in the first week of illness, rising to approximately 85% by week 3. Do NOT cite sensitivity of 70–80% in the first week — that overstates early test performance and will mislead students into trusting a negative Monospot early in the disease.
EBV AMOX RASH MECHANISM RULE: Teaching points about the amoxicillin/ampicillin-associated rash in EBV infection MUST state: "The mechanism is incompletely understood and is believed to be T-cell mediated, not a true IgE-mediated drug allergy." Do NOT describe it as immune-complex mediated or as a Type III hypersensitivity reaction.
EBV SEROLOGY INTERPRETATION RULE: Teaching points about EBV serology MUST include the full interpretive context: VCA IgG positive + EBNA IgG negative is consistent with acute primary EBV (EBNA typically appears weeks to months after primary infection), but VCA IgG positivity alone does not confirm acuity without also stating VCA IgM and EBNA IgG status. Always reference the VCA IgM and EBNA IgG pattern together when teaching EBV serology interpretation.
HbSS MCV RULE: Homozygous sickle cell disease (HbSS) cases MUST use a normocytic (MCV 80–100 fL) or mildly macrocytic anemia in CBC results. A microcytic MCV (< 80 fL) in a HbSS case implies coexisting iron deficiency or compound heterozygosity with thalassemia — do not use MCV < 80 fL in a pure HbSS teaching case unless the case explicitly establishes one of these co-diagnoses with supporting lab data (low ferritin, hemoglobin electrophoresis showing thalassemia trait, etc.).
MORNING-DARK-URINE SPECIFICITY RULE: Morning-predominant dark urine (tea-coloured, cola-coloured urine worst upon waking) is the classic teaching pattern for Paroxysmal Nocturnal Hemoglobinuria (PNH) due to complement activation during sleep and dependent complement membrane attack. Do NOT attribute morning-predominant dark urine to a sickle cell disease hemolytic crisis — SCD hemolysis is episodic but not characteristically morning-predominant. Use "dark urine during a vaso-occlusive/hemolytic episode" for SCD without the morning-predominance framing.
HEMOGLOBINURIA vs HEMATURIA RULE: In any hemolytic anemia case where dipstick urinalysis is positive for blood, the urinalysis labResult MUST explicitly note: "No RBCs on urine microscopy — dipstick positivity reflects hemoglobinuria, not hematuria." This distinguishes intravascular hemolysis from a renal or urological source of bleeding and prevents miscategorisation of the finding as hematuria.
UNHAPPY TRIAD ANATOMY RULE: Do NOT state that the medial meniscus is more commonly injured in the "unhappy triad" — modern sports medicine literature demonstrates that the lateral meniscus is more frequently torn in combination with ACL injury than the medial meniscus. Either avoid the "unhappy triad" framing entirely, or state "the classic 'unhappy triad' describes ACL + MCL + meniscus injury; contemporary data suggest the lateral meniscus is more commonly co-injured than the medial meniscus."
MSK PHYSICAL EXAM PRESENCE RULE: Every musculoskeletal case MUST include a physicalExam section with at least the joint-specific provocative tests appropriate to the anatomy: knee cases must include Lachman test, anterior drawer test, and McMurray test results; shoulder cases must include Neer, Hawkins-Kennedy, and Jobe (empty can) test results; ankle cases must include anterior drawer and talar tilt. Do NOT gate the entire diagnosis on imaging alone — physical exam findings are a mandatory graded component of every MSK case.
RESOURCE STEWARDSHIP RULE: When ordering broadly applicable low-yield labs (CRP, ESR, LDH, uric acid, ANA, coagulation panel) in a case with a clear traumatic or mechanical presentation and no operative, thrombotic, or inflammatory indication, the expectedLabs array MUST NOT list these tests as expected, and the grading rubric should reflect only partial credit for ordering them. The teachingPoints MUST include a stewardship note explaining why the ordered test adds marginal diagnostic value in this presentation.
APAP LFT TIMING RULE: For acute acetaminophen overdose cases, the timing of hepatotoxicity in labResults MUST be physiologically accurate: at 0–24 hours post-ingestion, AST and ALT are normal or minimally elevated (< 2× ULN). Transaminase elevation begins at 24–72 hours (Phase II). Do NOT generate an acute APAP case presenting at 6 hours with markedly elevated transaminases — this is biologically impossible and teaches incorrect acetaminophen toxicology. Reserve significant LFT elevation (AST > 1000 IU/L) for cases explicitly set at 24–72 hours post-ingestion.
RUMACK-MATTHEW THRESHOLD RULE: Teaching points referencing the Rumack-Matthew nomogram MUST use the correct time-interpolated thresholds for the treatment line: serum acetaminophen ≥150 µg/mL at 4 hours post-ingestion (≈100 µg/mL at 6h; ≈75 µg/mL at 8h; ≈37.5 µg/mL at 12h). The labResults referenceRange for a serum acetaminophen ordered at a specific post-ingestion time MUST reflect the corresponding threshold at that time, not collapse all cutoffs to a single number. Citing "≥150 µg/mL" as a universal threshold without the time anchor is incorrect and misleading.
UDS SALICYLATE QUALITATIVE RULE: When both a urine drug screen and a serum salicylate level are ordered in a case of suspected salicylate toxicity, teachingPoints MUST include: "A negative urine qualitative salicylate screen does NOT exclude salicylate toxicity — the serum salicylate concentration is the definitive quantitative test and MUST be used to guide management." Do not imply that a negative UDS salicylate result rules out significant toxicity.
COLLES vs SCAPHOID LOCALISATION RULE: Colles' fracture (distal radius) presents with dorsal tenderness directly over the distal radius, not in the anatomic snuffbox. Anatomic snuffbox tenderness (between extensor pollicis longus and extensor pollicis brevis/abductor pollicis longus) is the hallmark of scaphoid injury. Do NOT include anatomic snuffbox tenderness in the physicalExam of a confirmed Colles' fracture case unless the student specifically palpates the snuffbox AND the case design includes a co-injury, in which case both fractures must be confirmed in imagingResults.
LAB STEWARDSHIP RULE: For clearly localised orthopaedic trauma cases (isolated distal radius fracture, ankle fracture, clavicle fracture) with no operative urgency, anticoagulation indication, or systemic findings, do NOT include CMP, coagulation panel (PT/INR/aPTT), or blood type/screen in availableLabs unless the case narrative explicitly establishes a specific indication (e.g., patient on warfarin, planned ORIF). Ordering these panels in a non-operative isolated fracture is poor stewardship and should not be presented as appropriate practice.
DSM CRITERION TEXT CONSISTENCY RULE: Symptoms cited in teachingPoints to satisfy DSM-5 (or other diagnostic criteria) criterion counts MUST appear in the case data — either in hpi, hiddenHistory.hiddenSymptoms, hiddenHistory.fullHistory, or reviewOfSystems. A symptom that is stated as "present" in a teaching point but absent from (or contradicted by) the case narrative is a case-design error. Specifically: if the HPI describes insomnia, the hiddenHistory MUST NOT list hypersomnia as a hidden finding for the same patient — contradictory symptom pairs within the same case are forbidden.
SAFETY-CRITICAL ELICITATION RULE: For psychiatric cases, the patient MUST volunteer at least one cue toward suicidal ideation, self-harm, hopelessness, or a safety concern during their unprompted speech or HPI — do NOT bury all safety-critical content entirely behind a specific question the student may never ask. The patient's narrative should include at minimum a vague but detectable safety signal (e.g., "I don't see the point anymore", "I've been thinking about not being here", "Things feel very dark") that a safety-aware student would recognise and probe further.
GRADING TEXT FIDELITY RULE: Grading feedback in teachingPoints and rubric rationale fields MUST be limited to tests and findings that the student actually ordered or elicited. Do NOT credit a student for a test they did not order, and do NOT include language such as "you correctly ordered [test]" if that test was not in the student's ordered set. This rule applies to both case generation (teachingPoints that name specific ordered tests) and to any grading rubric text generated from this case.
PATIENT NAME UNIQUENESS RULE: Within any generation batch or single-session generation sequence, no two cases may share the same first name OR last name. The CASE_SYSTEM_PROMPT already instructs diverse name rotation — additionally, when generating multiple cases in sequence, explicitly avoid any name used in a prior case in the same session by treating previously generated names as excluded.
EXAMPLE — what NOT to write and what to write instead:
✗ WRONG (rule violation): "Troponin I (Hour 0)": { "components": [{ "name": "Troponin I", "value": "4.82", "unit": "ng/mL", "referenceRange": "<0.04 ng/mL (time-zero); rises 3-6h after injury", "status": "critical" }] }
✓ CORRECT: "Troponin I (Hour 0)": { "components": [{ "name": "Troponin I", "value": "0.03", "unit": "ng/mL", "referenceRange": "<0.04 ng/mL (time-zero); rises 3-6h after injury", "status": "normal" }] }, "Troponin I (3 hours)": { "components": [{ "name": "Troponin I", "value": "1.42", "unit": "ng/mL", "referenceRange": "<0.04 ng/mL", "status": "high" }] }
The value field — not the referenceRange text — is what makes the case biologically plausible. Adding kinetics commentary to referenceRange while leaving Hour 0 value critically elevated is the exact rule violation this rule forbids.
IMAGING MODALITY CONSISTENCY RULE: Non-contrast CT imagingResults MUST NOT reference contrast extravasation, vascular blush, contrast enhancement, or perfusion defects — these findings are physically impossible without IV contrast. CT without contrast can only describe: attenuation (density in HU), calcifications, gross morphology, and size. Contrast-enhanced findings belong only in studies ordered with contrast (CT with contrast, CT angiography, MRI with gadolinium). Match every finding in imagingResults to what the stated modality can physically detect.
STEMI MIMIC PROTOCOL RULE: When a case ECG shows ST elevation meeting STEMI criteria (≥2mm in ≥2 contiguous leads with or without reciprocal changes), teachingPoints MUST explicitly state: (1) ACS/STEMI must be urgently excluded — coronary angiography or urgent cath-lab evaluation is pursued based on clinical context and institutional protocol; (2) the final diagnosis (Prinzmetal's angina, pericarditis, takotsubo, early repolarization, etc.) is a diagnosis of exclusion ONLY AFTER urgent ACS workup is completed. Do NOT state that STEMI protocol activation is categorically mandatory — formal STEMI protocol activation vs. urgent cardiology consultation depends on the clinical context. Never omit the ACS-exclusion imperative for any ECG-positive STEMI mimic — omitting it creates a patient-safety teaching gap.
STEMI CATH-LAB EMPHASIS RULE: For STEMI cases (any territorial variant — anterior, inferior, lateral, posterior, RV), at least ONE of the four teachingPoints MUST be a concrete reperfusion-management pearl that names BOTH a specific time target AND a specific reperfusion modality — e.g., "Primary PCI is the preferred reperfusion strategy; door-to-balloon time target is ≤90 minutes from first medical contact at a PCI-capable facility. When PCI cannot be delivered within 120 minutes, fibrinolysis within 30 minutes of arrival (door-to-needle) is the alternative." Generic phrases such as "manage in a cardiac setting" or "give aspirin and heparin" do NOT satisfy this rule — the time threshold AND the modality must both be explicit. This requirement is in ADDITION to the existing MANAGEMENT TEACHING POINT RULE, not a replacement; STEMI cases need both general management content AND the reperfusion-timing pearl.
ADVANCED CONFIRMATORY TEST RULE: Advanced difficulty cases MUST include the gold-standard confirmatory or discriminating test for the primary diagnosis in availableImaging or availableLabs. Examples: coronary angiography for Prinzmetal's angina or coronary vasospasm; EEG for status epilepticus or non-convulsive seizure; muscle biopsy for inflammatory myopathy; bone marrow biopsy for hematologic malignancy; provocative testing for pheochromocytoma. A case without its confirmatory test fails the educational goal of Advanced difficulty (see DIFFICULTY_RULES Advanced: "include one pathognomonic or definitively discriminating result").
DM DIFFERENTIATION RULE: Diabetes mellitus cases MUST include the data needed to correctly classify T1 vs T2: (1) C-peptide MUST appear in availableLabs and have a result in labResults — C-peptide is the definitive differentiator (low/undetectable in T1, normal/elevated in T2). (2) BOTH height and weight MUST appear in vitals so BMI is calculable; if T2DM is the answer, weight at the stated height must yield BMI ≥30 (obesity), and the obesity context must also be conveyed in hpi or hiddenHistory.fullHistory. (3) If T2DM is the diagnosis but the presentation includes T1DM-mimicking features (rapid unintentional weight loss, ketonuria, lean appearance, age <35), the case MUST include explicit T2DM-distinguishing data — prior obesity history, family history of T2DM, gradual symptom evolution, OR a normal/elevated C-peptide — sufficient for a Foundations student to reach T2DM rather than T1DM. A case that does not support its own correct answer is a failed case.
URINE DRUG SCREEN ANALYTE RULE: Standard urine immunoassay drug panels NEVER include acetaminophen. Acetaminophen toxicity is exclusively confirmed via serum acetaminophen level plotted against the Rumack-Matthew nomogram — NOT a urine screen. Do NOT list acetaminophen as a component of any Urine Drug Screen (UDS) labResult. If the case involves acetaminophen toxicity, the serum acetaminophen level MUST appear in availableLabs and have a corresponding result in labResults. Adding acetaminophen to a UDS panel teaches students an incorrect diagnostic pathway.`

export const JSON_SCHEMA_TEMPLATE = `{
  "patientInfo": { "name": "First Last", "age": <number>, "gender": "Male or Female", "chiefComplaint": "<brief>", "height": "<e.g. 5'9\\">", "heightInches": <integer> },
  "hpi": "<2-3 sentences. HARD MAXIMUM 60 WORDS. State ONLY: chief complaint, primary symptom(s), and duration. NEVER include severity ratings or pain scales (e.g., X/10).>",
  "clinicalHpi": "<2-3 sentences, MAXIMUM 40 WORDS. Do NOT use comorbidity adjectives (diabetic, hypertensive, obese, asthmatic, cirrhotic, etc.) or name chronic diseases — those belong in pastMedicalHistory.conditions, which the student must elicit. NEVER include severity ratings or pain scales (e.g., X/10).>",
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
  "relevantExamRegions": ["<physicalExam key>", ...list only regions a competent physician would target for this diagnosis],
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

export function buildExcludedNamesBlock(usedNames?: string[]): string {
  if (!usedNames?.length) return ''
  const recent = usedNames.slice(-50)
  const lines = recent.map(n => `- ${n}`).join('\n')
  return `\nEXCLUDED NAMES — do NOT reuse any of these first OR last names; pick fresh ones from a different ethnic naming pool:\n${lines}\n`
}

export function nameCollides(generated: string, usedNames: string[]): boolean {
  const tokenize = (s: string) =>
    s.toLowerCase().split(/\s+/).filter(t => t.length > 1)
  const usedTokens = new Set(usedNames.flatMap(tokenize))
  return tokenize(generated).some(t => usedTokens.has(t))
}

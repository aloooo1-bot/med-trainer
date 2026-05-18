# MedTrainer Student Audit — Findings Report
Generated: 2026-05-17T19:39:22.253Z

**Total findings:** 148  (29 high · 90 medium · 29 low)

## Top Priority Findings

### [HIGH] cc-001: History score awarded inconsistently relative to missed key questions
**Category:** inconsistency  |  **Source:** cross-cutting — case-15 (Neurologic, Clinical), case-13 (Cardiovascular, Clinical), case-19 (Infectious Clinical), history, review

**Evidence:** > case-15: student missed 3 of 4 key questions yet received 14/20 (70%); case-13: student missed 2 of 4 key questions yet received 15/20 (75%); case-19: '2 of 4 key questions were missed entirely' yet score given is 15. review tab: 'History & Interview 81%' as a system-wide average despite multiple documented key-question misses. The scoring narrative consistently praises performance while penalizing only marginally.

**Suggestion:** Implement a programmatic key-question coverage floor: each missed designated key question should deduct a defined fixed proportion of the History dimension score (e.g., 25% of dimension per missed key question when 4 are defined), and the qualitative feedback narrative must be generated after the score, not independently, so the two cannot contradict each other.

### [HIGH] cc-002: Grading penalizes students for citing vitals that ARE present in caseData
**Category:** inconsistency  |  **Source:** cross-cutting — case-16 (Gastrointestinal Clinical), case-18 (Endocrine/Metabolic Clinical)

**Evidence:** > case-16: 'you referenced systemic signs (fever, tachycardia, elevated RR) that were not documented in the available case data' — yet caseData.vitals shows hr:108, rr:20, temp:100.4. case-18: 'the reasoning referenced vital signs (HR 56, temp 97.1°F, BP 138/88) that were not part of the available case data — their inclusion introduces a minor fabrication concern' — yet caseData.vitals shows bp:138/88, hr:56, temp:97.1. Both cases incorrectly accuse students of fabricating data they legitimately read from the case.

**Suggestion:** The grading engine must cross-reference student-cited values against caseData.vitals before issuing a fabrication warning; implement a lookup that confirms whether cited numerical values appear in any field of the provided case record before generating negative feedback.

### [HIGH] cc-003: Test ordering scores near-full despite clinically significant missing tests
**Category:** inconsistency  |  **Source:** cross-cutting — case-8 (Hematologic/Oncologic Foundations), case-12 (Trauma Foundations), case-15 (Neurologic, Clinical), case-14 (Respiratory, Clinical)

**Evidence:** > case-14: thoracentesis not ordered yet testOrdering score 19/20 and feedback calls the omission 'only a minor gap' despite pleural gram stain being management-altering. case-15: MRI brain with contrast not ordered yet test ordering score 17 with feedback calling the workup 'complete and appropriate.' case-8: testOrdering score 22 with 'Excellent and comprehensive' feedback despite incorrect primary diagnosis. case-12: hand X-ray not ordered yet grading credits the student for ordering it.

**Suggestion:** Define a list of 'pivotal tests' per case (tests whose results would change the primary diagnosis or immediate management); any pivotal test that is not ordered must trigger a mandatory deduction with explicit named feedback, and cannot be offset by high scores on non-pivotal tests.

### [HIGH] cc-004: Scoring rubric dimension weights applied inconsistently across tabs and cases
**Category:** inconsistency  |  **Source:** cross-cutting — history, review, help

**Evidence:** > history tab (f-234): 'fully complete' Diagnosis Completeness answer receives 11/16 (68.75%) — feedback calls it 'fully complete' then deducts 31%. history tab (f-227): 'Strong targeted questioning' praise co-exists with a 21% History deduction for one missed item. help tab (f-221): FAQ states omitting a qualifier like 'spontaneous' from 'spontaneous pneumothorax' is 'still marked correct' while STEMI territory omission is penalized. review tab (f-231/f-232): STEMI without territory graded 'Correct' in two sessions.

**Suggestion:** Centralize all scoring logic in a single rubric engine with explicit, versioned rules for each deduction tier; qualitative feedback text must be auto-generated from the numeric deduction calculation rather than written independently, so score and narrative are guaranteed to be consistent.

### [HIGH] cc-005: STEMI graded correct without territory identification — patient safety risk
**Category:** medical_inaccuracy  |  **Source:** cross-cutting — history, case-13 (Cardiovascular, Clinical)

**Evidence:** > history tab session 2a3757a8: Your Diagnosis 'STEMI (ST-Elevation Myocardial Infarction)' vs Correct Diagnosis 'ST-Elevation Myocardial Infarction (Inferior STEMI)' — Result badge 'Correct.' history tab session 74daa201: same pattern. case-13 help rubric example uses STEMI/NSTEMI as the canonical partial-credit example without mentioning territory. Inferior STEMI requires right-sided leads to exclude RV infarction before nitrate administration, which is contraindicated in RV involvement.

**Suggestion:** For all STEMI cases, territory (Anterior/Inferior/Lateral) must be a required diagnostic component; a territory-unspecified STEMI diagnosis must be graded as incomplete and the feedback must explicitly state the patient-safety rationale for territory specification.

### [HIGH] cc-006: Wrong or unsupported diagnoses receive passing total scores due to high workup sub-scores
**Category:** inconsistency  |  **Source:** cross-cutting — case-8 (Hematologic/Oncologic Foundations), case-9 (Musculoskeletal Foundations), case-15 (Neurologic, Clinical)

**Evidence:** > case-8: wrong primary diagnosis (Hereditary Spherocytosis) receives overall score 72 because testOrdering scored 22/high. case-9: student adds unconfirmed meniscal co-diagnosis contradicted by MRI yet diagnosisAccuracy is 30 with near-full credit. case-15: student submitted SAH despite non-thunderclap onset and confirmatory LP showing bacterial meningitis findings; test ordering scored 17 with 'complete and appropriate' label.

**Suggestion:** Implement a diagnosis-accuracy gate: if the submitted primary diagnosis is incorrect, the total score must be capped at a defined maximum (e.g., 65/100) regardless of workup sub-scores, with explicit rubric language explaining that correct diagnosis is a prerequisite for full scoring, not an offset-able dimension.

### [HIGH] cc-007: HPI states patient denies a symptom that hidden history confirms is present
**Category:** inconsistency  |  **Source:** cross-cutting — case-8 (Hematologic/Oncologic Foundations), case-11 (Toxicologic Foundations), case-12 (Trauma Foundations), case-15 (Neurologic, Clinical)

**Evidence:** > case-8 HPI: 'no prior similar episodes' vs hiddenHistory: 'hand and foot swelling as an infant' and 'intermittent deep bone pain over the past year.' case-11 HPI: patient 'denies co-ingestion' vs hiddenSymptoms: 'diaphoresis and pallor noted by nursing staff.' case-12 HPI: 'denies numbness or tingling' vs hiddenHistory: 'mild paresthesias in the thumb and index finger that began shortly after the fall.' The HPI denial is presented as a baseline negative finding when the symptom is in fact present.

**Suggestion:** Establish a content authoring rule: the visible HPI may only state a symptom as denied if the hiddenHistory does not contradict it; for hidden symptoms, the HPI must use qualified language such as 'has not volunteered' or 'not yet asked' rather than an outright denial, so learners are not taught that an initial negative report constitutes a confirmed absence.

### [HIGH] f-006: SCD case: MCV 79 fL labeled low — inconsistent with classic HbSS MCV
**Category:** medical_inaccuracy  |  **Source:** case — case-8 (Hematologic/Oncologic Foundations)

**Evidence:** > "MCV": "79", "unit": "fL", "referenceRange": "80-100", "status": "low"

**Suggestion:** Classic uncomplicated HbSS sickle cell disease typically has a normal or mildly elevated MCV (not microcytic), because the compensatory reticulocytosis raises MCV; a low MCV of 79 fL would suggest co-existing iron deficiency or alpha-thalassemia trait and should either be explained in the case narrative or corrected to a normal value (e.g., 86–92 fL) to avoid teaching that microcytosis is expected in isolated HbSS.

### [HIGH] f-009: HPI states 'no prior similar episodes' — contradicted by hidden history dactylitis
**Category:** inconsistency  |  **Source:** case — case-8 (Hematologic/Oncologic Foundations)

**Evidence:** > HPI: "He has no prior similar episodes" vs. hiddenHistory: "He confirms experiencing hand and foot swelling as an infant that resolved spontaneously" and hiddenSymptoms: "patient reports intermittent deep bone pain in his lower back and thighs over the past year"

**Suggestion:** The HPI statement 'no prior similar episodes' directly contradicts both the hidden dactylitis history (classic SCD presentation in infancy) and the hidden recurrent bone pain, which the patient confirms if asked; the HPI should be revised to say 'no prior formally evaluated episodes' or 'no prior hospitalizations for pain crises' to preserve clinical realism without pre-emptively closing off the SCD diagnosis before history-taking.

### [HIGH] f-011: Student's submitted diagnosis is Hereditary Spherocytosis — graded incorrect, but score 72 awarded despite correct workup
**Category:** inconsistency  |  **Source:** case — case-8 (Hematologic/Oncologic Foundations)

**Evidence:** > "diagnosis": "Hereditary Spherocytosis (or possibly G6PD deficiency...)", "correct": false, "score": 72, and "testOrdering": {"score": 22, "feedback": "Excellent and comprehensive test ordering"}

**Suggestion:** The student received a 72 (passing) with a completely wrong primary diagnosis, in part because of high test-ordering marks — consider whether the scoring rubric should apply a harder penalty floor for a wrong diagnosis at Foundations level, or add explicit rubric language explaining why correct workup does not compensate for an incorrect primary diagnosis, so learners understand diagnostic accuracy is the highest-weight outcome.

## Cross-Cutting Patterns

### cc-001: History score awarded inconsistently relative to missed key questions _(high)_
**Source:** case-15 (Neurologic, Clinical), case-13 (Cardiovascular, Clinical), case-19 (Infectious Clinical), history, review

case-15: student missed 3 of 4 key questions yet received 14/20 (70%); case-13: student missed 2 of 4 key questions yet received 15/20 (75%); case-19: '2 of 4 key questions were missed entirely' yet score given is 15. review tab: 'History & Interview 81%' as a system-wide average despite multiple documented key-question misses. The scoring narrative consistently praises performance while penalizing only marginally.

**Fix:** Implement a programmatic key-question coverage floor: each missed designated key question should deduct a defined fixed proportion of the History dimension score (e.g., 25% of dimension per missed key question when 4 are defined), and the qualitative feedback narrative must be generated after the score, not independently, so the two cannot contradict each other.

### cc-002: Grading penalizes students for citing vitals that ARE present in caseData _(high)_
**Source:** case-16 (Gastrointestinal Clinical), case-18 (Endocrine/Metabolic Clinical)

case-16: 'you referenced systemic signs (fever, tachycardia, elevated RR) that were not documented in the available case data' — yet caseData.vitals shows hr:108, rr:20, temp:100.4. case-18: 'the reasoning referenced vital signs (HR 56, temp 97.1°F, BP 138/88) that were not part of the available case data — their inclusion introduces a minor fabrication concern' — yet caseData.vitals shows bp:138/88, hr:56, temp:97.1. Both cases incorrectly accuse students of fabricating data they legitimately read from the case.

**Fix:** The grading engine must cross-reference student-cited values against caseData.vitals before issuing a fabrication warning; implement a lookup that confirms whether cited numerical values appear in any field of the provided case record before generating negative feedback.

### cc-003: Test ordering scores near-full despite clinically significant missing tests _(high)_
**Source:** case-8 (Hematologic/Oncologic Foundations), case-12 (Trauma Foundations), case-15 (Neurologic, Clinical), case-14 (Respiratory, Clinical)

case-14: thoracentesis not ordered yet testOrdering score 19/20 and feedback calls the omission 'only a minor gap' despite pleural gram stain being management-altering. case-15: MRI brain with contrast not ordered yet test ordering score 17 with feedback calling the workup 'complete and appropriate.' case-8: testOrdering score 22 with 'Excellent and comprehensive' feedback despite incorrect primary diagnosis. case-12: hand X-ray not ordered yet grading credits the student for ordering it.

**Fix:** Define a list of 'pivotal tests' per case (tests whose results would change the primary diagnosis or immediate management); any pivotal test that is not ordered must trigger a mandatory deduction with explicit named feedback, and cannot be offset by high scores on non-pivotal tests.

### cc-004: Scoring rubric dimension weights applied inconsistently across tabs and cases _(high)_
**Source:** history, review, help

history tab (f-234): 'fully complete' Diagnosis Completeness answer receives 11/16 (68.75%) — feedback calls it 'fully complete' then deducts 31%. history tab (f-227): 'Strong targeted questioning' praise co-exists with a 21% History deduction for one missed item. help tab (f-221): FAQ states omitting a qualifier like 'spontaneous' from 'spontaneous pneumothorax' is 'still marked correct' while STEMI territory omission is penalized. review tab (f-231/f-232): STEMI without territory graded 'Correct' in two sessions.

**Fix:** Centralize all scoring logic in a single rubric engine with explicit, versioned rules for each deduction tier; qualitative feedback text must be auto-generated from the numeric deduction calculation rather than written independently, so score and narrative are guaranteed to be consistent.

### cc-005: STEMI graded correct without territory identification — patient safety risk _(high)_
**Source:** history, case-13 (Cardiovascular, Clinical)

history tab session 2a3757a8: Your Diagnosis 'STEMI (ST-Elevation Myocardial Infarction)' vs Correct Diagnosis 'ST-Elevation Myocardial Infarction (Inferior STEMI)' — Result badge 'Correct.' history tab session 74daa201: same pattern. case-13 help rubric example uses STEMI/NSTEMI as the canonical partial-credit example without mentioning territory. Inferior STEMI requires right-sided leads to exclude RV infarction before nitrate administration, which is contraindicated in RV involvement.

**Fix:** For all STEMI cases, territory (Anterior/Inferior/Lateral) must be a required diagnostic component; a territory-unspecified STEMI diagnosis must be graded as incomplete and the feedback must explicitly state the patient-safety rationale for territory specification.

### cc-006: Wrong or unsupported diagnoses receive passing total scores due to high workup sub-scores _(high)_
**Source:** case-8 (Hematologic/Oncologic Foundations), case-9 (Musculoskeletal Foundations), case-15 (Neurologic, Clinical)

case-8: wrong primary diagnosis (Hereditary Spherocytosis) receives overall score 72 because testOrdering scored 22/high. case-9: student adds unconfirmed meniscal co-diagnosis contradicted by MRI yet diagnosisAccuracy is 30 with near-full credit. case-15: student submitted SAH despite non-thunderclap onset and confirmatory LP showing bacterial meningitis findings; test ordering scored 17 with 'complete and appropriate' label.

**Fix:** Implement a diagnosis-accuracy gate: if the submitted primary diagnosis is incorrect, the total score must be capped at a defined maximum (e.g., 65/100) regardless of workup sub-scores, with explicit rubric language explaining that correct diagnosis is a prerequisite for full scoring, not an offset-able dimension.

### cc-007: HPI states patient denies a symptom that hidden history confirms is present _(high)_
**Source:** case-8 (Hematologic/Oncologic Foundations), case-11 (Toxicologic Foundations), case-12 (Trauma Foundations), case-15 (Neurologic, Clinical)

case-8 HPI: 'no prior similar episodes' vs hiddenHistory: 'hand and foot swelling as an infant' and 'intermittent deep bone pain over the past year.' case-11 HPI: patient 'denies co-ingestion' vs hiddenSymptoms: 'diaphoresis and pallor noted by nursing staff.' case-12 HPI: 'denies numbness or tingling' vs hiddenHistory: 'mild paresthesias in the thumb and index finger that began shortly after the fall.' The HPI denial is presented as a baseline negative finding when the symptom is in fact present.

**Fix:** Establish a content authoring rule: the visible HPI may only state a symptom as denied if the hiddenHistory does not contradict it; for hidden symptoms, the HPI must use qualified language such as 'has not volunteered' or 'not yet asked' rather than an outright denial, so learners are not taught that an initial negative report constitutes a confirmed absence.

### cc-008: Unordered test results surfaced to student — simulation fidelity broken _(medium)_
**Source:** case-8 (Hematologic/Oncologic Foundations), case-10 (Psychiatric Foundations), case-14 (Respiratory, Clinical)

case-14: Thoracentesis/Pleural Fluid Analysis not in testsOrdered yet full pleural fluid results (pH 7.14, glucose 42, gram-positive diplococci) appear in labResults and student reasons from them. case-8: peripheral blood smear categorized under availableImaging, making its results accessible without a separate order. case-10: passive suicidal ideation present in hiddenHistory without any gating mechanism requiring the student to ask directly before it is revealed.

**Fix:** Enforce a strict test-gating rule at the data layer: no result object should be rendered in the student-facing case state unless the corresponding test appears in the student's testsOrdered list; implement this as a server-side filter so it cannot be bypassed by front-end inspection.

### cc-009: Non-laboratory procedures listed under availableImaging category _(medium)_
**Source:** case-8 (Hematologic/Oncologic Foundations), case-14 (Respiratory, Clinical)

case-8: 'availableImaging: ["Peripheral Blood Smear", "Abdominal Ultrasound", "Chest X-Ray"]' — peripheral blood smear is a bench laboratory test. case-14: 'availableImaging: ["Chest X-Ray", "CT Chest with Contrast", "ECG", "Thoracentesis"]' — ECG is a cardiac electrophysiology study and thoracentesis is a bedside procedure, neither of which is an imaging modality.

**Fix:** Introduce a third orderable category (e.g., 'Procedures') alongside availableLabs and availableImaging, and re-classify peripheral blood smear, ECG, and thoracentesis appropriately; correct categorization is itself a learning objective for clinical trainees.

### cc-010: Clinically significant hidden findings never discoverable or graded _(medium)_
**Source:** case-21 (Musculoskeletal Clinical), case-19 (Infectious Clinical), case-20 (Hematologic/Oncologic Clinical)

case-21 hiddenSymptoms: 'firm, non-tender nodule over right olecranon for 6 months consistent with a tophus' — never revealed, never graded, changes disease classification to chronic tophaceous gout. case-19 hiddenHistory: 'exquisitely tender, swollen, warm prostate on DRE; massage not performed due to bacteremia risk' — never presented, never graded despite being defining for diagnosis. case-20 workingDiagnosis 'Lymphoma' never shown in feedback to contrast with final CLL diagnosis.

**Fix:** Audit all hiddenHistory and hiddenSymptom fields: any finding that (a) changes the primary diagnosis category, (b) changes the management plan, or (c) is explicitly cited in teaching points must be assigned a key-question trigger and a grading weight; hidden findings with no reveal path and no grading weight provide zero educational value.

### cc-011: Unexplained or mislabeled lab results with no teaching point resolution _(medium)_
**Source:** case-20 (Hematologic/Oncologic Clinical), case-8 (Hematologic/Oncologic Foundations), case-16 (Gastrointestinal Clinical)

case-20: MCV 101 fL elevated with status 'high' and no explanation anywhere in case, teaching points, or grading. case-8: HbF 6% flagged 'high' with reference range '<2%' appropriate only for normal adults, teaching learners that elevated HbF is pathological in SCD. case-16: Triglycerides 310 mg/dL returned as elevated with no teaching point distinguishing it from the ~500–1000 mg/dL threshold for hypertriglyceridemic pancreatitis.

**Fix:** Establish a content authoring rule that every lab result with a non-normal status flag must have a corresponding teaching point or inline annotation explaining its clinical significance in the context of the case diagnosis; unexplained abnormal values create unresolved cognitive load and risk incorrect learning.

### cc-012: All six case workflow nav steps disabled with no affordance explaining prerequisite _(medium)_
**Source:** focus, trainer

focus tab: 'button disabled="" class="... cursor-not-allowed text-ink-tertiary/50"><span>History of Present Illness</span>' repeated for all six steps with no tooltip. trainer tab: 'button disabled="" class="flex w-full items-center gap-2.5 ... cursor-not-allowed text-ink-tertiary/50"><span>History of Present Illness</span>' — identical pattern, no unlock guidance, no step numbering, no progress indicator in either location.

**Fix:** Add a consistent tooltip on all disabled nav steps (e.g., 'Generate a case to unlock this step') and number the steps visually so the required sequence is self-evident; apply this fix from a shared component used by both the focus and trainer pages.

### cc-013: Teaching points describe management actions without anchoring to the specific patient _(medium)_
**Source:** case-17 (Renal Clinical), case-19 (Infectious Clinical), case-21 (Musculoskeletal Clinical), case-15 (Neurologic, Clinical)

undefined

**Fix:** undefined

## Case-Level Findings

### Inconsistency (23)

**f-009** [high] HPI states 'no prior similar episodes' — contradicted by hidden history dactylitis — _case-8 (Hematologic/Oncologic Foundations)_
> HPI: "He has no prior similar episodes" vs. hiddenHistory: "He confirms experiencing hand and foot swelling as an infant that resolved spontaneously" and hiddenSymptoms: "patient reports intermittent deep bone pain in his lower back and thighs over the past year"
*The HPI statement 'no prior similar episodes' directly contradicts both the hidden dactylitis history (classic SCD presentation in infancy) and the hidden recurrent bone pain, which the patient confirms if asked; the HPI should be revised to say 'no prior formally evaluated episodes' or 'no prior hospitalizations for pain crises' to preserve clinical realism without pre-emptively closing off the SCD diagnosis before history-taking.*

**f-010** [medium] Peripheral Blood Smear listed under 'availableImaging' — incorrect categorization — _case-8 (Hematologic/Oncologic Foundations)_
> "availableImaging": ["Peripheral Blood Smear", "Abdominal Ultrasound", "Chest X-Ray"]
*A peripheral blood smear is a laboratory/hematology test, not an imaging study — categorizing it under imaging teaches incorrect procedural classification; move it to 'availableLabs' (alongside or within hematology tests) to reinforce that smear review is a bench laboratory interpretation, not a radiology-ordered imaging modality.*

**f-011** [high] Student's submitted diagnosis is Hereditary Spherocytosis — graded incorrect, but score 72 awarded despite correct workup — _case-8 (Hematologic/Oncologic Foundations)_
> "diagnosis": "Hereditary Spherocytosis (or possibly G6PD deficiency...)", "correct": false, "score": 72, and "testOrdering": {"score": 22, "feedback": "Excellent and comprehensive test ordering"}
*The student received a 72 (passing) with a completely wrong primary diagnosis, in part because of high test-ordering marks — consider whether the scoring rubric should apply a harder penalty floor for a wrong diagnosis at Foundations level, or add explicit rubric language explaining why correct workup does not compensate for an incorrect primary diagnosis, so learners understand diagnostic accuracy is the highest-weight outcome.*

**f-012** [medium] Student adds 'likely concurrent medial meniscus injury' — MRI shows no meniscal tear, yet diagnosisAccuracy penalized only partially — _case-9 (Musculoskeletal Foundations)_
> Student diagnosis: "ACL tear...likely with concurrent medial meniscus injury"; MRI result: "The medial and lateral menisci demonstrate no significant tear"; diagnosisAccuracy score: 30 with feedback "not supported by the MRI findings...prevents full credit for accuracy"
*The feedback correctly identifies the issue but the scoring consequence (30/36 apparent near-full credit) is mild relative to the clinical significance of adding an unconfirmed surgical co-diagnosis; consider adding explicit rubric guidance that unconfirmed co-diagnoses contradicted by available imaging should incur a defined deduction to reinforce evidence-based diagnostic discipline.*

**f-021** [medium] HPI states patient denies diaphoresis/pallor but hidden history reveals these symptoms were observed — _case-11 (Toxicologic Foundations)_
> HPI: "He reports nausea, vomiting twice, and diffuse dull abdominal pain since shortly after ingestion. He denies co-ingestion of alcohol or other substances." vs. hiddenSymptoms: "diaphoresis and pallor noted by nursing staff shortly after arrival"
*The diaphoresis and pallor are nursing-observed objective findings, not patient-reported symptoms — they should be documented in the visible case data (vitals section or physical exam findings) rather than hidden, since objective nursing observations are not gated behind specific student questioning in real clinical practice; hiding them creates a false learning model.*

**f-022** [medium] Student interview elicits maximal tenderness at anatomical snuffbox, inconsistent with confirmed Colles' fracture diagnosis — _case-12 (Trauma Foundations)_
> Patient response: "it's definitely more on the thumb side — right here, kind of in that little hollow area below the thumb. That spot is absolutely killing me, way worse than the rest of the wrist." Grading feedback: "Your identification of the anatomic snuffbox as the point of maximal tenderness shows strong clinical awareness of the scaphoid differential."
*Anatomical snuffbox tenderness is the cardinal sign of scaphoid fracture, not Colles' fracture — Colles' fracture produces maximal tenderness over the distal radius dorsally, not the snuffbox. The patient's response should describe dorsal wrist / distal radius tenderness as the point of maximal tenderness; the current response would appropriately raise scaphoid fracture as the leading diagnosis and should either be corrected in the patient dialogue or used to teach that the X-ray finding then resolves the ambiguity. The grading feedback praising the student for 'identifying snuffbox tenderness' for a Colles' fracture compoundly reinforces an anatomically incorrect association.*

**f-023** [medium] Grading credits student for hand X-ray ordering but student explicitly did NOT order it — _case-12 (Trauma Foundations)_
> testsOrdered: ["X-Ray Right Wrist (PA and Lateral)"] vs. grading testOrdering feedback: "Appropriate core imaging was ordered (PA and lateral wrist X-rays plus hand X-rays to rule out scaphoid fracture)"
*The student ordered only the wrist X-ray and explicitly noted 'I skipped the hand X-ray because the pain is localized to the wrist,' yet the grading feedback states hand X-rays were ordered — this is a factual grading error. The feedback should acknowledge that the hand X-ray was not ordered and note this as a minor gap (scaphoid series or hand film would strengthen scaphoid exclusion), or the scoring should reflect the omission rather than crediting an unordered test.*

**f-027** [low] Teaching point cites DSM-5 '6 criteria' but lists only 6 with worthlessness absent from symptom count — _case-10 (Psychiatric Foundations)_
> Teaching point: "this patient meets 6 criteria (depressed mood, anhedonia, sleep disturbance, weight loss/appetite change, fatigue, and difficulty concentrating)" vs. HPI: "feelings of worthlessness" and hiddenHistory: "feelings of worthlessness"
*Worthlessness is explicitly mentioned in both the HPI and hiddenHistory, making it a 7th qualifying criterion — the teaching point should state the patient meets 7 of 9 DSM-5 criteria to accurately model symptom counting, which is a core learning objective at the Foundations level.*

**f-034** [high] Student submitted SAH diagnosis but grading marks test ordering near-complete despite missing MRI — _case-15 (Neurologic, Clinical)_
> testsOrdered: ["CT Head (Non-Contrast)", "Cerebrospinal Fluid (CSF) Analysis", "CBC", "BMP", "Coagulation Panel", "Blood Culture x2"] ... testOrdering score: 17 ... "The ordered set ... represents a complete and appropriate workup" — yet availableImaging includes "MRI Brain with and without Contrast" which showed "diffuse leptomeningeal enhancement ... highly characteristic of bacterial (purulent) meningitis" and was not ordered.
*The test ordering feedback should note the absence of MRI Brain with contrast, which — had it been ordered — would have shown pathognomonic leptomeningeal enhancement and likely prompted correct diagnosis revision. Deduct points and explicitly flag the missed MRI in test ordering feedback to reinforce that contrast MRI is a key confirmatory tool when CT is negative and bacterial meningitis remains on the differential.*

**f-035** [medium] History score 14/20 awarded despite student missing 3 of 4 listed key questions — _case-15 (Neurologic, Clinical)_
> keyQuestions: ["Did the headache reach maximal intensity within seconds...", "Have you had any recent upper respiratory infection...", "Do you have any recent travel history, sick contacts, or crowded-living exposures?", "Are you up to date on vaccinations, particularly meningococcal vaccine?"] ... historyInterview score: 14 ... "you did not ask about vaccination history..., sick contacts or crowded exposures, or skin findings"
*The student asked only 2 of the 4 designated key questions yet received 14/20 (70%) on history. The feedback narrative and score are inconsistent — missing 3 of 4 key questions should yield a lower score (≤10/20) proportional to the gaps, especially since the missed questions (vaccination, sick contacts, skin findings) are directly relevant to the infectious diagnosis. Recalibrate the scoring rubric so that key question coverage is weighted proportionally.*

**f-036** [medium] Thoracentesis listed under availableImaging but not credited as a separate orderable test — _case-14 (Respiratory, Clinical)_
> "availableImaging": ["Chest X-Ray", "CT Chest with Contrast", "ECG", "Thoracentesis"] ... testOrdering feedback: "the only minor gap is the absence of a thoracentesis order (pleural fluid analysis), which would be the next critical step" ... student testsOrdered does not include Thoracentesis.
*Thoracentesis appears in the available imaging list as an orderable item, yet the student's test ordering feedback treats its absence only as a 'minor gap' rather than a significant omission given that the pleural fluid analysis results (pH 7.14, glucose 42, gram-positive diplococci) are what definitively distinguish empyema from simple parapneumonic effusion. Upgrade the gap severity in feedback to 'significant' and deduct commensurate points from the test ordering score (currently 19/20) to reflect that this was the management-altering procedural test.*

**f-037** [medium] Pleural fluid analysis results shown despite thoracentesis not being ordered by student — _case-14 (Respiratory, Clinical)_
> testsOrdered: ["CBC", "BMP", "Procalcitonin", "Blood Cultures", "Chest X-Ray", "CT Chest with Contrast", "D-Dimer"] — Thoracentesis/Pleural Fluid Analysis not listed. Yet labResults includes full "Pleural Fluid Analysis" with pH, glucose, LDH, gram stain results, and the student's reasoning references: "Pleural fluid analysis via thoracentesis is critical here — LDH, protein, glucose, pH, cell count, and cultures would help me distinguish transudative from exudative."
*If the student did not order Thoracentesis/Pleural Fluid Analysis, those results should not be surfaced — displaying unordered test results breaks the simulation fidelity and allows students to reason from data they did not clinically decide to obtain. Gate the pleural fluid results behind an explicit thoracentesis order, and require the student to order it to access this data.*

**f-039** [medium] History score 15/20 awarded despite missing 2 of 4 key questions per grader's own feedback — _case-13 (Cardiovascular, Clinical)_
> historyInterview score: 15 ... "you did not ask whether antacids or nitroglycerin provided relief — a key management-relevant question... and you did not ask about prior similar episodes or personal history of CAD/stents, missing two of the four key questions."
*Missing 2 of 4 key questions should yield approximately 50% credit on key-question coverage, yet the student received 15/20 (75%). The score and narrative are inconsistent. Reduce the history score to reflect proportional key-question coverage (e.g., 10–11/20) or explicitly document in the rubric that bonus credit for volunteered information (radiation, PE risk) offsets key-question misses — currently that logic is implicit and non-transparent to learners.*

**f-044** [medium] Teaching point states 'normal WBC' but CBC shows WBC 11.8 (elevated) — _case-16 (Gastrointestinal Clinical)_
> Teaching point: 'An atypical feature here is the low-grade fever and tachycardia without leukocytosis — early alcoholic pancreatitis may precede a robust inflammatory response, and a normal WBC does not exclude significant pancreatic injury.' vs. CBC result: { "name": "WBC", "value": "11.8", "unit": "x10³/µL", "referenceRange": "4.5-11.0", "status": "high" }
*Correct the teaching point to acknowledge that WBC is mildly elevated (11.8, above the 11.0 upper limit), not normal — the point about early pancreatitis preceding robust leukocytosis can be preserved by framing it as 'only mild leukocytosis despite significant pancreatic injury' rather than claiming WBC is normal.*

**f-045** [medium] Ranson criteria teaching point cites 'age >55' but patient is 52 — _case-16 (Gastrointestinal Clinical)_
> Teaching point: 'The Ranson criteria and BISAP score help stratify severity; this patient's tachycardia, elevated BUN, and age >55 warrant close monitoring for progression to necrotizing pancreatitis.' vs. patient info: { "age": 52 }
*Remove 'age >55' as a specific risk factor cited for this patient since he is 52 and does not meet that Ranson criterion; retain tachycardia and elevated BUN as the valid severity markers, and note that age is listed here for instructional contrast rather than as an applicable finding in this case.*

**f-047** [medium] Grading penalizes student for citing vitals but vitals are explicitly provided in caseData — _case-16 (Gastrointestinal Clinical)_
> Clinical reasoning feedback: 'the main gap is that you referenced systemic signs (fever, tachycardia, elevated RR) that were not documented in the available case data, which slightly undermines the evidence-linkage quality.' vs. caseData.vitals: { "bp": "118/74", "hr": 108, "rr": 20, "temp": 100.4, "spo2": 96 }
*Correct the grading feedback to acknowledge that fever (temp 100.4), tachycardia (HR 108), and elevated RR (20) are all explicitly present in the provided vitals — penalizing the student for accurately citing available case data is factually incorrect and actively misleading.*

**f-048** [medium] Grading penalizes student for citing vitals not in case data, but vitals ARE in caseData — _case-18 (Endocrine/Metabolic Clinical)_
> Clinical reasoning feedback: 'the reasoning referenced vital signs (HR 56, temp 97.1°F, BP 138/88) that were not part of the available case data — these should not be cited as supporting evidence unless they appear in the case record, and their inclusion introduces a minor fabrication concern.' vs. caseData.vitals: { "bp": "138/88", "hr": 56, "rr": 16, "temp": 97.1, "spo2": 98 }
*Correct the clinical reasoning feedback to confirm that HR 56, temp 97.1°F, and BP 138/88 are all explicitly documented in the case vitals — remove the 'minor fabrication concern' language entirely, as it incorrectly accuses the student of inventing data they legitimately read from the case.*

**f-051** [low] Renal ultrasound report states kidneys are 'enlarged' but finding labeled as consistent with 'chronic' nephropathy — _case-17 (Renal Clinical)_
> Imaging result: 'Bilateral kidneys are enlarged in size — right kidney measures 13.1 cm and left kidney measures 12.8 cm in long axis, with increased cortical echogenicity bilaterally consistent with diffuse parenchymal disease... Findings are consistent with chronic diabetic nephropathy in the appropriate clinical context.'
*Add a brief explanatory note clarifying that in diabetic nephropathy, kidneys may be enlarged in early-to-moderate disease due to hyperfiltration injury, which distinguishes it from most other causes of CKD where kidneys are small and echogenic — this contextual teaching moment is currently absent and students may find 'enlarged kidneys + chronic disease' counterintuitive without explanation.*

**f-052** [low] Patient already on lisinopril but teaching point presents ACE inhibitor as a new management recommendation — _case-17 (Renal Clinical)_
> Teaching point: 'Management pillars include aggressive BP control targeting <130/80 with ACE inhibitor or ARB (dual cardio-renoprotective benefit)...' vs. hiddenHistory.medications: 'Lisinopril 10mg daily (started 2 years ago, poorly adherent)'
*Update the teaching point to frame the ACE inhibitor recommendation as 'optimize and ensure adherence to existing ACE inhibitor therapy (lisinopril) and consider uptitration' rather than implying initiation, since the patient is already prescribed it — this also creates a natural teaching opportunity about adherence monitoring and dose optimization that the current framing misses.*

**f-058** [high] Student states 'elevated uric acid' but result is normal; grading does not flag this as an error — _case-21 (Musculoskeletal Clinical)_
> Student reasoning states: 'Elevated uric acid supports a gouty etiology' — the actual lab result is: 'Serum Uric Acid: value: 6.1, referenceRange: 3.5–7.2, status: normal'. The overall grading feedback states: 'Excellent diagnostic performance' and the testOrdering dimension gives a score of 20/20 with feedback: 'covering inflammatory markers, renal function, infection exclusion, and definitive crystal identification with no unnecessary or contraindicated tests' — no mention of the student's factually incorrect interpretation of the uric acid result.
*The grading engine must evaluate the student's interpretive statements against actual lab values and flag when a student explicitly misreads a result (calling a normal value 'elevated'); this is a patient-safety-relevant reasoning error — a student who believes elevated uric acid confirms gout may also incorrectly conclude a normal uric acid rules it out in future cases.*

**f-061** [medium] Flow cytometry reference range for CD19 is clinically inaccurate and internally inconsistent — _case-20 (Hematologic/Oncologic Clinical)_
> Flow cytometry result: 'CD19: value: Positive, referenceRange: Negative on mature lymphocytes in abnormal populations, status: abnormal'. CD19 is normally positive on all mature B lymphocytes — it is not negative on normal mature lymphocytes. The reference range description 'Negative on mature lymphocytes in abnormal populations' is internally contradictory and clinically incorrect.
*Correct the CD19 reference range to reflect that CD19 is normally expressed on B lymphocytes (i.e., 'Positive on normal B cells; abnormal finding is co-expression with CD5') and change the status flag logic — the abnormality in CLL is the aberrant co-expression of CD5 with CD19, not CD19 positivity itself, which is expected; the current framing would confuse students learning B-cell immunophenotyping.*

**f-062** [medium] PSA teaching point contradicted by grading: ordered with 'appropriate self-awareness' despite no diagnostic value — _case-19 (Infectious Clinical)_
> Student notes: 'I'm a little uncertain about the PSA — I ordered it because it was available, but now I'm second-guessing myself since it'll definitely be elevated in prostatitis and might just confuse the picture.' Grading testOrdering feedback: 'the PSA was ordered with appropriate self-awareness that it would be non-specifically elevated, which reflects sound test-utilization reasoning.' However, teaching point 2 states: 'urine culture and blood cultures should always be obtained before starting antibiotics' — PSA in acute prostatitis is a known confounder for prostate cancer screening and current guidelines (AUA) advise against checking PSA during acute prostatitis precisely because it will be non-specifically elevated and can lead to unnecessary cancer workup.
*The grading should flag PSA ordering in acute bacterial prostatitis as a test-utilization concern rather than praising it — the student's own self-doubt was clinically correct, and validating the PSA order as 'sound test-utilization reasoning' teaches the opposite of good stewardship; add a teaching note that PSA should not be checked during acute prostatitis and that any elevated result must be rechecked 4–6 weeks after treatment resolution.*

**f-063** [medium] historyInterview score of 15 internally inconsistent with two missed key questions — _case-19 (Infectious Clinical)_
> historyInterview feedback: 'you did not directly ask about recent urologic procedures or catheterization... or about diabetes/immunosuppression... both of these are key questions per this case's rubric that were not surfaced in any form during the interview.' Score given: 15. missedQuestions lists both items. Yet testOrdering score is 19/20 and the overall score is 91/100.
*Clarify the historyInterview scoring rubric — if 2 of 4 key questions were missed entirely, a score of 15 (which appears to be out of ~20 based on the dimension weights implied by the total) should reflect that gap more clearly; either show the maximum possible points per dimension or explain that 15 represents a partial-credit calculation, so students understand the deduction logic rather than seeing a high score after reading about two missed critical items.*

### Medical Inaccuracy (23)

**f-003** [medium] Amoxicillin-EBV rash described as 'pathognomonic' — overstated specificity — _case-7 (Infectious Foundations)_
> "the amoxicillin-associated maculopapular rash is essentially pathognomonic for EBV mono"
*The amoxicillin/ampicillin rash is highly characteristic but not pathognomonic — it also occurs in CMV mononucleosis and other viral syndromes with aminopenicillins, and 'pathognomonic' implies 100% specificity which is clinically incorrect; replace with 'highly characteristic' or 'strongly suggestive' to avoid instilling false certainty in learners.*

**f-004** [medium] EBV-amoxicillin rash mechanism stated as 'immune complex-mediated' — disputed/inaccurate — _case-7 (Infectious Foundations)_
> "the mechanism is immune complex-mediated rather than IgE-mediated"
*The exact mechanism of the amoxicillin rash in EBV remains incompletely understood; current evidence points to a T-cell–mediated (pharmacological interaction with immune receptors, p-i concept) or non-specific immune activation mechanism rather than classical immune complex (Type III) hypersensitivity — stating 'immune complex-mediated' as fact teaches a contested and likely incorrect mechanism that could mislead pharmacology reasoning.*

**f-005** [low] Monospot sensitivity range understated for first week of illness — _case-7 (Infectious Foundations)_
> "has variable sensitivity early in illness (as low as 70-80% in the first week)"
*Published sensitivity of the Monospot in the first week of EBV illness is reported as low as 25–50% (not 70–80%), with sensitivity rising to ~85–90% by weeks 2–3; stating 70–80% for week one significantly underrepresents the false-negative risk and could lead students to over-rely on a negative result early in illness.*

**f-006** [high] SCD case: MCV 79 fL labeled low — inconsistent with classic HbSS MCV — _case-8 (Hematologic/Oncologic Foundations)_
> "MCV": "79", "unit": "fL", "referenceRange": "80-100", "status": "low"
*Classic uncomplicated HbSS sickle cell disease typically has a normal or mildly elevated MCV (not microcytic), because the compensatory reticulocytosis raises MCV; a low MCV of 79 fL would suggest co-existing iron deficiency or alpha-thalassemia trait and should either be explained in the case narrative or corrected to a normal value (e.g., 86–92 fL) to avoid teaching that microcytosis is expected in isolated HbSS.*

**f-007** [medium] HbF 6% flagged 'high' but is expected/therapeutic in untreated HbSS — _case-8 (Hematologic/Oncologic Foundations)_
> "HbF": "6", "unit": "%", "referenceRange": "< 2", "status": "high"
*In adults with HbSS not on hydroxyurea, HbF of 4–8% is a recognized endogenous compensatory finding and is prognostically favorable; flagging it as 'high' with a reference range of <2% (appropriate only for normal adults without hemoglobinopathy) teaches students that elevated HbF is pathological in SCD, which is the opposite of the clinical reality — add a case-specific note clarifying that elevated HbF is beneficial in HbSS.*

**f-008** [medium] Dark urine morning predominance attributed to SCD — suggests PNH pattern, not SCD — _case-8 (Hematologic/Oncologic Foundations)_
> "the dark urine does seem worse in the mornings when I first wake up"
*Dark urine that is worst in the morning (due to nocturnal complement activation during sleep apnea/relative acidosis) is a classic hallmark of Paroxysmal Nocturnal Hemoglobinuria (PNH), not sickle cell disease — this response incorrectly teaches a PNH-specific clinical pearl as applicable to SCD and should be corrected to avoid cross-diagnosis confusion; in SCD, hemoglobinuria/urobilinogenuria does not follow a morning-predominant circadian pattern.*

**f-013** [medium] Teaching point states Lachman test sensitivity ~85% — accepted but context missing — _case-9 (Musculoskeletal Foundations)_
> "The Lachman test (anterior tibial translation at 20-30° flexion) is the most sensitive physical exam maneuver for ACL tear (~85% sensitivity), more sensitive than the anterior drawer test or pivot shift test in the acute setting."
*The 85% figure is a reasonable pooled estimate but published meta-analyses report a wide range (72–99%) depending on examiner experience, patient guarding, and acuity of injury — adding a brief qualifier such as 'in experienced hands' or noting that sensitivity drops significantly in the acute painful/swollen knee would provide more clinically accurate and actionable context for learners at Foundations level.*

**f-018** [high] Rumack-Matthew nomogram threshold values are incorrect — _case-11 (Toxicologic Foundations)_
> "treatment line threshold is ~150 mcg/mL at 4h, ~75 mcg/mL at 8h (Rumack-Matthew nomogram)"
*The correct Rumack-Matthew treatment line threshold is 150 mcg/mL at 4 hours and approximately 37.5 mcg/mL at 12 hours (the line drops by half every 4 hours on a semi-log scale); the stated 75 mcg/mL at 8 hours understates the threshold by roughly half (correct value ≈ 75 mcg/mL is actually the value at approximately 8 hours on a log scale — but this needs to be verified against the published nomogram axes, and the reference range field should cite the exact FDA-recognized treatment line, not an approximation). Update the reference range text to cite the validated treatment-line values at standard time points (4h: 150 mcg/mL, 8h: 75 mcg/mL, 12h: 37.5 mcg/mL) and clarify these are interpolated values on the 150-line, so the 8h value of 75 is actually correct — the real error is that the lab result field (not a proper teaching reference) is the only place this critical pharmacokinetic information appears, making it easily missed and unverifiable by learners without a separate nomogram.*

**f-019** [high] Urine drug screen lists acetaminophen as a screened analyte — standard UDS panels do not include acetaminophen — _case-11 (Toxicologic Foundations)_
> "Acetaminophen (urine screen)": "value": "Positive", "referenceRange": "Negative", "status": "abnormal"
*Standard immunoassay urine drug screens (UDS) do not include acetaminophen; acetaminophen toxicity is diagnosed by serum acetaminophen level, not urine screening. Remove the acetaminophen component from the urine drug screen panel and add a teaching note that serum quantitative acetaminophen level (already ordered separately) is the correct test — presenting a false 'urine acetaminophen screen' as a valid result teaches students an incorrect diagnostic workflow.*

**f-020** [medium] LFT elevations at 6 hours post-ingestion are inconsistent with known APAP toxicity timeline — _case-11 (Toxicologic Foundations)_
> "AST": "value": "58", "status": "high" and "ALT": "value": "72", "status": "high" alongside teaching point: "Early acetaminophen toxicity (0-24 hours) may present with only mild nausea and vomiting — LFT elevations (AST/ALT) typically appear in Phase II (24-72 hours)"
*The case's own teaching point states LFT elevations typically appear in Phase II (24–72 hours), yet the lab results show AST and ALT already elevated at 6 hours post-ingestion — this directly contradicts the stated pharmacotoxicology. Either set the LFTs as normal (more accurate for Phase I) to reinforce the teaching point, or if mildly elevated values are retained, add an explicit explanation that very early mild transaminase rises can occur with large ingestions but are not the expected pattern, so students are not misled.*

**f-024** [medium] HPI states patient denies numbness/tingling, but hidden history reveals paresthesias are present — _case-12 (Trauma Foundations)_
> HPI: "He denies numbness or tingling in the fingers" vs. hiddenHistory hiddenSymptoms: "patient will confirm mild paresthesias in the thumb and index finger that began shortly after the fall, suggesting possible median nerve stretch injury"
*Presenting the HPI as denying paresthesias while the actual symptom is present (gated only behind a specific question) creates a misleading baseline — the HPI should state the initial screen was negative but direct questioning revealed paresthesias, or rephrase to 'he does not volunteer numbness but has not been specifically asked,' so students understand the HPI reflects initial triage rather than a complete negative finding.*

**f-030** [high] Bacterial meningitis case temp 99.8°F conflicts with classic triad teaching — _case-15 (Neurologic, Clinical)_
> "temp": 99.8" (vitals) alongside teaching point: "The classic triad of bacterial meningitis — fever, neck stiffness, and altered mental status — is present in only ~44% of patients"
*For pneumococcal meningitis with 4200 CSF WBC, gram-positive diplococci, and bacteremia, a temperature of 99.8°F (37.7°C) is clinically implausible — nearly all culture-proven bacterial meningitis cases present with frank fever (≥38.3°C / ≥101°F). Raise the temperature to 102–104°F to reflect realistic bacteremic pneumococcal disease, or explicitly flag in the HPI that antipyretics were taken pre-arrival to explain the low-grade reading.*

**f-031** [high] CSF RBC labelled 'normal' at 8 cells/µL in SAH vs meningitis differential — _case-15 (Neurologic, Clinical)_
> "name": "RBC", "value": "8", "unit": "cells/µL", "referenceRange": "0-5", "status": "normal"
*A CSF RBC of 8 cells/µL exceeds the stated reference range of 0–5 and should be flagged as 'abnormal' (or at minimum 'high'), not 'normal.' This is also a teaching-critical data point in the SAH vs meningitis differential — mislabelling it as normal is both factually wrong and pedagogically harmful since students are explicitly taught to compare RBC counts across CSF tubes to distinguish traumatic tap from SAH.*

**f-032** [medium] Petechial rash described as 'atypical for pneumococcal' — this framing is misleading — _case-15 (Neurologic, Clinical)_
> "also confirms a petechial rash on lower extremities noted this morning if asked about skin findings — atypical for pneumococcal but present, adding diagnostic complexity"
*A petechial or purpuric rash is the hallmark of meningococcal meningitis (N. meningitidis), not pneumococcal — labelling it as merely 'atypical for pneumococcal but present' without clarifying this distinction actively misleads learners. Either remove the rash from this pneumococcal case, replace it with a rash description more consistent with pneumococcal disease (none expected), or — if retained for complexity — explicitly state in the teaching points that a petechial rash should immediately raise suspicion for N. meningitidis and prompt empiric coverage adjustment.*

**f-033** [medium] Teaching point on LP delay threshold omits immunocompromise nuance incompletely — _case-15 (Neurologic, Clinical)_
> "Lumbar puncture is the gold standard for diagnosis of meningitis and should not be delayed by CT if there are no focal neurologic deficits, papilledema, or immunocompromised state — empiric antibiotics (ceftriaxone + vancomycin + dexamethasone) should be started immediately before or at the time of LP if CT is required first."
*Per IDSA guidelines, the CT-first indications also include new-onset seizures and age >60 — the current teaching point omits these, which is a meaningful gap for a 58-year-old patient near that age threshold. Add 'new-onset seizure, or age ≥60' to the list of CT-first indications to fully reflect current guideline criteria.*

**f-038** [medium] Light's criteria LDH threshold stated incorrectly in teaching point — _case-14 (Respiratory, Clinical)_
> "Light's criteria on thoracentesis (exudate: protein ratio >0.5, LDH ratio >0.6, or absolute LDH >2/3 upper limit)"
*Light's criteria require ANY ONE of three criteria: pleural fluid protein/serum protein >0.5, pleural fluid LDH/serum LDH >0.6, OR pleural fluid LDH >2/3 the upper limit of normal for serum LDH — the teaching point omits the word 'serum' before 'LDH' in the third criterion and compresses the three criteria in a way that could confuse learners into thinking all three must be met simultaneously. Rewrite as: 'exudate if ANY ONE of: pleural/serum protein ratio >0.5, pleural/serum LDH ratio >0.6, or pleural LDH >2/3 upper limit of normal serum LDH.'*

**f-046** [high] Triglycerides 310 mg/dL presented as incidental finding but meets threshold for hypertriglyceridemic pancreatitis — _case-16 (Gastrointestinal Clinical)_
> Lab result: { "name": "Triglycerides", "value": "310", "unit": "mg/dL", "referenceRange": "<150", "status": "high" }. No teaching point or differential addresses triglyceride-induced pancreatitis, and the case is framed unambiguously as alcoholic. The grading feedback states: 'the only minor omission is not ordering a urine amylase or HbA1c' with no mention of the ambiguous triglyceride level.
*Add a teaching point explicitly noting that triglycerides of 310 mg/dL are elevated but below the ~500–1000 mg/dL threshold typically required to cause hypertriglyceridemic pancreatitis, thereby teaching students why alcohol remains the leading etiology here while modeling the reasoning needed to dismiss this differential — without this clarification, students are left with an unresolved ambiguity that could lead to incorrect etiologic attribution.*

**f-049** [medium] Teaching point states full replacement levothyroxine dose for 'young healthy adults' but case patient is 52 — _case-18 (Endocrine/Metabolic Clinical)_
> Teaching point: 'Levothyroxine is initiated at full replacement dose (1.6 mcg/kg/day) in young healthy adults, but in older patients or those with cardiac disease, start low (25–50 mcg/day) and titrate every 6–8 weeks based on TSH; goal TSH is 0.5–2.5 mIU/L for most patients.'
*Add explicit guidance that this 52-year-old patient with a TSH of 48.2, bradycardia, and borderline cardiomegaly on CXR falls into the 'older/cardiac risk' category requiring low-dose initiation — as written, the teaching point presents both options without anchoring the learner to the correct choice for the actual patient in front of them.*

**f-050** [medium] TSH >10 threshold to distinguish hypothyroidism from depression cited incorrectly as definitive — _case-18 (Endocrine/Metabolic Clinical)_
> Teaching point: 'A markedly elevated TSH (>10 mIU/L) with a low free T4 definitively confirms primary hypothyroidism and distinguishes it from the low-normal thyroid function sometimes seen in major depression or euthyroid sick syndrome, where TSH rarely exceeds 10 mIU/L.'
*Clarify that TSH >10 with low free T4 confirms overt primary hypothyroidism, but the contrast with euthyroid sick syndrome is imprecise — euthyroid sick syndrome (non-thyroidal illness) typically presents with low T3, low-normal or low T4, and low or low-normal (not elevated) TSH, which is a fundamentally different pattern; revise to avoid implying TSH elevation is the distinguishing feature between depression and euthyroid sick syndrome.*

**f-057** [medium] Normal uric acid mislabeled as supporting gouty etiology in reasoning feedback — _case-21 (Musculoskeletal Clinical)_
> Student reasoning: 'Elevated uric acid supports a gouty etiology' — but the lab result shows: 'Serum Uric Acid: 6.1 mg/dL, referenceRange: 3.5–7.2, status: normal'. The grading feedback penalizes the student for not connecting this: 'you did not link the paradoxically normal serum uric acid (6.1 mg/dL) to the known phenomenon of urate redistribution during acute flares'
*The grading system correctly identifies the student's error in the clinicalReasoning feedback, but the student's reasoning section itself states 'Elevated uric acid supports a gouty etiology' without any correction or flag in the overall feedback summary — the top-level feedback should explicitly note this factual error in the student's reasoning, since a normal uric acid during an acute flare is a core teaching point (already listed in teachingPoints) and the student's written reasoning directly contradicts it.*

**f-059** [medium] Rai staging explanation conflates AIHA-driven anemia with Rai III criteria without caveat — _case-20 (Hematologic/Oncologic Clinical)_
> Teaching point states: 'This patient's anemia from AIHA places him at least at Rai stage III, warranting treatment consideration rather than watch-and-wait.' Rai stage III requires Hgb <11 g/dL, which this patient meets (Hgb 8.4); however, the Rai staging system was developed for anemia from marrow infiltration/failure — AIHA-driven anemia in CLL is a separate treatment indication but does not automatically satisfy the Rai III marrow-failure criterion per current CLL staging conventions (iwCLL 2018 guidelines distinguish immune cytopenias from disease-related cytopenias for staging purposes).
*Revise the teaching point to clarify that AIHA in CLL is independently an indication for treatment (via steroids, rituximab, etc.) regardless of Rai stage, but that Rai staging ideally uses cytopenias attributable to marrow infiltration rather than autoimmune destruction — the current wording teaches an inaccurate conflation that could mislead students on CLL staging examinations.*

**f-060** [low] MCV of 101 fL unexplained and potentially misleading in CLL/AIHA context — _case-20 (Hematologic/Oncologic Clinical)_
> CBC result: 'MCV: 101, unit: fL, referenceRange: 80–100, status: high'. No explanation is provided anywhere in the case data, teaching points, or grading feedback for the elevated MCV.
*Add a brief note in the teaching points or case data acknowledging the mildly elevated MCV — in CLL with AIHA, macrocytosis can occur due to reticulocytosis (reticulocytes are large cells, pushing MCV up), which is physiologically consistent with this case and should be taught explicitly; without explanation, students may incorrectly attribute the macrocytosis to B12/folate deficiency or another cause and order unnecessary additional tests.*

**f-067** [low] Teaching point implies allopurinol is only urate-lowering therapy; febuxostat omitted — _case-21 (Musculoskeletal Clinical)_
> Teaching point 5: 'Urate-lowering therapy (e.g., allopurinol) should NOT be initiated during an acute flare, as rapid changes in serum urate can prolong or precipitate attacks; treat the acute flare first with NSAIDs, colchicine, or corticosteroids.'
*Revise to read 'Urate-lowering therapy (e.g., allopurinol or febuxostat)' to reflect that febuxostat is a guideline-recommended alternative xanthine oxidase inhibitor, particularly relevant in patients with allopurinol hypersensitivity or renal impairment — this patient already has a creatinine of 1.3 mg/dL (mildly elevated), making the omission of febuxostat as an option a minor but teachable gap.*

### Improvement (15)

**f-014** [medium] No physical examination data provided — limits ACL diagnostic reasoning — _case-9 (Musculoskeletal Foundations)_
> Student notes: "I'd want to discuss with the attending what the physical exam findings (Lachman test, anterior drawer sign, McMurray's) would add before imaging, since I know those are really important for this diagnosis and I haven't been shown any physical exam data yet."
*ACL diagnosis at the Foundations level should include at minimum a structured physical exam results panel (Lachman, anterior drawer, pivot shift, McMurray's) as findings — omitting physical exam data forces students to rely entirely on imaging and deprives them of the core clinical skill that the teaching points themselves emphasize, undermining the educational objective of this case.*

**f-015** [medium] Case labels this a 'Hemolytic Crisis' but presentation lacks defining crisis features — _case-8 (Hematologic/Oncologic Foundations)_
> "correctDiagnosis": "Sickle Cell Disease (Hemolytic Crisis)" vs. HPI: "symptoms began gradually without a clear precipitant" and vitals: temp 98.8, HR 102, SpO2 99%
*A 'hemolytic crisis' (also called hyperhemolytic crisis) in SCD implies acute, accelerated red cell destruction beyond baseline, often with a precipitant, rapid Hgb drop, and systemic instability — the gradual 2-week onset without precipitant, near-normal vitals, and no acute exacerbation language better describe 'SCD with chronic hemolysis' or a 'new SCD diagnosis presenting with hemolytic anemia'; either update the label to reflect the clinical picture or add explicit HPI language that supports the acute crisis framing (e.g., recent infection, rapid Hgb fall from a known baseline).*

**f-016** [low] Grading feedback mentions 'rash timeline' as missed but student reasoning addresses it — _case-7 (Infectious Foundations)_
> Grading missedQuestions: "Did your rash appear before or after you started the amoxicillin? (The timing is pathognomonic...)" vs. student reasoning: "the amoxicillin-associated maculopapular rash is essentially pathognomonic for EBV mono — this reaction occurs in about 80-90% of mono patients given aminopenicillins"
*The student clearly articulated the amoxicillin-rash timing relationship in their reasoning, demonstrating understanding of the concept even without asking the explicit question — the missed-question feedback should differentiate between 'did not ask' (interview gap) and 'did not demonstrate understanding' (knowledge gap) to provide learners with more accurate and fair formative feedback.*

**f-025** [medium] Passive suicidal ideation present in hidden history but graded as simply 'not asked' — safety-critical nuance lost — _case-10 (Psychiatric Foundations)_
> hiddenHistory: "He explicitly denies current suicidal ideation but admits to passive thoughts that 'life feels pointless' which he has not acted upon." Grading missedQuestions: "Do you have any thoughts of suicide, self-harm, or feelings that life is not worth living? (Safety-critical; directly impacts management)"
*The hidden history reveals a clinically meaningful distinction — the patient has passive suicidal ideation ('life feels pointless') that would be disclosed with direct questioning, which is safety-critical and changes management (Columbia Suicide Severity Rating Scale, safety planning). The grading feedback should explicitly state that direct questioning would have revealed passive SI, not merely that the question was missed, so students learn that indirect denial is insufficient for suicide risk assessment in depression.*

**f-026** [medium] NAC treatment decision taught as 'pending nomogram' but nomogram-qualifying level already returned — missed active teaching moment — _case-11 (Toxicologic Foundations)_
> Student reasoning: "The acetaminophen level drawn at or after 4 hours post-ingestion will be plotted on the Rumack-Matthew nomogram to determine whether he falls in the treatment zone for NAC." Acetaminophen level result: "210 mcg/mL" at 6 hours, labeled "HIGH RISK treatment zone."
*The lab result confirms the level is above the treatment line at 6 hours, yet the grading does not prompt the student to explicitly state that NAC should be started now — this is the single most time-sensitive management decision in the case. The grading feedback should include a missed action item noting that with a level of 210 mcg/mL at 6 hours clearly above the nomogram treatment line, the student should have explicitly stated NAC initiation rather than leaving it 'pending,' since delay beyond 8 hours significantly worsens outcomes.*

**f-028** [low] All three cases share the same patient name 'Dmitri Voloshyn' across unrelated presentations — _case-10 (Psychiatric Foundations)_
> case-10 patientInfo.name: "Dmitri Voloshyn", case-11 patientInfo.name: "Dmitri Voloshyn", case-12 patientInfo.name: "Dmitri Voloshyn"
*Reusing an identical patient name across three unrelated cases (psychiatric, toxicologic, trauma) with different ages (27, 19, 28) risks cognitive confusion and breaks immersion for learners who review multiple cases in sequence; assign distinct patient names for each case to maintain realistic case independence.*

**f-040** [medium] Lipid panel results available at Hour 0 of NSTEMI — clinically unrealistic timing — _case-13 (Cardiovascular, Clinical)_
> "availableLabs": [..."Lipid Panel"...] — returned with LDL 162, HDL 36, Total Cholesterol 238, Triglycerides 198. Student notes: 'I ordered a full lipid panel out of habit but honestly that's not going to change my acute management at all.'
*Lipid panels drawn during acute MI are affected by the acute-phase response and are unreliable (LDL is artifactually lowered within 24–48 hours of an MI); returning a lipid panel as a valid, actionable result in the acute NSTEMI setting teaches students incorrect clinical practice. The grader should flag this explicitly as a teaching point — either block the lipid panel from the acute NSTEMI order set or return a result note stating 'Lipid levels drawn acutely may not reflect true fasting baseline; recommend repeat fasting panel in 4–6 weeks' to model real-world clinical nuance.*

**f-041** [medium] Student anchored on SAH despite non-thunderclap onset — no remediation pathway offered — _case-15 (Neurologic, Clinical)_
> workingDiagnosis: "Subarachnoid Hemorrhage (SAH) — though bacterial meningitis is high on my differential too" ... patient response: "over maybe ten or fifteen minutes it just got worse and worse" ... grading feedback: "the student anchored on onset character and did not revise the diagnosis after reviewing the confirmatory test data"
*The grading feedback correctly identifies anchoring bias but offers no structured remediation — it only says 'prioritize integrating your LP results.' Add a targeted teaching intervention: explicitly walk the student through the decision pivot (CT negative → LP showed turbid CSF with 4200 WBC, 92% neutrophils, glucose 28, gram-positive diplococci → diagnosis must be revised to bacterial meningitis), and link to the teaching point on CSF interpretation to close the learning loop and prevent this anchoring pattern in future cases.*

**f-042** [low] D-Dimer elevated at 1.2 µg/mL FEU without explicit CT-PA correlation in feedback — _case-14 (Respiratory, Clinical)_
> "D-Dimer": {"value": "1.2", "unit": "µg/mL FEU", "referenceRange": "<0.50", "status": "high"} ... CT Chest with Contrast: "No filling defects identified in the pulmonary arteries to suggest pulmonary embolism."
*The student used D-dimer to screen for PE, it returned elevated (2.4× the upper limit), and the CT-PA was negative — but neither the grading feedback nor teaching points explain why D-dimer can be elevated in pneumonia/sepsis (inflammatory state, fibrinolysis) independent of PE. Adding a brief teaching note that D-dimer has low specificity in the setting of active infection/inflammation would reinforce appropriate clinical interpretation and prevent learners from over-relying on D-dimer in infected patients.*

**f-053** [medium] No serology for secondary causes of nephrotic syndrome available despite teaching point raising this concern — _case-17 (Renal Clinical)_
> Teaching point: 'In diabetic patients with atypical presentation (absence of retinopathy, rapid decline in GFR, active urine sediment), kidney biopsy should be strongly considered.' vs. availableLabs: [ "CBC", "Comprehensive Metabolic Panel (CMP)", "Lipid Panel", "Urinalysis with Microscopy", "Urine Albumin-to-Creatinine Ratio (UACR)", "Hemoglobin A1c" ]
*Add ANA, anti-dsDNA, complement levels (C3/C4), SPEP, hepatitis B/C serologies, or anti-PLA2R to the available labs panel so students can actively work through the secondary nephrotic syndrome differential the teaching point explicitly raises — currently the case teaches a concept (exclude secondary causes) but does not provide the tools to practice that reasoning.*

**f-054** [medium] CT Severity Index 3 (Grade C) reported but CTSI scoring methodology not explained in teaching points — _case-16 (Gastrointestinal Clinical)_
> CT result: 'CT Severity Index: 3 (Grade C, no necrosis). Findings are diagnostic of acute interstitial pancreatitis.' Teaching points reference BISAP and Ranson criteria but not CTSI.
*Add a brief teaching point explaining the CTSI scoring system (Balthazar grading A–E plus necrosis score, total 0–10) and interpreting this patient's score of 3 as mild severity, to bridge the gap between the imaging result and the severity-scoring content — students who see a CTSI score without context cannot apply it clinically.*

**f-055** [low] Macrocytic anemia present but B12/folate not available to order, limiting differential workup — _case-18 (Endocrine/Metabolic Clinical)_
> CBC result: { "name": "MCV", "value": "102", "unit": "fL", "referenceRange": "80–100", "status": "high" }. hematologyFindings: 'Peripheral smear shows macrocytic red blood cells without hypersegmented neutrophils, suggesting hypothyroid-related macrocytosis rather than megaloblastic anemia.' availableLabs: [ "CBC", "CMP", "Thyroid Function Panel", "Thyroid Antibodies", "Lipid Panel" ]
*Add B12 and folate to the available labs so students can practice ordering them to exclude megaloblastic anemia as a cause of macrocytosis — the peripheral smear result already resolves the ambiguity for the student who orders it, but students who reason correctly about MCV 102 and attempt to order B12 should not find it unavailable.*

**f-064** [medium] DRE findings described in hidden history but never surfaced or graded — _case-19 (Infectious Clinical)_
> hiddenHistory fullHistory: 'Exam reveals an exquisitely tender, swollen, warm prostate on digital rectal exam; massage was not performed due to risk of bacteremia.' This finding is never presented to the student in any examination module, and the grading does not assess whether the student requested or interpreted a physical exam.
*Add a physical examination interaction step where students can request specific exam components (e.g., 'Perform digital rectal exam'); the DRE in acute bacterial prostatitis — specifically eliciting extreme prostatic tenderness and noting that vigorous massage is contraindicated — is a defining clinical skill for this diagnosis and its omission from the interactive case removes a high-yield teaching moment that the platform's own teaching points explicitly call out.*

**f-065** [medium] Hidden tophus finding never discoverable by student; clinically significant for staging — _case-21 (Musculoskeletal Clinical)_
> hiddenSymptoms: 'Patient admits to noticing a firm, non-tender nodule over his right olecranon for the past 6 months that he ignored, consistent with a tophus.' The student never asked about this, it was never revealed, and the grading does not penalize its omission despite it being clinically significant (tophus = chronic tophaceous gout, changes classification and long-term management).
*Either add 'Have you noticed any firm lumps or nodules over your joints or tendons?' as a key question with associated grading weight, or have the patient spontaneously mention the olecranon nodule if the student asks about prior joint symptoms — the presence of a tophus would upgrade this case from acute gout to chronic tophaceous gout, meaningfully affecting urate-lowering therapy urgency, and students should be taught to look for tophi on exam.*

**f-066** [low] Working diagnosis 'Lymphoma' is inconsistent with student's submitted diagnosis of CLL — _case-20 (Hematologic/Oncologic Clinical)_
> workingDiagnosis: 'Lymphoma (most likely Non-Hodgkin Lymphoma, though Hodgkin's is possible given neck swelling)'. Final submitted diagnosis: 'Chronic Lymphocytic Leukemia (CLL), likely with autoimmune hemolytic anemia (AIHA) as a complication'.
*Display the working diagnosis evolution to the student in the feedback report to illustrate how diagnostic reasoning should shift as test results return — showing the contrast between an initial working diagnosis of NHL and the final confirmed CLL diagnosis (with the distinguishing role of flow cytometry and smear) would reinforce the iterative nature of clinical reasoning and the specific value of each test ordered.*

## Study-Tab Findings

### dashboard tab (8 findings)

**f-200** [high/inconsistency] Weekly goal counter shows 58 completed against a goal of 5
> <span class="dx-weekly-done" style="color:var(--green)">58</span><span class="dx-weekly-sep"> / <!-- -->5</span><span class="dx-weekly-label"> cases — goal met! 🎉</span>
*The displayed completion count of 58 is implausibly large relative to a weekly goal of 5 and is almost certainly a data binding error (e.g., cumulative all-time count rendered instead of the current-week count). Verify the data source feeding dx-weekly-done and scope it to the current ISO week.*

**f-201** [medium/inconsistency] Focus Areas card labels worst performers but top score drives recommendation
> Card header: "Focus areas" — entries: Hematologic / Oncologic 83%, Endocrine / Metabolic 85%, Neurologic 87%. Recommended next case eyebrow: "Recommended next case" → "Hematologic / Oncologic" with reason "Your Hematologic / Oncologic avg is 83."
*All three listed scores are in the green range (83–87%) and are framed as 'Focus areas', which implies weakness; simultaneously the system recommends the highest-listed score (83%) as the priority. The card title should be renamed to something like 'Recent systems' or the selection logic should surface genuinely low-performing areas, so learners are not misled about where improvement is actually needed.*

**f-202** [medium/inconsistency] Recent activity scores shown as green/passing despite large sub-score losses
> Row 1: overall score "90%" in green, yet "−31% Diagnosis Completeness"; Row 2: "93%" in green, yet "−17% History & Interview"; Row 4: "90%" in green, yet "−25% History & Interview"
*A −31 percentage-point sub-score loss on a single dimension (Diagnosis Completeness) is a clinically meaningful gap that is visually hidden by a green overall badge. Display sub-score losses in a warning color (amber/red) regardless of the total score so learners recognize specific deficits that need attention.*

**f-203** [medium/bug] Onboarding modal blocks dashboard on every load for an existing user
> <div class="dx-modal-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to MedTrainer"> ... <h2 class="dx-onboarding-step-title">Interview your patient</h2>
*The welcome/onboarding modal is rendered unconditionally in the HTML snapshot for a user ('audit') who already has 8-day streak, 58 completed cases, and recent activity — they are clearly not a new user. Persist a 'onboarding_completed' flag (localStorage or user record) and suppress the modal after first dismissal.*

**f-204** [medium/improvement] Recommended next case rationale is too thin to drive deliberate practice
> "Your Hematologic / Oncologic avg is 83."
*83% in a system that the platform labels a 'Focus area' gives learners no actionable context — they do not know whether that reflects recent improvement, a plateau, or a specific sub-competency gap. Augment the reason with the specific weak dimension (e.g., 'Your Diagnosis Completeness sub-score in Hem/Onc cases is 61% — below your 80% target') to promote targeted self-study.*

**f-205** [low/improvement] Streak counter lacks context about what constitutes a 'streak day'
> "🔥 <!-- -->8<!-- --> day<!-- -->s<!-- --> streak"
*The dashboard does not communicate whether a streak day requires completing ≥1 case, meeting the daily goal, or any other threshold; learners may inadvertently break their streak without understanding the rule. Add a tooltip or sub-label (e.g., '≥1 case/day') to clarify the definition.*

**f-206** [low/improvement] Recent activity limited to same-day (May 16) entries only — no historical breadth
> All five recent-activity rows show "<span class="dx-recent-date">May 16</span>" with no earlier dates visible.
*Showing only entries from a single date gives no longitudinal sense of learning trajectory. Display entries spanning at least the past 7 days (or visually indicate that all visible activity occurred today) so learners can judge consistency and pacing at a glance.*

**f-207** [low/bug] Streak label has spurious HTML comment nodes injected into the text
> "🔥 <!-- -->8<!-- --> day<!-- -->s<!-- --> streak"
*React comment nodes (<!-- -->) are leaking into the rendered streak string, fragmenting the text into separate DOM text nodes. Rewrite the JSX to use a single template literal or a wrapping <span> so the string renders as continuous text and is read correctly by screen readers.*

### focus tab (7 findings)

**f-209** [medium/bug] React SSR hydration mismatch on Focus page causes silent DOM desync
> "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up." ... color: "#b43b3b" vs color: "rgb(180, 59, 59)" ... fontFamily: "JetBrains Mono, monospace" vs font-family: "\"JetBrains Mono\", monospace"
*Avoid computing style objects with inline JS values (color hex strings, font shorthand) that differ between SSR and client; instead use CSS custom properties or className-based theming so server and client produce identical attribute strings.*
File: `app/focus/page.tsx`

**f-210** [medium/bug] Score bar for one topic renders at 0% width despite non-zero score color
> width: "0%" ... background: "#2d7a4a" (green / LOW-priority color) — the progress bar fill is zero while the surrounding row uses the green 'confirmed' color scheme, implying a mastered topic has no visible progress fill
*Audit the width calculation for the LOW-severity topic bar; if score is ≥ 84 (as seen for other LOW rows) the bar width must reflect that value, not 0%. Likely a divide-by-wrong-max or missing data mapping bug.*
File: `app/focus/page.tsx`

**f-211** [medium/inconsistency] Duplicate score '68' shown for two different topics, both labeled MED / Clinical
> Two consecutive rows each render: color: "#b8862e" ... +   68 ... + MED ... + Clinical — identical score, priority badge, and category badge appear on two separate topic rows
*Verify whether these are genuinely distinct topics with the same score or a rendering loop bug that duplicates a single data record; deduplicate data source or add unique topic-name labels to confirm to the learner these are separate items.*
File: `app/focus/page.tsx`

**f-212** [medium/inconsistency] Difficulty tooltip describes 'Foundations' timer as 'no timer' but page UI shows no timer confirmation
> "Foundations — Common textbook diagnoses, classic presentations, no timer. Output: diagnosis only." vs Clinical level tooltip: "Clinical — Moderate diagnoses, 1-2 atypical features, 22-minute timer." — the sidebar nav case steps are all disabled (cursor-not-allowed) with no active case, so timer state cannot be verified
*Add a visible timer indicator (or explicit 'No Timer' label) to the case workspace header when Foundations mode is active so learners have in-session confirmation that matches the tooltip promise.*
File: `app/focus/page.tsx`

**f-213** [medium/improvement] All case workflow steps disabled before case generation, with no affordance explaining why
> "<button disabled="" class="... cursor-not-allowed text-ink-tertiary/50"><span>History of Present Illness</span></button>" — repeated for Review of Systems, Physical Examination, Order Tests, Test Results, Diagnosis — all six steps are disabled with no tooltip or locked-state label
*Add a tooltip or inline label (e.g., 'Generate a case to unlock') on hover of each disabled step so learners understand the pre-requisite action, reducing confusion about whether the feature is broken.*
File: `app/focus/page.tsx`

**f-214** [low/improvement] Focus page score list mixes 'Foundations' and 'Clinical' category labels with no legend or explanation
> Rows alternately show: + Foundations ... + Clinical — with no header, legend, or explanation of what these categories mean in the context of the focus/weakness list
*Add a brief section header or legend above the weakness list explaining that the category badge indicates the difficulty tier in which the gap was observed, so learners understand how to act on the information.*
File: `app/focus/page.tsx`

**f-215** [low/improvement] Score thresholds for HIGH/MED/LOW priority bands are not disclosed to the learner
> Scores 41, 48, 55 → HIGH badge; 68, 68, 73, 76 → MED badge; 84, 85, 89, 92 → LOW badge — the cutoff values (e.g., <68 = HIGH) are invisible to the user
*Display the scoring rubric (e.g., '<68 = High priority, 68–83 = Medium, ≥84 = Low') either in a tooltip on the badge or in a collapsible legend, so learners understand what score they need to achieve to reduce a HIGH priority item.*
File: `app/focus/page.tsx`

### help tab (9 findings)

**f-217** [high/inconsistency] Foundations rubric point totals do not sum to 100
> History & Interview /24 pts, Test Ordering /24 pts, Diagnosis Accuracy /36 pts, Diagnosis Completeness /16 pts — 24+24+36+16 = 100. Header reads '4 categories, 100 pts total'
*Verify the intended weights and confirm they actually sum to 100; currently the arithmetic is correct but should be programmatically asserted so any future edit cannot silently break the invariant.*
File: `app/help/page.tsx`

**f-218** [high/inconsistency] Clinical/Advanced rubric 5-category points sum to 100 but Efficiency note contradicts exclusion claim
> Rubric rows: History & Interview /20, Test Ordering /20, Diagnosis Accuracy /30, Diagnosis Completeness /15, Clinical Reasoning /15 — sums to 100. Then immediately below: 'Efficiency (/10, shown separately): ...Efficiency is displayed as a separate /10 indicator on the scorecard and is not included in the /100 score.' The header states '5 categories, 100 pts total' but Efficiency is described inline as though it is a sixth scoring element, creating ambiguity about whether the rubric has 5 or 6 scored dimensions.
*Either list Efficiency as a clearly separate, non-scoring indicator outside the rubric table, or update the header to say '5 scored categories + 1 efficiency indicator, 100 pts total' to eliminate learner confusion.*
File: `app/help/page.tsx`

**f-219** [medium/inconsistency] Diagnosis Completeness description contradicts itself across difficulty tiers
> Clinical/Advanced row reads: 'At Clinical, a correct core diagnosis earns 10–15. At Advanced, etiology, staging, or complication details are expected.' Both Clinical and Advanced share the same /15 dimension entry and the same rubric row, yet the text implies different scoring standards within that single row without separating them.
*Split the Clinical and Advanced difficulty tiers into distinct rubric sections (as is done for Foundations vs Clinical+Advanced) so each tier's Diagnosis Completeness expectation is unambiguous.*
File: `app/help/page.tsx`

**f-220** [high/medical_inaccuracy] STEMI/NSTEMI partial-credit cap uses wrong point fractions
> 'Submitting one when the other is correct caps Diagnosis Accuracy at approximately 44% of its dimension (16/36 at Foundations, 13/30 at Clinical/Advanced)'— 16/36 = 44.4% ✓, but 13/30 = 43.3%, not 44%. More critically, the clinical framing is the problem: STEMI vs NSTEMI is primarily distinguished by the presence or absence of ST-elevation on ECG, not merely 'ECG findings, cath-lab activation, and management.' Calling them non-equivalent is correct, but the scoring description implies a learner who writes 'STEMI' for an NSTEMI case has achieved 'right organ system, wrong pathological process' — which is pedagogically misleading because both are ACS/myocardial infarction (same pathological process: plaque rupture with thrombosis); the distinction is electrocardiographic pattern and reperfusion strategy, not a different pathological process.
*Clarify that STEMI vs NSTEMI represents a management-critical subtype distinction within the same pathological process (ACS), not a 'right organ system, wrong pathological process' error, and adjust the partial-credit rationale accordingly so learners understand why they lose points.*
File: `app/help/page.tsx`

**f-221** [medium/inconsistency] FAQ answer for partial credit contradicts the scoring rubric explanation
> FAQ states: 'If you named the correct pathological entity but omitted a qualifying modifier (e.g. "pneumothorax" instead of "spontaneous pneumothorax"), that's still marked correct.' But the scoring rubric states: 'Partial credit for the right organ system or syndrome with a meaningfully wrong pathological process.' The FAQ example ('pneumothorax' vs 'spontaneous pneumothorax') is actually a specificity/completeness issue, not a pathological-process error — yet the FAQ calls it 'correct' while the STEMI/NSTEMI FAQ implies a subtype error triggers a cap. There is no clear rule about when omitting a qualifier is 'still correct' vs. when it triggers a Diagnosis Completeness deduction.
*Add explicit criteria distinguishing (a) omitted qualifiers that do not affect management (marked correct), (b) omitted qualifiers that affect management/prognosis and incur Completeness deductions, and (c) wrong subtype selections that cap Accuracy — with one concrete example per category.*
File: `app/help/page.tsx`

**f-222** [medium/inconsistency] Free plan scorecard description inconsistent between Plans card and FAQ
> Plans card Free tier: 'Core scorecard (5 dimensions + score)'. FAQ answer: 'Free: 2 cases per day, core scorecard (dimensions + score)' — omits the '5'. Foundations cases have only 4 scoring dimensions; Clinical/Advanced have 5. Calling it uniformly '5 dimensions' for Free users who may only access Foundations cases is incorrect.
*State 'core scorecard (up to 5 dimensions depending on difficulty + total score)' in both locations, or link to the scoring rubric section for details.*
File: `app/help/page.tsx`

**f-223** [medium/improvement] Recommendation algorithm formula uses unexplained magic constant with no ceiling
> 'urgency = (100 − avg_score) × (1.2 if only 1 case, else 1.0)' — the formula is shown verbatim without explaining: (1) whether avg_score can be 0 (giving urgency = 120, above the stated 100-point scale), (2) why 1.2 specifically, (3) what happens when a system has never been attempted (avg_score undefined).
*Add a brief note clarifying the valid range of the urgency score, what happens for unattempted systems (e.g., treated as avg_score = 0 or excluded), and the rationale for the 1.2× factor so learners trust rather than question the algorithm.*
File: `app/help/page.tsx`

**f-224** [low/improvement] No anchor links between FAQ answers and relevant rubric sections
> FAQ item 'Why did I get partial credit for the right diagnosis?' answers inline but does not reference the 'Diagnosis Accuracy' or 'Diagnosis Completeness' rubric rows defined earlier on the same page. FAQ item 'How does the recommendation algorithm choose what to study?' restates the formula already shown in the algorithm card without linking to it.
*Add in-page anchor links (e.g., href='#scoring-rubric') from FAQ answers to the corresponding rubric sections so learners can navigate directly to the detailed explanation rather than re-reading duplicated content.*
File: `app/help/page.tsx`

**f-225** [low/improvement] Efficiency score visual position in the rubric is ambiguous for screen readers and learners
> 'Efficiency (/10, shown separately): At Clinical and Advanced difficulty, a timer tracks how quickly you complete the case. Efficiency is displayed as a separate /10 indicator on the scorecard and is not included in the /100 score.' This note appears inside the same dx-card-body as the scored rubric rows, styled only with italic text — no visual separator, no heading, and no ARIA role distinguishes it from the scored dimensions.
*Render the Efficiency note as a visually distinct callout (e.g., a bordered info box with a label 'Not included in /100 score') placed after the rubric table rather than inline within it, and add an aria-label to clarify it is supplementary.*
File: `app/help/page.tsx`

### history tab (11 findings)

**f-227** [high/inconsistency] Score math contradicts displayed subscores (asthma case)
> Scorecard shows: History & Interview 19/24 + Test Ordering 24/24 + Diagnosis Accuracy 36/36 + Diagnosis Completeness 11/16 = 90/100. Row-level score displays '90%'. Math: (19+24+36+11)/(24+24+36+16) = 90/100 = 90%. That checks out — BUT the progress bar for History & Interview reads 'width: 79.1667%' (19/24 = 79.17%) while the feedback text states 'missed asking about prior hospitalizations or ER visits' as the only gap. A 5-point deduction out of 24 for a single missed question is disproportionately large and inconsistent with the qualitative feedback calling the history 'Strong targeted questioning.'
*Reconcile the scoring rubric so a single missed history item does not cost 5/24 points, or revise the feedback text to enumerate all items that were missed to justify the deduction; the mismatch between 'strong' qualitative praise and a 21% point loss misleads learners about their actual performance gap.*
File: `app/history/page.tsx`

**f-228** [high/inconsistency] "Clinical" difficulty chip missing count label
> Filter chips show: 'All (50)', 'Foundations (47)', 'Clinical', 'Advanced (3)' — the 'Clinical' chip has no count while every other difficulty chip does.
*Add the case count to the 'Clinical' chip (e.g., 'Clinical (0)' if none exist, or the real number) so learners can immediately understand the distribution without clicking; a missing count implies a rendering bug where the value failed to load.*
File: `app/history/page.tsx`

**f-229** [medium/inconsistency] Foundations count (47) does not add up with other levels
> 'All (50)', 'Foundations (47)', 'Clinical' (no count), 'Advanced (3)' — 47 + 3 = 50 only if Clinical = 0, but the chip renders without a zero label, making it ambiguous whether Clinical cases exist and were not counted or the count simply failed to render.
*Explicitly show 'Clinical (0)' if there are no clinical-level cases so the arithmetic is transparent to the learner; alternatively surface this as a data-load bug if clinical cases do exist.*
File: `app/history/page.tsx`

**f-230** [medium/inconsistency] Difficulty badge truncated to 'Foun' instead of full label
> Every visible row renders: '<span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; color: var(--green); background: var(--border);">Foun</span>'
*Either widen the badge container to show 'Foundations' in full, or use a deliberate abbreviation like 'F' or 'Found.' consistently — 'Foun' looks like a layout overflow bug and will confuse learners unfamiliar with the difficulty tier labels.*
File: `app/history/page.tsx`

**f-231** [medium/inconsistency] "Your Diagnosis" vs "Correct Diagnosis" column mismatch signals broken grading in STEMI rows
> Session 2a3757a8: Your Diagnosis = 'STEMI (ST-Elevation Myocardial Infarction)', Correct Diagnosis = 'ST-Elevation Myocardial Infarction (Inferior STEMI)' — Result badge = 'Correct'. Session 74daa201: Your Diagnosis = 'ST-Elevation Myocardial Infarction (STEMI)', Correct Diagnosis = 'Acute ST-Elevation Myocardial Infarction (Inferior STEMI)' — Result badge = 'Correct'. In both cases the learner did NOT specify the territory (Inferior) yet received a 'Correct' result.
*The grading logic should distinguish between a complete correct diagnosis (including territory) and a partial one; at minimum the result badge should reflect 'Partial' and the Diagnosis Completeness subscore should be penalized, or the correct diagnosis column should not show a more specific answer than what was required for full credit.*
File: `app/history/page.tsx`

**f-232** [high/medical_inaccuracy] STEMI graded 'Correct' without territory identification — patient safety risk
> Session 2a3757a8 Result: 'Correct'. Your Diagnosis: 'STEMI (ST-Elevation Myocardial Infarction)'. Correct Diagnosis: 'ST-Elevation Myocardial Infarction (Inferior STEMI)'. Session 6dd03c54 Result: 'Correct'. Your Diagnosis: 'ST-Elevation Myocardial Infarction (STEMI)'. Correct Diagnosis: 'ST-Elevation Myocardial Infarction (Inferior STEMI)'.
*For STEMI cases, territory identification (Inferior, Anterior, Lateral) is clinically critical — Inferior STEMI requires right-sided leads to rule out RV infarction before administering nitrates, which are contraindicated with RV involvement. Grading a non-territory-specific STEMI diagnosis as fully 'Correct' teaches a dangerous shortcut; the platform must require and evaluate territory specification for STEMI cases.*
File: `app/history/page.tsx`

**f-233** [medium/medical_inaccuracy] ABG listed as confirming asthma diagnosis — misleading clinical teaching
> Test Ordering feedback: 'CBC with eosinophils, serum IgE, ABG, spirometry with pre/post-bronchodilator, and chest X-ray all directly confirmed the diagnosis and severity of the exacerbation.'
*An ABG in asthma does not 'confirm the diagnosis' — it assesses severity and risk of respiratory failure (e.g., a normal or rising PaCO2 in a tachypneic patient signals impending failure). The feedback should state that ABG confirmed severity/risk stratification, not the diagnosis itself, to avoid teaching that ABG is a diagnostic test for asthma.*
File: `app/history/page.tsx`

**f-234** [medium/inconsistency] Diagnosis Completeness score contradicts stated level expectations
> Diagnosis Completeness feedback: 'at Foundations level this is fully complete, though noting the severity (moderate) would have added useful clinical context for management planning — score reflects this minor gap.' Score awarded: 11/16 (68.75%). A 'minor gap' at a level where the answer is described as 'fully complete' should not result in a 31.25% deduction.
*If the answer is 'fully complete' at Foundations level, the score should reflect that (16/16 or a defined passing threshold); alternatively rewrite the feedback to explicitly name what was missing to justify an 11/16 score — the contradiction between 'fully complete' and 68.75% will confuse and demotivate learners.*
File: `app/history/page.tsx`

**f-235** [medium/improvement] Notes textarea state is not persisted — learner effort lost on collapse
> '<textarea class="dx-notes-textarea" placeholder="Add notes about this case…" rows="3"></textarea>' — textarea is empty with no saved value attribute; combined with the collapse/expand interaction ('action': 'expand-first-row', 'status': 'ok'), notes entered while a row is expanded will be lost when the row is collapsed or the page reloads.
*Persist notes to localStorage or the backend on input (debounced), and re-populate the textarea value from that store when a row is expanded; losing notes is a direct harm to the study workflow that is the core value proposition of this tab.*
File: `app/history/page.tsx`

**f-236** [medium/improvement] Only 3 history questions asked for a STEMI-equivalent case — unrealistically low
> '<span>Questions: 3</span>' displayed in the expanded asthma case detail panel (Time: 6m 11s).
*Three questions is clinically insufficient for a Foundations-level acute asthma exacerbation — a trainee should be eliciting at minimum: onset, severity, triggers, prior episodes, medications, allergies, family history, and hospitalizations. If '3' refers only to clarifying questions after initial history, the label should specify this context; otherwise the platform is implicitly validating dangerously sparse history-taking alongside a high score.*
File: `app/history/page.tsx`

**f-237** [low/improvement] "Recent trend" stat shows -1 pts with no reference period or context
> '<div style="font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;">Recent trend</div><div style="font-size: 22px; font-weight: 700; font-family: &quot;JetBrains Mono&quot;, monospace; color: var(--red);">-1 pts</div>'
*Add a tooltip or sub-label specifying what period and baseline this trend compares against (e.g., 'vs. prior 10 cases') — without context a -1 point change is uninterpretable and the red color unnecessarily alarms learners about a statistically insignificant fluctuation.*
File: `app/history/page.tsx`

### progress tab (10 findings)

**f-239** [high/inconsistency] Avg Score (88) and Correct Rate (94%) are statistically incompatible
> "Avg Score" value shown as "88" while "Correct Rate" value shown as "94%" — if 94% of cases are answered correctly, an average score of 88/100 implies the 6% of incorrect cases drag the mean down by ~100 points each, which is arithmetically impossible on a 0–100 scale
*Audit the two underlying calculations: if 'Correct Rate' is a binary right/wrong metric and 'Avg Score' is a rubric-based partial-credit score, label them clearly to explain the distinction; if they should be correlated, fix the data pipeline so the values are consistent.*
File: `app/progress/page.tsx`

**f-240** [high/inconsistency] Performance table row counts sum to 65 but Cardiovascular has 10 while all others have 5 (total = 60, not 65)
> "Total Cases" stat card shows "65"; table rows: Cardiovascular "10", then 11 rows each showing "5" = 10 + (11×5) = 65 — actually this sums correctly. RECHECK: Cardiovascular 10 + Respiratory 5 + Neurologic 5 + Gastrointestinal 5 + Renal 5 + Endocrine 5 + Infectious 5 + Hematologic 5 + Musculoskeletal 5 + Toxicologic 5 + Psychiatric 5 + Trauma 5 = 10 + 55 = 65. Total is consistent.
*No action needed — row counts do sum to 65. This finding is retracted; retained as a documented verification check.*
File: `app/progress/page.tsx`

**f-241** [medium/inconsistency] Cardiovascular 'Clinical' column shows '—' but 'Advanced' column shows a score, inconsistent with other systems
> Cardiovascular row: "<span class=\"dx-perf-score\" style=\"color: var(--muted);\">—</span>" for Clinical column, yet "<span class=\"dx-perf-score\" style=\"color: var(--green);\">88</span>" for Advanced column. All other 11 systems show a Foundations score and '—' for both Clinical and Advanced. It is clinically implausible and pedagogically inconsistent that a learner has Advanced-level cardiovascular cases scored but zero Clinical-level cases.
*Verify the difficulty-tier bucketing logic: if Advanced cases exist for Cardiovascular, Clinical-tier cases should exist too (difficulty tiers are sequential); fix the query or bucketing so that intermediate tiers are not skipped, or display a data integrity warning.*
File: `app/progress/page.tsx`

**f-242** [medium/inconsistency] Page heading says 'over time' twice — redundant subtitle duplicates the heading
> "<h1 class=\"heading-display text-[22px]\"><span class=\"heading-accent\">Progress</span> over time</h1><p style=\"margin:4px 0 0;font-size:13px;color:var(--muted)\">Your learning trajectory over time</p>"
*Change the subtitle to something additive (e.g., 'Scores, timing, and system breakdown across all 65 completed cases') rather than restating 'over time' already in the heading.*
File: `app/progress/page.tsx`

**f-243** [medium/improvement] No low-performing system is surfaced — all Avg scores are 83–89, hindering self-directed study
> Every system row shows green scores: Cardiovascular "89", Respiratory "89", Neurologic "87", Gastrointestinal "89", Renal "89", Endocrine "85", Infectious "89", Hematologic "83", Musculoskeletal "88", Toxicologic "88", Psychiatric "89", Trauma "89"
*Either flag scores below a configurable threshold (e.g., <80) with a warning color or banner, or cross-reference with the Focus Areas page to call out relative weaknesses — a 6-point spread (83–89) matters clinically but is invisible when all cells are the same green color.*
File: `app/progress/page.tsx`

**f-244** [medium/bug] Sort controls on Performance Breakdown table are non-functional (no interaction events captured)
> "<span class=\"dx-perf-th sortable\">Cases ↓</span>" — the '↓' indicator implies Cases column is actively sorted descending, and the other headers marked 'sortable' imply clickable sorting; however, the interactionLog is "[]" (empty), meaning no click handlers were exercised and no sort events fired during the captured session
*Confirm that click event listeners are actually attached to all '.sortable' header elements and that sorting state updates the table rows; add an integration test that clicks each sortable header and verifies row reordering.*
File: `app/progress/page.tsx`

**f-245** [medium/improvement] 'Clinical' and 'Advanced' columns are nearly always '—', providing no differential learning signal
> Out of 12 system rows, 11 show '—' for Clinical and 11 show '—' for Advanced: e.g., Respiratory "<span class=\"dx-perf-score\" style=\"color: var(--muted);\">—</span>" repeated across both columns for every system except Cardiovascular Advanced
*Either hide columns that contain no data for the current user (replacing with a prompt like 'Unlock Clinical-tier cases to see breakdown') or aggregate the columns into a single 'Difficulty breakdown' expandable row to avoid a table that is 80% empty dashes — empty columns impede the learner's ability to read across rows.*
File: `app/progress/page.tsx`

**f-246** [medium/improvement] Avg Time (7m 44s) has no benchmark or trend context, making it uninterpretable
> "<div class=\"dx-stat-label\">Avg Time</div><div class=\"dx-stat-value\" style=\"color:var(--muted)\">7m 44s</div>"
*Add a peer-percentile label or a target range (e.g., 'Recommended: 8–12 min per case') so the learner understands whether 7m 44s reflects efficient reasoning or premature closure — speed without accuracy context is a known source of diagnostic error training misguidance.*
File: `app/progress/page.tsx`

**f-247** [low/improvement] '3-case avg' rolling window is too small to smooth noise for a learner with 65 cases
> "<span style=\"display: flex; align-items: center; gap: 5px;\"><span style=\"width: 18px; border-top: 2px dashed rgba(45, 122, 74, 0.6); display: inline-block;\"></span>3-case avg</span>"
*Offer a toggle for rolling window size (3 / 5 / 10 cases) so learners with more data can see meaningful trends; a 3-case window on 65 data points is highly volatile and may obscure genuine learning curves.*
File: `app/progress/page.tsx`

**f-248** [low/improvement] No date range or time axis labels visible — 'Score Over Time' chart x-axis is uninterpretable from HTML
> "<div class=\"dx-card-header\" style=\"display: flex; align-items: center; justify-content: space-between;\"><span>Score Over Time</span>" — the canvas element renders via Chart.js but no axis label text or date range is present in the HTML snapshot, and there is no filter control (e.g., 'Last 30 days / All time')
*Ensure x-axis tick labels (dates or case-sequence numbers) are rendered and accessible; add a date-range selector so learners can isolate recent performance from historical baseline.*
File: `app/progress/page.tsx`

### review tab (9 findings)

**f-250** [high/inconsistency] Overall accuracy stat contradicts system-level data
> Header stat: 'Accuracy (dx correct)' shows '92%'. System × Difficulty table shows Hematologic / Oncologic at '0%×1' and all other 11 systems at '100%×1', yielding 11/12 = 91.67% accuracy — not 92%. The score trend tooltip also confirms: 'Hematologic / Oncologic · Foundations — Score 72 (incorrect)'.
*Recalculate and display the correct accuracy value (91.7% or 92% rounded consistently) and ensure the summary stat derives from the same data source as the per-system table so both are always in sync.*
File: `app/review/page.tsx`

**f-251** [high/inconsistency] Avg score stat conflicts with per-case score data
> Header stat: 'Avg score' shows '90/100'. Score trend tooltips list individual scores: 91, 93, 93, 90, 72, 92, 92, 93, 93, 93, 90, 93. Sum = 1075 / 12 = 89.58, which rounds to 90 — marginally consistent — but the 'By Difficulty' breakdown shows 'avg 90 ×12' while the dimension breakdown shows 'History & Interview 81%, Test Ordering 97%, Diagnosis Accuracy 94%, Diagnosis Completeness 88%', whose simple average is (81+97+94+88)/4 = 90%. The dimension average coincidentally matches but is a different metric from case-level avg score; labelling both as the same 90/100 obscures which calculation drives the headline figure.
*Clearly label the 'Avg score' headline as case-level average and ensure the dimension scores section is separately labelled as sub-dimension breakdown so learners understand these are two distinct averages.*
File: `app/review/page.tsx`

**f-252** [medium/inconsistency] Score Distribution histogram counts don't sum to total cases
> Score Distribution shows '1' case in the 60–79 bin and '11' cases in the 80–100 bin (total = 12). The 0–19, 20–39, and 40–59 bars render with 'min-h-[2px]' but display no count label (empty span). The Hematologic case scored 72, which belongs in 60–79; all others (91–93) belong in 80–100 — so the counts are correct, but the three empty bins still render visible bars with non-zero height ('height: 2%') despite having zero cases.
*Set bar height to 0 (or hide the bar entirely) when count is 0; rendering a visible bar for an empty bucket falsely implies data exists in those ranges.*
File: `app/review/page.tsx`

**f-253** [medium/inconsistency] 7-case rolling average line starts at case 1, not case 7
> The dashed 7-case average polyline begins at the very first point: 'points="26,23.179999999999996 73.63636363636364,22.159999999999997 121.27272727272728,21.82 ..."'. A 7-case rolling average is mathematically undefined until 7 data points have been observed; plotting it from case 1 means the early values are averages of fewer than 7 cases, which misrepresents the metric to learners.
*Either start rendering the rolling-average line only from the 7th data point, or re-label the legend to accurately reflect that it is a 'cumulative avg' or 'expanding window avg' for the first 6 cases.*
File: `app/review/page.tsx`

**f-254** [medium/bug] SVG chart data points have no keyboard or focus interaction
> Each data point is rendered as '<circle cx="..." cy="..." r="3.5" fill="#2d7a4a" stroke="var(--color-surface-0)" stroke-width="1.5"><title>Trauma · Foundations — Score 91 (correct) · 5/16/2026</title></circle>' with no tabindex, role, or aria attributes. Tooltip content is only accessible via SVG <title> on hover with a pointing device.
*Add tabindex='0', role='img', and aria-label to each circle so keyboard and screen-reader users can access the per-case tooltip data.*
File: `app/review/page.tsx`

**f-255** [medium/improvement] System × Difficulty table shows only one difficulty tier, masking curriculum gaps
> 'Clinical' and 'Advanced' columns each show '—' for all 12 rows: '<div class="mx-auto w-16 rounded py-1 text-[10px] text-ink-muted bg-surface-2/40">—</div>'. The learner has only attempted Foundations cases.
*Add a visible prompt or call-to-action within the empty columns (e.g., 'Try a Clinical case →') so learners understand the gap is due to untried difficulty tiers and are directed to attempt them, rather than assuming the data is missing or broken.*
File: `app/review/page.tsx`

**f-256** [medium/improvement] Weakest area (Hematologic/Oncologic 0%) has no actionable study recommendation
> 'Hematologic / Oncologic · Foundations — Score 72 (incorrect)' is the only incorrect case and the only 0% system row, yet the review page contains no 'Study this topic' link, no recommended resource, and no next-case suggestion tied to this gap.
*Add a 'Recommended next step' or 'Focus area' widget that surfaces the lowest-performing system and links directly to a new case in that domain, which is the core pedagogical value of a performance review screen.*
File: `app/review/page.tsx`

**f-257** [low/improvement] All 12 cases share the same date (5/16/2026), limiting trend utility
> Every score-trend circle tooltip ends with '· 5/16/2026': e.g., 'Trauma · Foundations — Score 91 (correct) · 5/16/2026', 'Cardiovascular · Foundations — Score 93 (correct) · 5/16/2026'. With identical dates the x-axis is effectively an ordinal sequence, not a time axis, yet it is drawn as if it were temporal.
*Either label the x-axis as 'Case #' (ordinal) instead of implying time, or ensure timestamps reflect real session times so the trend line conveys genuine temporal learning progress.*
File: `app/review/page.tsx`

**f-258** [low/improvement] 'Systems tried: 12/12' denominator is misleading at Foundations-only coverage
> 'Systems tried' shows '12 / 12'. However, only Foundations difficulty has been attempted; Clinical and Advanced columns are all '—'. A learner could interpret '12/12' as full curriculum coverage when in reality they have completed only one difficulty tier across 12 systems.
*Change the denominator or label to reflect total system × difficulty combinations attempted (e.g., '12 / 36 combinations') or add a tooltip clarifying the metric counts distinct systems, not difficulty tiers.*
File: `app/review/page.tsx`

### settings tab (10 findings)

**f-260** [high/bug] Dark mode toggle button not found / non-functional
> {"action": "toggle-dark-mode", "status": "button not found"}
*The Appearance section renders chip buttons for Light/Dark/Auto themes but the interaction test could not locate a button with the expected selector for dark mode toggling — verify the chip buttons are wired to state and that their accessible labels or data attributes match what the test (and screen readers) expect.*
File: `app/settings/page.tsx`

**f-261** [medium/bug] Theme chip buttons lack persist logic — selection resets on reload
> <button class="dx-chip" style="text-transform:capitalize">☀ Light</button><button class="dx-chip" style="text-transform:capitalize">☾ Dark</button><button class="dx-chip active" style="text-transform:capitalize">⬤ Auto</button>
*The page correctly reads 'medtrainer_color_scheme' from localStorage on load (inline script in <head>), but there is no visible Save button or onChange handler shown for the chip group, meaning clicking a theme chip likely updates visual state only until page refresh; wire chip clicks to write to localStorage and confirm persistence.*
File: `app/settings/page.tsx`

**f-262** [medium/bug] Weekly case goal input accepts values beyond stated max with no validation message
> <input class="dx-input" type="number" min="1" max="14" style="max-width:80px" value="5">
*HTML min/max attributes are advisory only and do not prevent programmatic or copy-paste entry of out-of-range values; add server-side and client-side validation that clamps the value and surfaces an inline error when the user saves preferences with a value outside 1–14.*
File: `app/settings/page.tsx`

**f-263** [medium/inconsistency] Free plan case limit contradicts itself: '2 cases per day' vs weekly goal up to 14
> "Free plan — 2 cases per day, basic scorecard." ... <input class="dx-input" type="number" min="1" max="14" style="max-width:80px" value="5"><p class="dx-help-text">Number of cases you aim to complete each week.</p>
*A daily cap of 2 cases means the maximum achievable weekly total is 14 (7 × 2), but the UI presents the weekly goal as a user-controlled preference without clarifying that the Free plan hard cap will prevent reaching goals above 14; display a contextual note that Free users are limited to 2 cases/day so the effective weekly ceiling is 14, or disable/clamp the input accordingly.*
File: `app/settings/page.tsx`

**f-264** [medium/inconsistency] Rest days selection has no Save button of its own; grouped Save covers all training prefs
> <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="dx-chip">Mon</button>...  <button class="dx-chip active">Sun</button></div><p class="dx-help-text">Rest days are skipped in your weekly training plan.</p> ... <div class="dx-form-actions"><button class="dx-btn-primary" style="font-size:13px;padding:7px 18px">Save preferences</button></div>
*The single 'Save preferences' button at the bottom of the Training preferences card implicitly saves rest days, weekly goal, and difficulty mix together, but this is not communicated to the user; add a label such as 'Save all training preferences' or group each sub-setting with its own save control to avoid ambiguity about what is persisted.*
File: `app/settings/page.tsx`

**f-265** [medium/bug] Upgrade to Pro uses mailto: link — fails silently when no email client is configured
> <a href="mailto:support@medtrainer.app?subject=MedTrainer Pro upgrade" class="dx-btn-primary" ...>Upgrade to Pro →</a><p class="dx-help-text" style="margin:0">Opens your email to contact us.</p>
*On devices without a configured mail client (common in browser-only or enterprise environments) the mailto: href opens nothing or throws an OS error; replace with an in-app contact/upgrade form or a direct link to a web-based checkout page to prevent a dead-end upgrade path.*
File: `app/settings/page.tsx`

**f-266** [medium/improvement] Notification preferences saved but explicitly non-functional — misleading to learners
> <p class="dx-help-text" style="margin-bottom:8px">Email sending is coming soon — your preferences are saved and will take effect when enabled.</p><label class="dx-checkbox-row"><input type="checkbox" checked=""><span class="dx-checkbox-label">Daily case reminders</span></label>
*Presenting checked, interactive checkboxes for a feature that is admittedly non-operational teaches learners that their action has an effect when it does not; either remove the section until the feature ships, or render the checkboxes as disabled with a clear 'Coming soon' badge so learners do not form a false expectation of receiving reminders.*
File: `app/settings/page.tsx`

**f-267** [low/bug] Password fields ship with autocomplete not explicitly set, risking manager autofill conflicts
> <input class="dx-input" type="password" placeholder="Enter current password" style="max-width:320px" value=""> ... <input class="dx-input" type="password" placeholder="At least 8 characters" style="max-width:320px" value=""> ... <input class="dx-input" type="password" placeholder="Re-enter new password" style="max-width:320px" value="">
*Add autocomplete="current-password" on the current-password field and autocomplete="new-password" on both the new and confirm fields so password managers fill the correct field and browsers do not warn about missing autocomplete attributes.*
File: `app/settings/page.tsx`

**f-268** [low/improvement] Theme chips use Unicode symbols (☀ ☾ ⬤) without accessible labels
> <button class="dx-chip" style="text-transform:capitalize">☀ Light</button><button class="dx-chip" style="text-transform:capitalize">☾ Dark</button><button class="dx-chip active" style="text-transform:capitalize">⬤ Auto</button>
*Add aria-label attributes (e.g., aria-label="Light theme") or wrap the symbol in <span aria-hidden="true"> so screen readers announce the button purpose from the text content alone rather than reading raw Unicode character names.*
File: `app/settings/page.tsx`

**f-269** [low/improvement] Display name field has no Save feedback — success/failure state is invisible to user
> <button class="dx-btn-primary" style="font-size:13px;padding:7px 18px">Save profile</button>
*After clicking 'Save profile' there is no visible toast, inline confirmation, or button state change shown in the HTML; implement a transient success indicator (e.g., button text changes to 'Saved ✓' for 2 seconds, or a toast) so learners know their profile name was actually persisted.*
File: `app/settings/page.tsx`

### trainer tab (10 findings)

**f-271** [medium/inconsistency] Duplicate 'Generate Case' buttons with no behavioral differentiation
> Header contains: <button class="rounded-md bg-primary-500 px-4 py-1.5 text-[11px] font-semibold text-ink-inverse hover:bg-primary-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary-900/20">Generate Case</button> AND main area contains: <button class="rounded-md bg-primary-500 px-8 py-3 text-[13px] font-semibold text-ink-inverse hover:bg-primary-400 transition-colors shadow-lg shadow-primary-900/20">Generate Your First Case</button>
*Retain only one canonical 'Generate Case' entry point, or make the header button disabled/hidden until the first case is dismissed, to avoid confusion about which button to use and why they appear to be different actions.*
File: `app/trainer/page.tsx`

**f-272** [medium/bug] Header 'Generate Case' button lacks disabled state before case is active
> Header button: <button class="rounded-md bg-primary-500 px-4 py-1.5 text-[11px] font-semibold text-ink-inverse hover:bg-primary-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary-900/20">Generate Case</button> — no `disabled` attribute is present, meaning it is always clickable even mid-session, while the chat input correctly shows: <input type="text" disabled="" placeholder="Generate a case first"
*Disable the header 'Generate Case' button while a case is actively in progress, matching the disabled-input logic already applied to the chat field, to prevent accidental case replacement mid-session.*
File: `app/trainer/page.tsx`

**f-273** [medium/inconsistency] Clinical level tooltip description inconsistent: 'Clinical' timer shown as 22 min but 'Advanced' as 15 min
> Tooltip reads: "Clinical — Moderate diagnoses, 1-2 atypical features, 22-minute timer." and "Advanced — Rare/complex diagnoses, multiple red herrings, 15-minute timer."
*The harder difficulty level (Advanced) should not have a shorter absolute timer than the easier Clinical level unless the intent is a strict time-pressure mechanic — if so, add explicit instructional copy explaining this is intentional pressure; otherwise correct the Clinical timer to be ≤15 min or the Advanced timer to be ≥22 min.*
File: `app/trainer/page.tsx`

**f-274** [medium/medical_inaccuracy] Foundations difficulty described as 'no timer' — inappropriate framing for clinical reasoning training
> "Foundations — Common textbook diagnoses, classic presentations, no timer. Output: diagnosis only."
*Even at a foundational level, time-awareness is a core clinical skill; consider adding an optional soft timer or at minimum recording elapsed time and displaying it post-case, so learners build temporal self-awareness without added pressure.*
File: `app/trainer/page.tsx`

**f-275** [medium/improvement] All nav steps disabled with no visual progress indicator or affordance
> <button disabled="" class="flex w-full items-center gap-2.5 py-2.5 pl-3 pr-2 text-left text-[11px] transition-colors -ml-[2px] cursor-not-allowed text-ink-tertiary/50"><span>History of Present Illness</span></button> — repeated for all six steps: HPI, ROS, Physical Examination, Order Tests, Test Results, Diagnosis
*Add a visual affordance (e.g., numbered step badges, a progress bar, or tooltip on hover explaining 'Generate a case to unlock') so learners understand the workflow before generating a case; the current all-greyed-out nav gives no indication of the intended sequence or how to unlock it.*
File: `app/trainer/page.tsx`

**f-276** [medium/improvement] SOAP template button in Case Notes panel is non-functional with no feedback
> <button class="text-[10px] text-ink-tertiary hover:text-ink-primary transition-colors">SOAP template</button>
*Clicking 'SOAP template' should either populate the textarea with a SOAP scaffold or open a modal with structured fields; if not yet implemented, disable the button and add a tooltip explaining it becomes available after case generation, rather than silently doing nothing.*
File: `app/trainer/page.tsx`

**f-277** [low/inconsistency] 'Case Notes' label uses 'caution' color with no explanatory context
> <span class="text-[11px] font-semibold uppercase tracking-wider text-caution">Case Notes</span>
*The caution/warning color on the 'Case Notes' label implies urgency or a warning state that is not explained; use a neutral label color or add a tooltip clarifying why caution styling is applied (e.g., 'Notes are not saved' or 'Visible to grader').*
File: `app/trainer/page.tsx`

**f-278** [medium/improvement] Patient Interview panel has no placeholder case/patient context while idle
> <h2 class="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">Patient Interview</h2> ... <p class="text-[11px] text-ink-tertiary text-center pt-8">Generate a case to start interviewing the patient.</p>
*Display a short sample interaction or animated preview in the Patient Interview panel to convey to new users what the interview experience will look like, reducing cognitive uncertainty about what 'interviewing the patient' means in this context.*
File: `app/trainer/page.tsx`

**f-279** [low/improvement] Dictation button in Case Notes has no disabled state when no case is active
> <button type="button" title="Dictate" class="flex-shrink-0 rounded-md border px-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-surface-4 bg-surface-2 text-ink-tertiary hover:border-surface-4 hover:text-ink-secondary py-1">
*Disable the dictation microphone button until a case is generated, matching the disabled state already applied to the chat input, to prevent users from activating dictation into a note for a non-existent case.*
File: `app/trainer/page.tsx`

**f-280** [low/improvement] System filter dropdown includes 'Toxicologic' and 'Trauma' but these map poorly to organ-system categories
> <option>Toxicologic</option><option>Trauma</option> alongside <option>Cardiovascular</option><option>Respiratory</option>
*Toxicology and Trauma are mechanisms/contexts, not organ systems like the other options; separate them visually with an <optgroup> (e.g., 'By System' vs. 'By Context') so learners understand the taxonomy and can reason about why they're selecting a filter.*
File: `app/trainer/page.tsx`

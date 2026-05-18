# MedTrainer Student Audit — Findings Report
Generated: 2026-05-16T22:56:29.570Z

**Total findings:** 129  (19 high · 83 medium · 27 low)

## Top Priority Findings

### [HIGH] f-001: Troponin I critically elevated at Hour 0 contradicts STEMI physiology
**Category:** medical_inaccuracy  |  **Source:** case — case-1 (Cardiovascular, Foundations)

**Evidence:** > "Troponin I (Hour 0)": { "value": "4.82", "unit": "ng/mL", "referenceRange": "< 0.04 ng/mL (elevated at 90 min from symptom onset; rising pattern expected at 3-6h post-onset)" }

**Suggestion:** A troponin of 4.82 ng/mL at 90 minutes post-symptom onset is physiologically implausible — troponin typically begins rising 3–6 hours after myocardial injury and is often undetectable or minimally elevated in the first 2 hours. The Hour 0 value should be below the 99th percentile (e.g., 0.02–0.03 ng/mL) to accurately model early STEMI and reinforce the teaching point already in the case that 'a single value must always be interpreted in the context of symptom onset time.' The current data actively contradicts that teaching point.

### [HIGH] f-016: Teaching point: lipase >3x ULN threshold stated as 180 U/L but ULN given is 60 U/L
**Category:** medical_inaccuracy  |  **Source:** case — case-04 (Gastrointestinal, Foundations)

**Evidence:** > Teaching point: "a lipase level greater than 3 times the upper limit of normal (>180 U/L) is diagnostic in the right clinical context." Lab reference range: "referenceRange": "13-60", "unit": "U/L"

**Suggestion:** Three times the stated upper limit of normal of 60 U/L equals 180 U/L, so the arithmetic is internally consistent; however, the ULN of 60 U/L is at the low end of commonly cited institutional ranges (many labs use 13–60, others use up to 160 U/L). The case should explicitly state the ULN used in this case's reference range (60 U/L) so the threshold is transparently derived (3 × 60 = 180 U/L), preventing learners at institutions with higher ULNs from misapplying a fixed 180 U/L cutoff as universal.

### [HIGH] f-032: HPI explicitly denies prior episodes, contradicting hidden history dactylitis
**Category:** inconsistency  |  **Source:** case — case-8 (Hematologic/Oncologic Foundations)

**Evidence:** > HPI: "He has no prior similar episodes" vs. hiddenHistory: "He confirms experiencing hand and foot swelling as an infant that resolved spontaneously."

**Suggestion:** Dactylitis (hand and foot swelling in infancy) is a prior episode directly relevant to the diagnosis, and stating 'no prior similar episodes' in the HPI is factually contradictory; revise the HPI to 'no prior episodes of acute hemolytic crisis' to preserve the clinical hook while not creating a direct contradiction with the hidden history.

### [HIGH] f-037: Student diagnosed hereditary spherocytosis but grading inconsistently awards 12/20 for completeness
**Category:** inconsistency  |  **Source:** case — case-8 (Hematologic/Oncologic Foundations)

**Evidence:** > diagnosisAccuracy score: 19 (incorrect diagnosis confirmed), diagnosisCompleteness score: 12, feedback: "Partial credit only — hereditary spherocytosis is a recognized hemolytic anemia differential and the student demonstrated structured reasoning, but the core diagnosis was missed"

**Suggestion:** Awarding 12 points for completeness when the core diagnosis is entirely wrong conflates diagnostic reasoning quality with diagnostic completeness; completeness credit should be 0 or near-0 when the named diagnosis is incorrect, with reasoning quality credited under a separate 'clinical reasoning' dimension to avoid inflating scores for wrong answers.

### [HIGH] f-044: Urine drug screen incorrectly lists acetaminophen as a detectable analyte
**Category:** medical_inaccuracy  |  **Source:** case — case-11 (Toxicologic, Foundations)

**Evidence:** > "Urine Drug Screen": { "components": [ { "name": "Acetaminophen (urine screen)", "value": "Positive", "unit": "", "referenceRange": "Negative", "status": "abnormal" } ] }

**Suggestion:** Standard urine drug immunoassay panels do not include acetaminophen; acetaminophen toxicity is confirmed via serum acetaminophen level, not urine screen. Remove acetaminophen from the UDS panel and note that the serum level (already ordered) is the correct confirmatory test, as including it here teaches students an incorrect diagnostic shortcut.

### [HIGH] f-200: Weekly goal shows 58 cases completed against a goal of 5
**Category:** inconsistency  |  **Source:** tab — dashboard

**Evidence:** > <span class="dx-weekly-done" style="color:var(--green)">58</span><span class="dx-weekly-sep"> / <!-- -->5</span><span class="dx-weekly-label"> cases — goal met! 🎉</span>

**Suggestion:** The completed count (58) and the goal (5) are almost certainly sourced from different data fields — likely total all-time cases vs. the weekly goal target. Verify the weekly completion counter is scoped to the current week's activity and not the cumulative case count.

### [HIGH] f-201: Recommended next case targets highest-scoring system, not weakest
**Category:** inconsistency  |  **Source:** tab — dashboard

**Evidence:** > "Your Hematologic / Oncologic avg is 83." ... Focus areas list: Hematologic / Oncologic 83%, Endocrine / Metabolic 85%, Neurologic 87%

**Suggestion:** The recommendation engine appears to be routing users to the system with the highest score (83% is the top of the listed focus areas), which is the opposite of spaced-repetition / weakness-targeting logic. The card should recommend the lowest-scoring system to direct study effort where it is most needed; verify the sort/selection logic.

### [HIGH] f-218: Foundations rubric points sum to 100 but categories are internally inconsistent with stated totals
**Category:** inconsistency  |  **Source:** tab — help

**Evidence:** > History & Interview /24 pts, Test Ordering /24 pts, Diagnosis Accuracy /36 pts, Diagnosis Completeness /16 pts — 24+24+36+16 = 100 ✓. Clinical & Advanced: History /20 pts, Test Ordering /20 pts, Diagnosis Accuracy /30 pts, Diagnosis Completeness /15 pts, Clinical Reasoning /15 pts — 20+20+30+15+15 = 100 ✓. However the efficiency note reads: 'Efficiency (/10, shown separately)... is not included in the /100 score.' Yet the FAQ entry states: 'STEMI and NSTEMI... caps Diagnosis Accuracy at approximately 44% of its dimension (16/36 at Foundations, 13/30 at Clinical/Advanced)'. 13/30 = 43.3% but 16/36 = 44.4% — these are not equivalent percentages and the FAQ implies a single consistent 44% cap across both tiers, which is arithmetically false for one of them.

**Suggestion:** Express the partial-credit cap consistently: either use a single percentage ('approximately 43–44%') or state the exact point values per tier (16/36 at Foundations; 13/30 at Clinical/Advanced) without asserting they are equal.

**File:** `app/help/page.tsx`

### [HIGH] f-219: STEMI/NSTEMI FAQ conflates ECG finding with cath-lab activation as equivalent discriminators
**Category:** medical_inaccuracy  |  **Source:** tab — help

**Evidence:** > "STEMI and NSTEMI are not clinically equivalent — they differ in ECG findings, cath-lab activation, and management."

**Suggestion:** The statement that they 'differ in cath-lab activation' is partially misleading: high-risk NSTEMI (e.g., ongoing ischemia, cardiogenic shock) also requires urgent/emergent catheterization per ACC/AHA guidelines — the key distinction is mandatory immediate activation (STEMI) vs. risk-stratified timing (NSTEMI). Revise to: 'STEMI mandates immediate cath-lab activation; NSTEMI management is risk-stratified and may also require early invasive strategy.'

**File:** `app/help/page.tsx`

### [HIGH] f-228: Score math contradiction: 19+24+36+11=90 but scorecard shown as 90%
**Category:** inconsistency  |  **Source:** tab — history

**Evidence:** > History & Interview: 19/24, Test Ordering: 24/24, Diagnosis Accuracy: 36/36, Diagnosis Completeness: 11/16 — sum = 90/100. Score displayed: '90%'. This arithmetic happens to work out here, but the Diagnosis Accuracy subscore alone is 36/36 points and Diagnosis Completeness is 11/16, yet the feedback text says 'The core diagnosis is named correctly with supporting qualifiers; at Foundations level this is fully complete' while awarding only 11/16 — contradicting the statement of full completeness.

**Suggestion:** Either the Diagnosis Completeness narrative ('at Foundations level this is fully complete') must be corrected to match the partial score awarded (11/16 = 68.75%), or the score should be 16/16 if the rubric truly considers it fully complete at Foundations level. The contradictory message will confuse learners about what they lost points for.

**File:** `app/history/page.tsx`

## Case-Level Findings

### Inconsistency (18)

**f-003** [medium] Patient name reused across case-1 and case-3 for different patients — _case-1 (Cardiovascular, Foundations)_
> Case 1: "name": "Dmitri Voloshyn", "age": 58, "gender": "Male" ... Case 3: "name": "Dmitri Voloshyn", "age": 34, "gender": "Male"
*Two entirely different patients (58-year-old with STEMI and 34-year-old with SAH) share the identical full name 'Dmitri Voloshyn'; assign a unique name to the case-3 patient to prevent student confusion and to reflect realistic clinical practice where patient identity is a safety-critical data point.*

**f-007** [medium] Symptoms relieved by sitting upright and worse lying flat inconsistent with asthma — _case-2 (Respiratory, Foundations)_
> HPI: "Symptoms are partially relieved when he sits upright and worsen when he lies flat."
*Orthopnea (relief sitting upright, worsening supine) is a hallmark of cardiac failure or tracheal/large-airway compression, not asthma — asthma symptoms are position-independent and are characteristically worse with supine position only due to postnasal drip, not hydrostatic pulmonary congestion. Replace this detail with clinically accurate asthma-specific positional/temporal descriptors (e.g., nocturnal worsening, worse with exertion, relief with bronchodilators) to avoid implanting a misleading clinical association in learners at the Foundations level.*

**f-009** [medium] Student not asked about prior similar headaches despite it being a key question — _case-3 (Neurologic, Foundations)_
> keyQuestions: ["Have you ever had a headache like this before?"] ... Grading feedback: "minor missed areas include focal neurological symptoms and any prior similar headaches" ... Transcript: the student never asked about prior headaches; the three questions asked were thunderclap onset, family history, and sick contacts/neck stiffness.
*The grading feedback correctly notes that prior similar headaches were missed, but the missed question is listed as 'minor' despite being explicitly enumerated as one of four key questions for this diagnosis; the grading rubric should elevate this to a scored miss in the historyInterview dimension (and deduct accordingly) because a prior similar headache would identify a sentinel bleed — a finding that carries major management and prognostic weight for SAH.*

**f-010** [medium] Sentinel headache 2 weeks prior is hidden but not assessed — missed teaching opportunity — _case-3 (Neurologic, Foundations)_
> hiddenSymptoms: "Patient reports a brief episode of 'sentinel headache' — a milder but sudden severe headache — approximately 2 weeks ago that resolved within an hour, which he attributed to dehydration."
*The sentinel bleed is one of the most clinically critical findings in SAH management (it represents a warning leak that precedes catastrophic re-rupture), yet the grading system does not flag the student's failure to elicit it as a scored miss, and no missed question prompt references it; add 'Have you had any sudden severe headache in the past weeks, even if it resolved quickly?' to the missedQuestions list and score its absence in the historyInterview dimension.*

**f-011** [low] Loss of consciousness at onset not assessed or scored despite being a hidden symptom — _case-3 (Neurologic, Foundations)_
> hiddenSymptoms: "Patient also admits to a very brief loss of consciousness lasting a few seconds at headache onset."
*Transient loss of consciousness at SAH onset is associated with higher-grade hemorrhage and increased early mortality risk; because no student question would have elicited it and no missed question flags it, this clinically significant finding is entirely inert in the case. Either add it to the missedQuestions list or have the patient volunteer it proactively during the interview to ensure students encounter this important prognostic feature.*

**f-017** [medium] Missed question feedback contradicts graded test-ordering score of 24/25 — _case-04 (Gastrointestinal, Foundations)_
> Grading feedback for testOrdering: "The ordered tests — lipase, CBC, BMP, LFTs, triglycerides, and RUQ ultrasound — represent a complete and appropriate core workup for acute pancreatitis" with score 24/25. Student notes: "I debated whether to order a urinalysis too but held off." The urinalysis was NOT ordered by the student yet appears in the case's labResults with clinically relevant abnormalities (trace glucose, positive ketones).
*If the urinalysis was not ordered by the student, its results should not be silently available in the session, and the full-mark test-ordering score is appropriate. However, the case data includes a populated urinalysis result which may be rendered to the student despite not being ordered — the platform should enforce that unordered test results are not displayed, and the grader should confirm this gating is functioning correctly.*

**f-020** [medium] keyQuestions list matches 4 questions but grading penalizes for fever/chills not in keyQuestions — _case-05 (Renal, Foundations)_
> keyQuestions: ["Have you had kidney stones before?", "Do you have a family history of kidney stones?", "How much water do you drink daily?", "Have you noticed blood in your urine?"]. missedQuestions in grading: "Do you have any fever or chills? (Fever with obstructive uropathy suggests infected stone/urosepsis — a surgical emergency requiring urgent urology consultation)"
*Fever/chills is cited as a missed question that costs the student points but is absent from the canonical keyQuestions list; either add fever/chills to keyQuestions so it is part of the defined expected history, or clarify in the grading rubric that additional high-yield questions beyond the keyQuestions list are tracked. Penalizing students for omissions not reflected in the defined key question set undermines rubric transparency and creates an inconsistent standard.*

**f-021** [low] historyInterview score 20/25 yet feedback says 'asked all four key high-yield questions' — _case-05 (Renal, Foundations)_
> historyInterview feedback: "The student asked all four key high-yield questions outlined in the case and surfaced critical information efficiently; minor deduction for not asking about fever/chills or dietary habits" with score 20/25.
*A score of 20/25 (80%) for asking 'all four key questions' with only a 'minor deduction' is inconsistent — a minor deduction typically implies 1–2 points off, not 5 points (20%). Either recalibrate the score to 23–24/25 for this performance or revise the feedback to accurately describe the deduction as substantial rather than minor, so students understand the actual weight placed on fever/chills and dietary history questions.*

**f-025** [low] diagnosisCompleteness feedback penalizes 'likely' qualifier but score is still 13/15 — _case-06 (Endocrine/Metabolic, Foundations)_
> diagnosisCompleteness feedback: "the qualifier 'likely' slightly hedges the Hashimoto's diagnosis when the laboratory data strongly confirm it." Score: 13/15.
*The feedback correctly notes the hedge but gives 13/15 without specifying what a 15/15 response would look like. At Foundations level, anti-TPO of 842 IU/mL (>24× ULN) and the ultrasound findings do strongly confirm Hashimoto's; update the rubric to explicitly state that at Foundations level 'likely Hashimoto's' is acceptable and earns full marks, OR lower the score further (e.g., 12/15) with a clearer explanation that a definitive qualifier is expected when serologic confirmation is present — the current feedback and score are not internally calibrated.*

**f-026** [medium] keyQuestions list includes constipation/puffiness question but student penalized as if it were a bonus — _case-06 (Endocrine/Metabolic, Foundations)_
> keyQuestions: ["Have you experienced constipation, puffiness around your eyes, or changes in your voice?"]. historyInterview feedback: "missed inquiring about medications that can cause hypothyroidism and did not elicit hidden symptoms like constipation or periorbital puffiness" — scored 19/25.
*Constipation and periorbital puffiness are explicitly listed in keyQuestions, meaning failure to ask about them should generate a clear deduction with reference to those defined key questions. The feedback treats this omission the same as the medication question (which is not in keyQuestions), conflating two different types of misses. Grading feedback should distinguish between 'missed a defined key question' versus 'missed a bonus high-yield question not in the key list' so students understand the rubric and can prioritize accordingly.*

**f-032** [high] HPI explicitly denies prior episodes, contradicting hidden history dactylitis — _case-8 (Hematologic/Oncologic Foundations)_
> HPI: "He has no prior similar episodes" vs. hiddenHistory: "He confirms experiencing hand and foot swelling as an infant that resolved spontaneously."
*Dactylitis (hand and foot swelling in infancy) is a prior episode directly relevant to the diagnosis, and stating 'no prior similar episodes' in the HPI is factually contradictory; revise the HPI to 'no prior episodes of acute hemolytic crisis' to preserve the clinical hook while not creating a direct contradiction with the hidden history.*

**f-035** [medium] Urinalysis blood 2+ unexplained and inconsistent with smear/imaging findings — _case-8 (Hematologic/Oncologic Foundations)_
> Urinalysis: "Blood": "2+" ... Peripheral Blood Smear: "No spherocytes or elliptocytes identified" ... Abdominal Ultrasound: "No acute splenic sequestration identified"
*Blood 2+ on urinalysis dipstick in the context of hemolytic anemia most likely reflects hemoglobinuria (free hemoglobin from intravascular hemolysis); this distinction from hematuria is clinically critical and should be explicitly addressed either in the urinalysis result (noting 'no RBCs on microscopy — consistent with hemoglobinuria') or in a teaching point, as students may incorrectly interpret this as genitourinary bleeding.*

**f-036** [medium] Grading awards 19/25 for history but missed questions not penalized proportionally — _case-8 (Hematologic/Oncologic Foundations)_
> historyInterview score: 19 (out of apparent 25 max), feedback: "Strong history overall" — yet missedQuestions lists childhood hospitalizations and newborn screening, which the student did not ask about despite these being listed as keyQuestions in the case.
*The score of 19/25 is inconsistent with 'strong history overall' when two of the four designated keyQuestions were missed entirely; the feedback label should be downgraded from 'strong' to 'adequate' or the score adjusted to reflect the missed high-yield questions more accurately, ensuring grading rubric consistency across cases.*

**f-037** [high] Student diagnosed hereditary spherocytosis but grading inconsistently awards 12/20 for completeness — _case-8 (Hematologic/Oncologic Foundations)_
> diagnosisAccuracy score: 19 (incorrect diagnosis confirmed), diagnosisCompleteness score: 12, feedback: "Partial credit only — hereditary spherocytosis is a recognized hemolytic anemia differential and the student demonstrated structured reasoning, but the core diagnosis was missed"
*Awarding 12 points for completeness when the core diagnosis is entirely wrong conflates diagnostic reasoning quality with diagnostic completeness; completeness credit should be 0 or near-0 when the named diagnosis is incorrect, with reasoning quality credited under a separate 'clinical reasoning' dimension to avoid inflating scores for wrong answers.*

**f-040** [medium] Student adds 'concurrent medial meniscus injury' but MRI explicitly shows no meniscal tear — _case-9 (Musculoskeletal Foundations)_
> Student diagnosis: "ACL tear (anterior cruciate ligament rupture), likely with concurrent medial meniscus injury" vs. MRI result: "The medial and lateral menisci demonstrate no significant tear."
*The grading correctly flags this as unsupported but still awards 30/36 for accuracy; the score reduction for an explicitly contradicted co-diagnosis addition should be more substantial (e.g., 26–28/36) to reinforce that adding unconfirmed diagnoses that contradict available imaging results is a meaningful clinical error, not a minor stylistic issue.*

**f-047** [medium] Salicylate negative on UDS but listed as positive and separate serum level ordered — _case-11 (Toxicologic, Foundations)_
> UDS result: "{ "name": "Salicylates", "value": "Negative" }" versus a separately ordered "Salicylate Level" lab returning "Serum Salicylate: 2.1 mg/dL" with status "normal".
*Having salicylates both on the UDS (negative) and as a separate serum level is not inconsistent per se, but the UDS salicylate screen is qualitative and can miss toxic levels; add a brief explanatory note in the UDS result or reference range field clarifying that a negative urine salicylate screen does not exclude toxicity and that the serum level remains the definitive test, turning this into an active teaching moment rather than a silent redundancy.*

**f-049** [medium] Grading credits student for not ordering hand X-ray but feedback implies it was ordered — _case-12 (Trauma, Foundations)_
> Student notes: "I ordered X-Ray Right Wrist (PA and Lateral) and skipped the hand X-ray because the pain is localized to the wrist" versus grading feedback: "Appropriate core imaging was ordered (PA and lateral wrist X-rays plus hand X-rays to rule out scaphoid fracture)".
*The grading feedback incorrectly states that hand X-rays were ordered when the student explicitly states they were not; correct the testOrdering feedback to accurately reflect that only the wrist X-ray was ordered and address whether the absent hand/scaphoid view was appropriate or a missed opportunity given the snuffbox tenderness elicited during the interview.*

**f-050** [low] HPI states hypersomnia but teaching point counts only sleep disturbance (insomnia) as DSM criterion met — _case-10 (Psychiatric, Foundations)_
> HPI: "difficulty falling asleep and early morning awakening" versus hiddenHistory: "hypersomnia alternating with early awakening" versus teaching point: "this patient meets 6 criteria (depressed mood, anhedonia, sleep disturbance, weight loss/appetite change, fatigue, and difficulty concentrating)".
*The hidden history introducing hypersomnia is not reflected in the HPI and creates a latent inconsistency; either remove 'hypersomnia' from the hidden history or add it to the HPI as an additional disclosed symptom, ensuring the DSM symptom count remains internally consistent across all case fields.*

### Medical Inaccuracy (19)

**f-001** [high] Troponin I critically elevated at Hour 0 contradicts STEMI physiology — _case-1 (Cardiovascular, Foundations)_
> "Troponin I (Hour 0)": { "value": "4.82", "unit": "ng/mL", "referenceRange": "< 0.04 ng/mL (elevated at 90 min from symptom onset; rising pattern expected at 3-6h post-onset)" }
*A troponin of 4.82 ng/mL at 90 minutes post-symptom onset is physiologically implausible — troponin typically begins rising 3–6 hours after myocardial injury and is often undetectable or minimally elevated in the first 2 hours. The Hour 0 value should be below the 99th percentile (e.g., 0.02–0.03 ng/mL) to accurately model early STEMI and reinforce the teaching point already in the case that 'a single value must always be interpreted in the context of symptom onset time.' The current data actively contradicts that teaching point.*

**f-002** [medium] Inferior STEMI + early pulmonary edema on CXR is physiologically inconsistent — _case-1 (Cardiovascular, Foundations)_
> ECG: "3mm ST elevation in leads II, III, and aVF" and Echo: "Estimated ejection fraction 40-45%"
*Pulmonary edema in an inferior STEMI with an EF of 40–45% and right ventricular involvement is atypical — RV infarction classically causes elevated JVP, hypotension, and clear lung fields (not pulmonary edema), because the RV cannot fill the left ventricle. The CXR finding of pulmonary edema should be removed or replaced with normal lung fields to avoid teaching students an inaccurate hemodynamic pattern for inferior/RV MI; if LV failure is intended, the EF and territory should be revised to reflect an anterior STEMI with more significant LV compromise.*

**f-004** [medium] Spirometry ordered and resulted during an acute exacerbation is not standard practice — _case-2 (Respiratory, Foundations)_
> "Spirometry (Pre- and Post-Bronchodilator)": "Pre-bronchodilator: FEV1 58% of predicted...Post-bronchodilator (albuterol 400 mcg): FEV1 improves to 76% of predicted...Findings confirm obstructive airflow pattern with reversibility, diagnostic of asthma."
*Formal spirometry is contraindicated or unreliable during an acute asthma exacerbation and is not performed in emergency/urgent care settings for active bronchospasm — it is an elective outpatient diagnostic tool used when the patient is stable. Replace spirometry with peak expiratory flow (PEF) measurement, which is the appropriate bedside tool during an acute exacerbation, and note that formal spirometry should be arranged as outpatient follow-up; this is a meaningful patient safety teaching point.*

**f-005** [medium] Moderate exacerbation SpO2 range in teaching point conflicts with case vitals — _case-2 (Respiratory, Foundations)_
> Teaching point: "Moderate asthma exacerbations present with SpO2 88–95%" ... Vitals: "spo2": 93
*The NAEPP/GINA classification defines moderate exacerbation SpO2 as ≥90% (often cited as 90–95%), and severe as <90%; the stated lower bound of 88% overlaps with the severe category. More importantly, the teaching point range of '88–95%' is internally inconsistent with standard guidelines — revise the lower bound to ≥90% for moderate severity to avoid teaching students an incorrect severity threshold that could affect real triage decisions.*

**f-008** [low] Non-contrast CT sensitivity for SAH cited incorrectly in case-3 teaching point — _case-2 (Respiratory, Foundations)_
> Case 3 teaching point: "Non-contrast head CT is the first-line test and is highly sensitive (>98%) within 6 hours of onset."
*Contemporary data (Perry et al., NEJM 2011; Sayer et al.) places non-contrast CT sensitivity for SAH within 6 hours at approximately 92–98% depending on the generation of scanner and radiologist expertise — citing '>98%' is at the optimistic ceiling of the evidence and may mislead students into over-relying on a negative CT to exclude SAH. Revise to 'approximately 93–98%' and reinforce that LP remains mandatory when clinical suspicion is high despite a negative CT.*

**f-015** [medium] CT Severity Index Grade D misapplied to interstitial edematous pancreatitis — _case-04 (Gastrointestinal, Foundations)_
> "CT with IV contrast demonstrates diffuse pancreatic edema with peripancreatic fat stranding and a small amount of peripancreatic fluid in the lesser sac, consistent with acute interstitial edematous pancreatitis (CT Severity Index Grade D)."
*The Balthazar CT Severity Index (CTSI) Grade D requires a single, ill-defined peripancreatic fluid collection in addition to pancreatic edema — Grade D is appropriate here only if the 'small amount of peripancreatic fluid' meets that threshold. However, the revised CTSI (MCTSI) is now preferred over the Balthazar CTSI and does not use letter grades; the case should either use MCTSI scoring terminology or explicitly justify the Grade D assignment with the Balthazar criteria (intrinsic pancreatic abnormality + one extrapancreatic fluid collection). Using 'Grade D' alongside language 'consistent with acute interstitial edematous pancreatitis' is misleading because Grade D/E on Balthazar implicitly signals more severe disease than pure interstitial edema, potentially confusing learners about severity stratification.*

**f-016** [high] Teaching point: lipase >3x ULN threshold stated as 180 U/L but ULN given is 60 U/L — _case-04 (Gastrointestinal, Foundations)_
> Teaching point: "a lipase level greater than 3 times the upper limit of normal (>180 U/L) is diagnostic in the right clinical context." Lab reference range: "referenceRange": "13-60", "unit": "U/L"
*Three times the stated upper limit of normal of 60 U/L equals 180 U/L, so the arithmetic is internally consistent; however, the ULN of 60 U/L is at the low end of commonly cited institutional ranges (many labs use 13–60, others use up to 160 U/L). The case should explicitly state the ULN used in this case's reference range (60 U/L) so the threshold is transparently derived (3 × 60 = 180 U/L), preventing learners at institutions with higher ULNs from misapplying a fixed 180 U/L cutoff as universal.*

**f-019** [medium] Teaching point cites ~85% hematuria rate — actual published rate is closer to 70–90% but varies significantly — _case-05 (Renal, Foundations)_
> Teaching point: "Gross or microscopic hematuria is present in ~85% of cases."
*The ~85% figure is widely cited but the published range spans 70–95% depending on stone location and timing of urinalysis; more importantly, the teaching point should note that absence of hematuria does NOT exclude urolithiasis (up to 15–30% of confirmed stone cases have no hematuria on UA), as this absence is a common student anchor error. Revise to: 'Hematuria (gross or microscopic) is present in approximately 75–85% of cases but its absence does not rule out urolithiasis.'*

**f-024** [medium] Teaching point states TSH has 'long half-life' — TSH half-life is short; it is the pituitary response lag that is long — _case-06 (Endocrine/Metabolic, Foundations)_
> Teaching point: "TSH should be rechecked 6-8 weeks after initiation or dose change as TSH has a long half-life and does not reflect immediate hormone status."
*TSH itself has a serum half-life of approximately 60–90 minutes, which is not long. The correct explanation is that the pituitary thyrotrophs require 4–6 weeks to equilibrate their TSH secretion in response to new circulating thyroid hormone levels — this is a kinetic feedback loop delay, not a TSH half-life issue. Revise to: 'TSH should be rechecked 6–8 weeks after initiation or dose change because the pituitary requires several weeks to equilibrate its TSH output in response to changes in circulating thyroid hormone levels.'*

**f-029** [medium] Monospot sensitivity range overstated for first week — _case-7 (Infectious Foundations)_
> "the heterophile antibody test (Monospot) is highly specific (>95%) but has variable sensitivity early in illness (as low as 70-80% in the first week)"
*Published data consistently show Monospot sensitivity is 25–50% in the first week of illness, rising to ~85% by week 3; stating '70-80%' in week 1 significantly understates the false-negative rate and could mislead students into over-relying on a negative Monospot early in disease.*

**f-030** [medium] Amoxicillin rash mechanism described inaccurately — _case-7 (Infectious Foundations)_
> "the mechanism is immune complex-mediated rather than IgE-mediated"
*The amoxicillin rash in EBV mononucleosis is not immune complex-mediated; the actual mechanism is not fully established but is thought to involve virus-altered immune responsiveness (activated T-lymphocytes reacting to drug hapten), not immune complex deposition — immune complex disease is associated with serum sickness-like reactions. Remove the mechanistic claim or replace it with 'the mechanism is not fully elucidated but is thought to be T-cell mediated and not IgE-mediated.'*

**f-031** [low] VCA IgG positive in acute EBV is clinically ambiguous without EBNA context — _case-7 (Infectious Foundations)_
> "VCA IgG": "Positive" ... "EBNA IgG (Nuclear Antigen)": "Negative"
*The combination of VCA IgG positive + EBNA IgG negative is correctly consistent with acute primary EBV infection (EBNA appears weeks to months after infection); however, VCA IgG can also be positive in past infection. A teaching note should explicitly state that VCA IgG alone does not confirm acuity — it is the VCA IgM positive / EBNA negative pattern together that indicates acute primary infection, to prevent students from misinterpreting a standalone VCA IgG positive as diagnostic of acute disease.*

**f-033** [medium] MCV of 79 is inconsistent with typical sickle cell disease (HbSS) — _case-8 (Hematologic/Oncologic Foundations)_
> "MCV": "79", "unit": "fL", "referenceRange": "80-100", "status": "low"
*Classic HbSS disease typically produces a normocytic anemia (MCV 80–100 fL) or even mild macrocytosis from reticulocytosis; a microcytic MCV of 79 fL suggests a concurrent iron deficiency or thalassemia trait and is not a typical feature of isolated HbSS. Since the case intends to teach pure SCD without complicating diagnoses, the MCV should be corrected to the normocytic range (e.g., 85–92 fL) to avoid misleading pattern recognition.*

**f-034** [medium] Dark urine darkest in mornings is incorrectly attributed in SCD hemolytic crisis — _case-8 (Hematologic/Oncologic Foundations)_
> Patient states: "the dark urine does seem worse in the mornings when I first wake up" — and this is not corrected or contextualized by grading or teaching points.
*Morning-predominant dark urine is the classic presentation of Paroxysmal Nocturnal Hemoglobinuria (PNH), not SCD hemolytic crisis; in SCD the dark urine (urobilinogenuria/hemoglobinuria) is not characteristically morning-predominant. This patient response actively teaches an incorrect disease-specific pattern and should be revised to remove the morning-predominant framing or a teaching point should flag this distinction to prevent students from anchoring on a PNH pattern.*

**f-039** [low] Unhappy triad description is anatomically outdated — _case-9 (Musculoskeletal Foundations)_
> Student reasoning: "which commonly occur together — this is sometimes called the 'unhappy triad'" — and this is not corrected in the grading feedback.
*The 'unhappy triad' (O'Donoghue's triad) classically described ACL + MCL + medial meniscus injury; contemporary biomechanical studies show the lateral meniscus is more commonly torn with ACL injuries than the medial meniscus, and the term 'unhappy triad' is considered outdated. Since the grading does not flag this misconception stated in the student's reasoning, a grading feedback note should correct this to prevent reinforcing an outdated anatomical teaching.*

**f-044** [high] Urine drug screen incorrectly lists acetaminophen as a detectable analyte — _case-11 (Toxicologic, Foundations)_
> "Urine Drug Screen": { "components": [ { "name": "Acetaminophen (urine screen)", "value": "Positive", "unit": "", "referenceRange": "Negative", "status": "abnormal" } ] }
*Standard urine drug immunoassay panels do not include acetaminophen; acetaminophen toxicity is confirmed via serum acetaminophen level, not urine screen. Remove acetaminophen from the UDS panel and note that the serum level (already ordered) is the correct confirmatory test, as including it here teaches students an incorrect diagnostic shortcut.*

**f-045** [medium] LFT elevation at 6h post-ingestion contradicts teaching point about Phase I timing — _case-11 (Toxicologic, Foundations)_
> Teaching point: "Early acetaminophen toxicity (0-24 hours) may present with only mild nausea and vomiting — LFT elevations (AST/ALT) typically appear in Phase II (24-72 hours)" versus lab results: "AST: 58 U/L [high]" and "ALT: 72 U/L [high]" at 6 hours post-ingestion.
*At 6 hours post-acute ingestion in a patient with no pre-existing liver disease, AST and ALT should be normal or minimally elevated; set both values to within normal limits (e.g., AST 32 U/L, ALT 38 U/L) to reinforce the case's own teaching point that early LFTs do not rule out significant toxicity and that trending is required.*

**f-046** [medium] Rumack-Matthew threshold stated incorrectly in lab reference range field — _case-11 (Toxicologic, Foundations)_
> "referenceRange": "Plotted at 6 hours post-ingestion: treatment line threshold is ~150 mcg/mL at 4h, ~75 mcg/mL at 8h (Rumack-Matthew nomogram; reference range is time-dependent — this value at 6h falls in the HIGH RISK treatment zone)"
*The standard Rumack-Matthew treatment line threshold at 4 hours is 150 mcg/mL, but at 6 hours it is approximately 100 mcg/mL (not ~75 mcg/mL which is the 8-hour value being mislabeled); correct the interpolated 6-hour threshold to ~100 mcg/mL and add a note that the reported value of 210 mcg/mL clearly exceeds this, placing the patient in the treatment zone.*

**f-048** [medium] Patient's pain localized to anatomic snuffbox — inconsistent with Colles' fracture, suggests scaphoid — _case-12 (Trauma, Foundations)_
> Patient response: "it's definitely more on the thumb side — right here, kind of in that little hollow area below the thumb. That spot is absolutely killing me, way worse than the rest of the wrist." Correct diagnosis: "Distal radius fracture (Colles' fracture)".
*Maximal tenderness in 'the little hollow area below the thumb' is the textbook description of anatomic snuffbox tenderness, which is the cardinal sign of scaphoid fracture — not Colles' fracture. Colles' fracture tenderness is diffuse over the dorsal distal radius. Revise the patient's pain localization response to describe dorsal distal wrist pain proximal to the wrist crease, and separately allow snuffbox tenderness only if the student directly palpates or asks about it, preserving scaphoid as a genuine differential rather than inadvertently pointing away from the confirmed diagnosis.*

### Improvement (13)

**f-006** [medium] Asthma case missing peak flow measurement harms severity-assessment learning — _case-2 (Respiratory, Foundations)_
> Teaching point: "A peak expiratory flow (PEF) <70% of predicted after initial bronchodilator therapy indicates a moderate exacerbation" ... Available imaging: ["Chest X-Ray", "ECG", "Spirometry (Pre- and Post-Bronchodilator)"] — no PEF listed in available labs or imaging.
*The case explicitly teaches PEF as the key bedside severity metric but provides no mechanism for students to order or interpret it; add PEF measurement to available tests with a result of approximately 55–65% of predicted (consistent with moderate severity) so students can practice the exact severity-scoring skill the teaching point describes.*

**f-012** [medium] STEMI case does not prompt or score failure to activate cath lab — the most critical action — _case-1 (Cardiovascular, Foundations)_
> Teaching point: "STEMI protocol activation (emergent PCI within 90 minutes of first medical contact) is the immediate required action when ST elevation meeting STEMI criteria is identified — this supersedes further diagnostic workup" ... grading dimensions: ["historyInterview", "testOrdering", "diagnosisAccuracy", "diagnosisCompleteness"] — no management or time-to-treatment dimension present.
*For a Foundations STEMI case where the primary teaching point explicitly states that cath lab activation supersedes all other workup, the absence of any graded management dimension means students are never evaluated on the single most important action; add a management or 'next step' dimension to the grading rubric, or at minimum include failure to note 'immediate PCI/cath lab activation' as a scored missedQuestion, to align assessment with the stated learning objective.*

**f-013** [low] diagnosisAccuracy penalizes omission of 'inferior' qualifier but score does not reflect this — _case-1 (Cardiovascular, Foundations)_
> diagnosisAccuracy feedback: "omitting the anatomic qualifier 'inferior' is a minor incompleteness at this difficulty level" ... diagnosisAccuracy score: 33 (out of what appears to be 35 max based on case-3 scoring 36/35+). correctDiagnosis: "ST-Elevation Myocardial Infarction (Inferior STEMI)"
*The feedback states the missing 'inferior' qualifier is 'minor at this difficulty level' yet the score is 33/35 — a 6% deduction — without explaining the point allocation rationale to the student; clarify in the feedback whether points were deducted for the missing qualifier and why (RV involvement changes management), so students understand exactly what drove the score, rather than receiving contradictory signals between the verbal feedback ('minor') and the numeric deduction.*

**f-018** [medium] Steatorrhea as hidden symptom is not clinically expected at 8 hours of acute pancreatitis — _case-04 (Gastrointestinal, Foundations)_
> hiddenSymptoms: "Patient admits to noticing pale, greasy-appearing stools on one occasion in the past month if asked about stool changes."
*Steatorrhea indicates chronic exocrine pancreatic insufficiency (EPI), not acute pancreatitis of 8-hour duration; presenting this as a hidden clue in an acute-pancreatitis Foundations case implies chronic/recurrent disease without establishing that context, potentially misleading students into conflating acute inflammation with EPI. Either remove this hidden symptom or add explicit case scaffolding indicating this patient has chronic underlying pancreatic disease, and update the teaching points to explain how steatorrhea distinguishes acute from chronic pancreatitis.*

**f-022** [medium] Urine Culture result available at time of initial workup — unrealistic for teaching stone management — _case-05 (Renal, Foundations)_
> testsOrdered includes "Urine Culture" in the available labs. Urine Culture result: "Growth": "No growth", "Colony Count": "<10,000 CFU/mL"
*Urine culture results are not available within the same ED visit timeframe as a stat UA — cultures typically take 24–48 hours. Displaying a final culture result ('No growth') as immediately available during the acute workup teaches incorrect expectations about diagnostic timelines. Either label this result as 'Pending — preliminary at 24 hours' or remove it from available immediate labs and note it as a follow-up result, which would also teach students the appropriate management decision window for empirical treatment while cultures are pending.*

**f-023** [medium] OCP use (hidden medication) not surfaced in grading despite clinical relevance to thyroid labs — _case-06 (Endocrine/Metabolic, Foundations)_
> hiddenHistory medications: "Oral contraceptive pill (ethinyl estradiol/levonorgestrel) — ongoing for 3 years." missedQuestions in grading: ["Are you currently taking any medications that could affect thyroid function, such as lithium, amiodarone, or iodine-containing supplements?", "Have you noticed any constipation..."]
*Oral estrogen (in OCPs) increases thyroid-binding globulin (TBG), which elevates total T4 and total T3 but does not affect free T4 or TSH — this is a high-yield clinical pearl that students at Foundations level should learn, particularly for a case with a young woman on an OCP. The missed-question feedback should explicitly include OCP use as a hidden medication to ask about, and the teaching points should note that OCP use can affect interpretation of total (not free) thyroid hormone levels.*

**f-027** [low] Normocytic anemia in hypothyroidism case without reticulocyte count limits learning value — _case-06 (Endocrine/Metabolic, Foundations)_
> CBC result: "Hgb": "11.2", "MCV": "88" (normocytic, status low). Teaching points do not address the anemia finding.
*Hypothyroidism can cause normocytic, microcytic (due to menorrhagia/iron deficiency), or macrocytic anemia (due to B12 deficiency or pernicious anemia, which co-associates with autoimmune thyroid disease). The normocytic anemia here is plausible but without a reticulocyte count, iron studies, or B12/folate in the available labs, students cannot distinguish the etiology. Either add iron studies or B12 to available labs, or add a teaching point explaining the multiple anemia mechanisms in hypothyroidism — the current setup surfaces an abnormal finding without giving students tools to interpret it fully.*

**f-038** [medium] HPI omits any painful crisis history, making SCD presentation atypical for learning — _case-8 (Hematologic/Oncologic Foundations)_
> "His symptoms began gradually without a clear precipitant" ... "He has no prior similar episodes and has not taken any new medications."
*For a Foundations-level SCD teaching case, the absence of any vaso-occlusive crisis history removes the most recognizable diagnostic anchor for students; including at least one prior episode of bone pain crisis or dactylitis in childhood within the HPI (rather than hiding it entirely) would reinforce the classic SCD pattern without giving away the diagnosis, improving educational scaffolding without reducing diagnostic challenge.*

**f-041** [medium] No physical exam data provided in a musculoskeletal case where exam is primary diagnostic tool — _case-9 (Musculoskeletal Foundations)_
> Student notes: "I should probably ask my attending... I also wasn't 100% sure whether to order the MRI right away... I'd want to discuss with the attending what the physical exam findings (Lachman test, anterior drawer sign, McMurray's) would add before imaging, since I know those are really important for this diagnosis and I haven't been shown any physical exam data yet."
*For a musculoskeletal case at any level, the absence of physical examination findings (Lachman test, anterior drawer, joint effusion, range of motion) creates a fundamental gap in clinical reasoning scaffolding; the case should include a structured physical exam section with the ability for the student to request specific maneuvers and receive results, since in ACL diagnosis the physical exam often precedes and guides imaging decisions.*

**f-042** [low] CRP/ESR ordering rewarded but adds no diagnostic value in clear trauma presentation — _case-9 (Musculoskeletal Foundations)_
> testOrdering feedback: "CRP/ESR were appropriately ordered to rule out inflammatory/infectious causes of joint swelling" with score 24/24 (full marks).
*Awarding full marks for CRP/ESR in a textbook traumatic ACL case with rapid hemarthrosis and no fever conflates defensive ordering with high-value ordering; the teaching opportunity is to distinguish when inflammatory markers add value (septic arthritis, gout) from when mechanism and presentation make them low-yield — a partial deduction with feedback would better teach clinical value-based test ordering.*

**f-051** [medium] Passive suicidal ideation present in hidden history but case scores student down for not asking — _case-10 (Psychiatric, Foundations)_
> hiddenHistory: "He explicitly denies current suicidal ideation but admits to passive thoughts that 'life feels pointless' which he has not acted upon." Grading missedQuestions: "Do you have any thoughts of suicide, self-harm, or feelings that life is not worth living? (Safety-critical; directly impacts management including level of care and monitoring frequency)"
*The hidden history already contains clinically significant passive SI content that would only surface if the student asks; make this discoverable by including a direct prompt opportunity in the patient's unprompted speech (e.g., the patient volunteers 'I just don't see the point sometimes') so that the grading penalty for missing the SI screen is clearly tied to a tangible elicitation gap, not to a fact the student had no cue to pursue.*

**f-052** [medium] NAC initiation timing not reinforced in grading despite being the highest-stakes management decision — _case-11 (Toxicologic, Foundations)_
> Teaching point: "N-acetylcysteine (NAC) is most effective when given within 8 hours of ingestion" and student reasoning: "A level drawn at or after 4 hours post-ingestion will be plotted on the Rumack-Matthew nomogram to determine whether he falls in the treatment zone for NAC." Grading feedback makes no mention of whether empiric NAC should be started before nomogram results.
*Add a grading dimension or missed-question entry explicitly evaluating whether the student recognized that empiric NAC initiation is appropriate while awaiting serum acetaminophen results given the confirmed timing (6 hours, window narrowing toward the 8-hour efficacy cutoff); this is the single highest-stakes management decision in the case and its omission from grading is a meaningful learning gap.*

**f-053** [low] Labs available include Coagulation Panel and CMP but no clinical rationale is provided or penalized — _case-12 (Trauma, Foundations)_
> availableLabs: ["CBC", "BMP", "Coagulation Panel", "Comprehensive Metabolic Panel"] in a case of isolated closed orthopedic trauma with no operative planning, anticoagulation history, or bleeding concern. Student reasoning: "Labs feel largely unnecessary here unless there's a plan for conscious sedation for reduction."
*Either remove these labs from the available panel to reduce cognitive noise in a straightforward trauma case, or keep them and add explicit grading feedback penalizing unnecessary lab ordering (currently the feedback rates labs as 'not harmful' without teaching the cost of over-testing), reinforcing resource stewardship as a learning objective.*

## Study-Tab Findings

### dashboard tab (9 findings)

**f-200** [high/inconsistency] Weekly goal shows 58 cases completed against a goal of 5
> <span class="dx-weekly-done" style="color:var(--green)">58</span><span class="dx-weekly-sep"> / <!-- -->5</span><span class="dx-weekly-label"> cases — goal met! 🎉</span>
*The completed count (58) and the goal (5) are almost certainly sourced from different data fields — likely total all-time cases vs. the weekly goal target. Verify the weekly completion counter is scoped to the current week's activity and not the cumulative case count.*

**f-201** [high/inconsistency] Recommended next case targets highest-scoring system, not weakest
> "Your Hematologic / Oncologic avg is 83." ... Focus areas list: Hematologic / Oncologic 83%, Endocrine / Metabolic 85%, Neurologic 87%
*The recommendation engine appears to be routing users to the system with the highest score (83% is the top of the listed focus areas), which is the opposite of spaced-repetition / weakness-targeting logic. The card should recommend the lowest-scoring system to direct study effort where it is most needed; verify the sort/selection logic.*

**f-202** [medium/inconsistency] Focus Areas card label contradicts content — all systems show green/strong scores
> <div class="dx-card-header">... Focus areas</div> ... scores: 83%, 85%, 87% (all rendered in green with rgba(107,184,122,0.15) background)
*A 'Focus areas' card implies these are weak areas needing attention, but all three entries are styled green (strong performance) with scores 83–87%. Either rename the card to 'Top systems' / 'Recent systems', or populate it with genuinely low-scoring systems styled in amber/red to direct study effort correctly.*

**f-203** [medium/inconsistency] Recent activity shows high scores (90–93%) alongside 'loss' penalty labels simultaneously
> <span class="dx-recent-score" style="color:var(--green)">90<span class="dx-score-pct">%</span></span><span class="dx-recent-loss has-loss">−31% Diagnosis Completeness</span>
*A −31% penalty in 'Diagnosis Completeness' on a case scored 90% overall is confusing without context: trainees may not understand how a large sub-score penalty still yields a high total, or whether these are additive, weighted, or normalized. Add a tooltip or brief inline label explaining the scoring model (e.g., 'sub-score deduction within weighted total') so the juxtaposition does not mislead learners about their actual performance.*

**f-204** [medium/improvement] Onboarding modal appears over a fully-populated dashboard, implying returning user
> <div class="dx-modal-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to MedTrainer"> ... <h2 class="dx-onboarding-step-title">Interview your patient</h2>
*The welcome/onboarding modal is rendered even though the dashboard contains extensive history (8-day streak, 58+ cases, recent activity from May 16). Showing first-run onboarding to a user with an established record is disorienting and wastes time. Gate the modal on a persisted 'onboarding_complete' flag and suppress it for users who already have case history.*

**f-205** [medium/improvement] Recommended next case difficulty label 'Clinical' is undefined and unexplained
> <h2 class="dx-next-headline">Hematologic / Oncologic<!-- --> <span class="dx-next-tier clinical">Clinical</span></h2>
*'Clinical' appears as a difficulty tier but the dashboard provides no legend or tooltip defining the difficulty scale (e.g., Foundations → Clinical → Advanced). Without knowing the progression, learners cannot self-assess whether the recommended difficulty is appropriate for their level; add a visible difficulty key or inline tooltip.*

**f-206** [medium/improvement] Recent activity loss labels show only the sub-score name with no actionable guidance
> <span class="dx-recent-loss has-loss">−31% Diagnosis Completeness</span> ... <span class="dx-recent-loss has-loss">−17% History &amp; Interview</span>
*Displaying a deduction label (e.g., '−31% Diagnosis Completeness') without a link to review material or a definition of that sub-score category misses a core learning opportunity. Each loss label should either link directly to the case debrief at that sub-score section or show a micro-tip so the trainee knows what to study next.*

**f-207** [low/improvement] Streak counter grammatical pluralization logic is over-engineered and fragile
> 🔥 <!-- -->8<!-- --> day<!-- -->s<!-- --> streak
*The streak text is split into separate React fragments ('day' + 's') for pluralization, but the 's' is rendered unconditionally regardless of value. Consolidate to a single string ('8 days streak') using a standard pluralization helper to avoid future off-by-one bugs when the value is 1.*

**f-208** [low/bug] Onboarding modal close button aria-label says 'Skip onboarding' but visible Skip button also exists
> <button class="dx-modal-close" aria-label="Skip onboarding">×</button> ... <button class="dx-chip" style="font-size: 12px; color: var(--muted);">Skip</button>
*Two distinct controls ('×' close button and 'Skip' chip) both perform the skip action but have different accessible labels, creating redundancy and potential screen-reader confusion. Consolidate into a single skip action or differentiate their behaviors (e.g., close = dismiss temporarily, skip = mark complete permanently) and update aria-labels accordingly.*

### focus tab (7 findings)

**f-210** [medium/bug] SSR/client hydration mismatch causes unpredictable UI on first render
> "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up." ... color: "#b43b3b" vs color: "rgb(180, 59, 59)" ... fontFamily: "JetBrains Mono, monospace" vs font-family: "\"JetBrains Mono\", monospace"
*The score/priority badge spans are being rendered with inline styles that differ between SSR and CSR (CSS string vs JS object form). Consolidate all dynamic inline styles into a single client-side rendering path or use CSS variables/classes so the server and client always emit identical markup; the hydration error explicitly states 'This won't be patched up', meaning users may see the SSR version frozen in place.*
File: `app/focus/page.tsx`

**f-211** [medium/bug] One progress bar renders at width 0% despite its item having a color/label
> width: "0%" ... background: "#2d7a4a" (LOW color) ... appearing in the same progress-bar card section where other items show 22%–37%
*The sixth sub-topic bar in the second card (LOW-colored item) has a computed width of 0%, indicating its underlying score or attempt count is 0 but the item is still rendered. Either suppress items with no data or ensure the width calculation uses a fallback non-zero minimum so the bar is visually distinguishable from a missing value.*
File: `app/focus/page.tsx`

**f-212** [medium/inconsistency] Score severity label 'LOW' used for green color but implies poor performance
> color: "#2d7a4a" ... background: "var(--confirmed-bg)" ... +  LOW  (scores 84, 85, 89, 92 all tagged 'LOW' in green)
*The label 'LOW' universally connotes low/poor in a medical education context (low score = needs work), but here it is rendered in green and paired with scores ≥84, suggesting it means 'low priority' or 'low gap'. Rename the label to 'STRONG', 'GOOD', or 'ON TRACK' to prevent learners from misreading green-colored 'LOW' as a low score requiring remediation.*
File: `app/focus/page.tsx`

**f-213** [medium/inconsistency] Two distinct cards both show identical 'MED / Clinical' items with score 68
> +  68  ...  MED  ...  Clinical  (appears twice consecutively in the hydration diff, both with color "#b8862e" and background "var(--caution-bg)")
*Two separate row entries are rendered with the exact same score (68), priority (MED), and category (Clinical). Verify the data source for deduplication; if these are genuinely different topics that happen to share the same score, ensure their topic name labels are distinct and visible so learners can tell them apart.*
File: `app/focus/page.tsx`

**f-214** [medium/improvement] All sidebar navigation items are disabled before a case is generated
> <button disabled="" class="... cursor-not-allowed text-ink-tertiary/50"><span>History of Present Illness</span></button> ... <button disabled="" ... ><span>Review of Systems</span></button> ... all six nav steps are disabled
*Displaying six permanently disabled steps with no explanation of why they are locked or how to unlock them gives learners no actionable guidance. Add a brief inline tooltip or placeholder state message (e.g., 'Generate a case to unlock') on hover so learners understand the workflow instead of assuming the feature is broken.*
File: `app/focus/page.tsx`

**f-215** [low/improvement] Category tag color inconsistency: 'Foundations' tags render in dark ink but 'Clinical' tags render in amber
> color: "#131c28" ... background: "var(--surface3)" ... +  Foundations  vs  color: "#b8862e" ... background: "var(--surface3)" ... +  Clinical
*The 'Foundations' category badge uses dark neutral ink (#131c28) while 'Clinical' uses amber (#b8862e), making 'Clinical' appear to be a warning state rather than a neutral category label. Use a consistent neutral ink color for all category name badges and reserve amber/red exclusively for priority/severity indicators.*
File: `app/focus/page.tsx`

**f-216** [low/improvement] Difficulty tooltip descriptions contain inconsistent timer information vs. 'Foundations' which has no timer
> "Foundations — Common textbook diagnoses, classic presentations, no timer. Output: diagnosis only." ... "Clinical — Moderate diagnoses, 1-2 atypical features, 22-minute timer. Output: diagnosis + reasoning." ... "Advanced — Rare/complex diagnoses, multiple red herrings, 15-minute timer. Output: SOAP note + oral presentation."
*The timer escalation (no timer → 22 min → 15 min) is counterintuitive because the hardest level has a shorter timer than the intermediate level; if intentional, add a brief rationale (e.g., 'simulating time-pressured attending rounds') so learners understand the design rather than assuming a data entry error.*
File: `app/focus/page.tsx`

### help tab (9 findings)

**f-218** [high/inconsistency] Foundations rubric points sum to 100 but categories are internally inconsistent with stated totals
> History & Interview /24 pts, Test Ordering /24 pts, Diagnosis Accuracy /36 pts, Diagnosis Completeness /16 pts — 24+24+36+16 = 100 ✓. Clinical & Advanced: History /20 pts, Test Ordering /20 pts, Diagnosis Accuracy /30 pts, Diagnosis Completeness /15 pts, Clinical Reasoning /15 pts — 20+20+30+15+15 = 100 ✓. However the efficiency note reads: 'Efficiency (/10, shown separately)... is not included in the /100 score.' Yet the FAQ entry states: 'STEMI and NSTEMI... caps Diagnosis Accuracy at approximately 44% of its dimension (16/36 at Foundations, 13/30 at Clinical/Advanced)'. 13/30 = 43.3% but 16/36 = 44.4% — these are not equivalent percentages and the FAQ implies a single consistent 44% cap across both tiers, which is arithmetically false for one of them.
*Express the partial-credit cap consistently: either use a single percentage ('approximately 43–44%') or state the exact point values per tier (16/36 at Foundations; 13/30 at Clinical/Advanced) without asserting they are equal.*
File: `app/help/page.tsx`

**f-219** [high/medical_inaccuracy] STEMI/NSTEMI FAQ conflates ECG finding with cath-lab activation as equivalent discriminators
> "STEMI and NSTEMI are not clinically equivalent — they differ in ECG findings, cath-lab activation, and management."
*The statement that they 'differ in cath-lab activation' is partially misleading: high-risk NSTEMI (e.g., ongoing ischemia, cardiogenic shock) also requires urgent/emergent catheterization per ACC/AHA guidelines — the key distinction is mandatory immediate activation (STEMI) vs. risk-stratified timing (NSTEMI). Revise to: 'STEMI mandates immediate cath-lab activation; NSTEMI management is risk-stratified and may also require early invasive strategy.'*
File: `app/help/page.tsx`

**f-220** [medium/medical_inaccuracy] FAQ states 'pneumothorax' vs 'spontaneous pneumothorax' omission is still marked correct — clinically inaccurate
> "If you named the correct pathological entity but omitted a qualifying modifier (e.g. 'pneumothorax' instead of 'spontaneous pneumothorax'), that's still marked correct."
*Pneumothorax has clinically distinct subtypes (spontaneous primary, spontaneous secondary, tension, traumatic, iatrogenic) with different management pathways; accepting 'pneumothorax' as equivalent to 'spontaneous pneumothorax' when the case context clearly specifies etiology trains learners to under-specify diagnoses. At minimum, qualify this example: 'modifier omission is accepted only when the qualifier does not change management' or choose a less clinically consequential example.*
File: `app/help/page.tsx`

**f-221** [medium/inconsistency] Diagnosis Completeness description contradicts itself between tier descriptions
> Foundations Diagnosis Completeness: "At Foundations, a correct core diagnosis earns full or near-full marks — you are not required to add etiology, staging, or severity details." Clinical & Advanced Diagnosis Completeness: "At Clinical, a correct core diagnosis earns 10–15. At Advanced, etiology, staging, or complication details are expected." — The Clinical/Advanced rubric row is shared for both Clinical and Advanced difficulty in a single /15 pts entry, yet it conflates two meaningfully different expectations into one dimension score line, implying the same 10–15 range applies to both when Advanced demands more specificity.
*Split the Diagnosis Completeness descriptor into separate Clinical (core diagnosis sufficient for near-full marks) and Advanced (etiology/staging/complications required for full marks) rows, or add a parenthetical clarifying that the 10–15 range maps differently: 'Clinical: 13–15 for core dx; Advanced: 10–12 for core dx, 13–15 requires full specificity.'*
File: `app/help/page.tsx`

**f-222** [medium/inconsistency] Free plan feature list in Plans card contradicts Free plan feature list in FAQ
> Plans card Free tier: "Core scorecard (5 dimensions + score)". FAQ entry: "Free: 2 cases per day, core scorecard (dimensions + score)." — The Plans card specifies '5 dimensions' explicitly; the FAQ omits the count. More critically, the Foundations rubric has only 4 dimensions, while Clinical/Advanced has 5. Calling the Free scorecard '5 dimensions' is wrong for Foundations-level cases.
*Replace '5 dimensions' with 'scorecard dimensions + score (count varies by difficulty level)' in both the Plans card and the FAQ, or explicitly note '4 dimensions at Foundations, 5 at Clinical/Advanced.'*
File: `app/help/page.tsx`

**f-223** [medium/inconsistency] Recommendation algorithm formula uses undefined variable 'case-count factor' in FAQ vs. defined '1.2×' in algorithm card
> Algorithm card: "urgency = (100 − avg_score) × (1.2 if only 1 case, else 1.0)". FAQ: "urgency = (100 − avg score) × case-count factor. Single-case systems get a 1.2× case-count factor because one data point is less reliable." — The FAQ paraphrases the formula with the undefined token 'case-count factor' and uses 'avg score' (no underscore) inconsistently with the code-styled 'avg_score' in the algorithm card, creating ambiguity about whether multi-case systems receive a factor of 1.0 (i.e., no multiplier) or some other value.
*Make the FAQ formula identical to the algorithm card formula verbatim, or explicitly state 'else 1.0 (no multiplier)' in the FAQ to confirm multi-case systems are unweighted.*
File: `app/help/page.tsx`

**f-224** [medium/improvement] Efficiency score (/10) is described only in a footnote with no rubric row, harming learner transparency
> "Efficiency (/10, shown separately): At Clinical and Advanced difficulty, a timer tracks how quickly you complete the case. Efficiency is displayed as a separate /10 indicator on the scorecard and is not included in the /100 score."
*Add Efficiency as a named rubric row in the Clinical & Advanced section (even if marked 'shown separately, not in /100') so learners can see at a glance all graded components; the current footnote placement means learners may not realize time is being measured until they see the scorecard post-case, which can bias study behavior.*
File: `app/help/page.tsx`

**f-225** [low/improvement] No explanation of what 'Foundations' difficulty entails clinically, leaving learner unable to self-select
> "Foundations — 4 categories, 100 pts total" and "Clinical & Advanced — 5 categories, 100 pts total" — neither the scoring section nor any FAQ entry describes what case characteristics distinguish Foundations from Clinical from Advanced (e.g., common vs. rare diagnoses, number of distractors, availability of results, ambiguity level).
*Add a brief difficulty descriptor paragraph or tooltip definition for each tier so learners can understand which level matches their training stage (e.g., 'Foundations: classic presentations, common diagnoses, all requested tests returned; Advanced: atypical presentations, rare diagnoses, some tests withheld').*
File: `app/help/page.tsx`

**f-226** [low/improvement] Pass/partial/fail thresholds (≥75, 60–74, <60) are not explained in relation to any medical competency standard
> "Correct ≥ 75", "Partial 60 – 74", "Incorrect < 60"
*Add a one-sentence rationale for the chosen thresholds (e.g., whether they are arbitrary platform choices or mapped to USMLE/NBME passing standards) so learners can calibrate the clinical significance of their scores rather than treating them as arbitrary cutoffs.*
File: `app/help/page.tsx`

### history tab (10 findings)

**f-228** [high/inconsistency] Score math contradiction: 19+24+36+11=90 but scorecard shown as 90%
> History & Interview: 19/24, Test Ordering: 24/24, Diagnosis Accuracy: 36/36, Diagnosis Completeness: 11/16 — sum = 90/100. Score displayed: '90%'. This arithmetic happens to work out here, but the Diagnosis Accuracy subscore alone is 36/36 points and Diagnosis Completeness is 11/16, yet the feedback text says 'The core diagnosis is named correctly with supporting qualifiers; at Foundations level this is fully complete' while awarding only 11/16 — contradicting the statement of full completeness.
*Either the Diagnosis Completeness narrative ('at Foundations level this is fully complete') must be corrected to match the partial score awarded (11/16 = 68.75%), or the score should be 16/16 if the rubric truly considers it fully complete at Foundations level. The contradictory message will confuse learners about what they lost points for.*
File: `app/history/page.tsx`

**f-229** [medium/medical_inaccuracy] ABG listed as confirmatory test for asthma exacerbation diagnosis
> Test Ordering feedback: 'CBC with eosinophils, serum IgE, ABG, spirometry with pre/post-bronchodilator, and chest X-ray all directly confirmed the diagnosis and severity of the exacerbation.'
*ABG does not confirm the diagnosis of asthma; it assesses severity and guides ventilatory management (e.g., rising PaCO2 signals impending respiratory failure). Revise the feedback to state ABG 'informed severity assessment' rather than 'confirmed the diagnosis,' to avoid teaching learners that ABG is a diagnostic test for asthma.*
File: `app/history/page.tsx`

**f-230** [high/inconsistency] Result badge 'Correct' on STEMI case where student omitted localisation
> Row session-2a3757a8: Your Diagnosis = 'STEMI (ST-Elevation Myocardial Infarction)' vs Correct Diagnosis = 'ST-Elevation Myocardial Infarction (Inferior STEMI)'. Badge shown: 'Correct'. Row session-74daa201: Your Diagnosis = 'ST-Elevation Myocardial Infarction (STEMI)' vs Correct Diagnosis = 'Acute ST-Elevation Myocardial Infarction (Inferior STEMI)'. Badge shown: 'Correct'.
*Missing localisation of STEMI (Inferior vs Anterior vs Lateral) has direct management implications (e.g., right-sided leads, avoiding nitrates in inferior STEMI with RV involvement). The result badge should be 'Partial' rather than 'Correct' when a clinically significant qualifier present in the canonical answer is absent from the student's diagnosis, consistent with how the asthma severity qualifier was handled in the Diagnosis Completeness rubric.*
File: `app/history/page.tsx`

**f-231** [medium/inconsistency] Filter chip 'Clinical' missing case count unlike all other difficulty chips
> 'All (50)', 'Foundations (47)', 'Clinical' [no count], 'Advanced (3)'
*Add the case count to the 'Clinical' chip (e.g., 'Clinical (0)') so the display is consistent with all other difficulty-level chips and learners can immediately understand why selecting it would yield no results.*
File: `app/history/page.tsx`

**f-232** [medium/inconsistency] Level badge truncated to 'Foun' — label is ambiguous without tooltip
> <span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; color: var(--green); background: var(--border);">Foun</span>
*Display the full label 'Foundations' or at minimum add a title/aria-label tooltip attribute so screen readers and learners hovering the badge understand the difficulty tier; 'Foun' could be misread as 'Found' or be meaningless to new users.*
File: `app/history/page.tsx`

**f-233** [medium/improvement] Notes textarea has no save mechanism — input will be silently lost on navigation
> <textarea class="dx-notes-textarea" placeholder="Add notes about this case…" rows="3"></textarea> — no save button, no autosave indicator, no dirty-state warning.
*Add either an explicit 'Save note' button with confirmation or an autosave-on-blur pattern with a visible 'Saved' indicator; without this, any text a learner types is permanently lost when they collapse the row or navigate away, which actively discourages the reflective note-taking the feature is designed to support.*
File: `app/history/page.tsx`

**f-234** [medium/improvement] 'Questions: 3' metadata is misleadingly sparse — number alone is uninterpretable
> <span>Time: 6m 11s</span><span>Questions: 3</span>
*Clarify what 'Questions: 3' means (history questions asked by the trainee, or MCQ items answered, or clarifying questions to the patient); without context this number has no actionable meaning for a learner reviewing their performance and could be mistaken for a trivially small question count indicating poor history-taking.*
File: `app/history/page.tsx`

**f-235** [medium/inconsistency] Recent trend stat '-1 pts' uses 'pts' while all scores display as percentages ('%')
> Summary card: 'Recent trend' value = '-1 pts'. Score column: '90<span ...>%</span>', '93<span ...>%</span>'
*Use consistent units — if scores are displayed as percentages, the trend should read '-1%' (or '-1 pp') rather than '-1 pts', which implies a raw point scale and will confuse learners trying to interpret their trajectory.*
File: `app/history/page.tsx`

**f-236** [low/improvement] Page subtitle claims 'Last 50 completed cases' but all 50 cases are shown — no pagination or load-more
> <p style="margin: 4px 0px 0px; font-size: 13px; color: var(--muted);">Last 50 completed cases</p> … <div style="font-size: 22px; font-weight: 700; …">50</div>
*If the user has exactly 50 or fewer cases, the subtitle is accurate but implies a hard cap that silently hides older cases once the total exceeds 50; add a 'Load more' control or indicate total case count (e.g., 'Showing 50 of 50 cases') so learners know whether historical data is being truncated.*
File: `app/history/page.tsx`

**f-237** [low/improvement] Bookmarked filter chip is isolated from difficulty/system/score chip rows — inconsistent grouping
> <button class="dx-chip">☆ Bookmarked</button> is placed inline with the search input, while all other filter chips are in separate <div class="dx-filter-chips"> rows.
*Move the 'Bookmarked' chip into its own filter-chips row consistent with the other filter groups, or keep it with search but visually separate it with a divider so learners understand it operates as a filter rather than a search modifier.*
File: `app/history/page.tsx`

### progress tab (13 findings)

**f-239** [high/inconsistency] Avg Score (88) and Correct Rate (94%) are statistically implausible together
> "Avg Score" value: "88" and "Correct Rate" value: "94%"
*If 'Correct Rate' measures binary correct/incorrect diagnoses and 'Avg Score' measures a 0-100 rubric, a 94% correct rate paired with only an 88 average score implies consistent partial-credit losses on 'correct' cases — this relationship is never explained to the learner and the two metrics appear to measure the same thing differently, causing confusion. Add a tooltip or legend clarifying exactly what each metric measures and how they differ.*
File: `app/progress/page.tsx`

**f-240** [high/inconsistency] Total Cases (65) does not match sum of per-system case counts (60)
> "Total Cases" stat card value: "65"; Performance Breakdown rows: Cardiovascular=10, Respiratory=5, Neurologic=5, Gastrointestinal=5, Renal=5, Endocrine/Metabolic=5, Infectious=5, Hematologic/Oncologic=5, Musculoskeletal=5, Toxicologic=5, Psychiatric=5, Trauma=5 — sum = 60
*Reconcile the header stat with the per-system table so they sum correctly; either 5 cases are missing a system category in the table or the header stat is wrong. This directly undermines learner trust in their own performance data.*
File: `app/progress/page.tsx`

**f-241** [medium/inconsistency] Cardiovascular shows 'Clinical' score dashes but has 10 cases vs all others at 5
> Cardiovascular row: "<span class=\"dx-perf-score\" style=\"color: var(--muted);\">—</span>" in the Clinical column, yet "<span class=\"dx-perf-count\">10</span>" — every other system with 5 cases also shows '—' in Clinical, suggesting the dash means 'no data at this difficulty level', but with 10 cases it is more likely that some Clinical-level cases exist and the data is missing rather than truly absent.
*Verify whether Cardiovascular cases include any 'Clinical' difficulty entries; if so, populate the score. If the platform genuinely has no Clinical-level cardiovascular cases despite the larger case count, add a tooltip explaining why the cell is empty.*
File: `app/progress/page.tsx`

**f-242** [medium/inconsistency] All 11 non-Cardiovascular systems show identical '—' pattern for Clinical and Advanced columns regardless of case count
> Every row except Cardiovascular: Clinical column = "<span class=\"dx-perf-score\" style=\"color: var(--muted);\">—</span>", Advanced column = "<span class=\"dx-perf-score\" style=\"color: var(--muted);\">—</span>"
*It is statistically implausible that 60 cases across 11 systems produced zero Clinical or Advanced difficulty attempts. This pattern strongly suggests stub/seed data that was never replaced with real per-difficulty breakdowns. Replace with real data or clearly label columns as 'coming soon' to avoid misleading learners about their difficulty-level performance.*
File: `app/progress/page.tsx`

**f-243** [medium/inconsistency] Nine of twelve systems show identical Avg and Foundations scores (e.g., Respiratory 89/89, Renal 89/89)
> Respiratory: Avg="89", Foundations="89"; Renal: Avg="89", Foundations="89"; Gastrointestinal: Avg="89", Foundations="89"; Infectious: Avg="89", Foundations="89"; Psychiatric: Avg="89", Foundations="89"; Trauma: Avg="89", Foundations="89"; Musculoskeletal: Avg="88", Foundations="88"; Toxicologic: Avg="88", Foundations="88"; Neurologic: Avg="87", Foundations="87"
*When Avg equals Foundations exactly for every system that has only one difficulty level populated, it confirms the other difficulty columns contain no data and the Avg is simply a copy of Foundations. This is accurate but should be communicated to the learner (e.g., 'All attempted cases were Foundations level') rather than presenting three separate columns that appear to be independent metrics.*
File: `app/progress/page.tsx`

**f-244** [medium/bug] Sort controls on Performance Breakdown table header are non-functional (no interaction logged)
> "<span class=\"dx-perf-th sortable\">Cases ↓</span>" — column headers carry class 'sortable' and one shows a sort arrow '↓', but the interaction log is empty: "interactionLog": []
*The 'sortable' class and the '↓' indicator imply clicking a header re-sorts the table; with no interactions logged this cannot be confirmed as working. Instrument and verify the sort handlers; if sorting is unimplemented, remove the 'sortable' class and arrow glyph to avoid false affordance.*
File: `app/progress/page.tsx`

**f-245** [medium/bug] Only 'Cases' column shows a sort-direction arrow; other sortable columns show no direction indicator
> "<span class=\"dx-perf-th sortable\">System</span>", "<span class=\"dx-perf-th sortable\">Cases ↓</span>", "<span class=\"dx-perf-th sortable\">Avg</span>", "<span class=\"dx-perf-th sortable\">Foundations</span>", "<span class=\"dx-perf-th sortable\">Clinical</span>", "<span class=\"dx-perf-th sortable\">Advanced</span>"
*All six columns carry the 'sortable' class but only 'Cases' has a direction arrow '↓', making it unclear whether the table is currently sorted by Cases descending or whether the arrow is decorative. Add/remove directional arrows dynamically on all sortable columns to reflect the active sort state.*
File: `app/progress/page.tsx`

**f-246** [medium/improvement] Page heading duplicates 'over time' making the subtitle redundant and wasting space
> "<h1 class=\"heading-display text-[22px]\"><span class=\"heading-accent\">Progress</span> over time</h1><p style=\"margin:4px 0 0;font-size:13px;color:var(--muted)\">Your learning trajectory over time</p>"
*The h1 reads 'Progress over time' and the subtitle reads 'Your learning trajectory over time' — both phrases communicate the same idea. Replace the subtitle with actionable context such as the date range covered or the number of days tracked, which would add genuine informational value.*
File: `app/progress/page.tsx`

**f-247** [medium/improvement] No date range selector or time filter for charts, making trend charts uninterpretable for learners with many cases
> "<div class=\"dx-card-header\" style=\"display: flex; align-items: center; justify-content: space-between;\"><span>Score Over Time</span>" — no date range control, filter, or zoom control is present anywhere in the HTML
*Add a time-range control (e.g., Last 30 days / Last 3 months / All time) so learners can isolate recent performance trends from historical data; without this, a learner who has completed 65+ cases cannot meaningfully interpret the trend line.*
File: `app/progress/page.tsx`

**f-248** [medium/improvement] No definition of 'Avg Score' scale provided — learners cannot interpret whether 88 is good or poor
> "<div class=\"dx-stat-label\">Avg Score</div><div class=\"dx-stat-value\" style=\"color: var(--green);\">88</div>"
*Add a tooltip or label indicating the scoring scale (e.g., 'out of 100') and the thresholds used to determine green/yellow/red coloring, so learners can contextualise their performance correctly.*
File: `app/progress/page.tsx`

**f-249** [medium/improvement] No drill-down from Performance Breakdown table rows to the underlying cases
> "<div class=\"dx-perf-row\"><span class=\"dx-perf-system\">Cardiovascular</span><span class=\"dx-perf-count\">10</span>..." — rows are plain div elements with no href, button, or interactive role
*Make each system row clickable to navigate to a filtered Case History view showing only the cases for that system, which is the primary way a learner would act on this data to review weak areas.*
File: `app/progress/page.tsx`

**f-250** [low/improvement] Avg Time stat (7m 44s) has no context or benchmark, making it unactionable
> "<div class=\"dx-stat-label\">Avg Time</div><div class=\"dx-stat-value\" style=\"color:var(--muted)\">7m 44s</div>"
*Display a platform-average or recommended target time alongside the learner's time (e.g., 'Platform avg: 9m 12s') so the metric has comparative meaning and learners can assess whether their pace indicates rushing or appropriate clinical deliberation.*
File: `app/progress/page.tsx`

**f-251** [low/improvement] Canvas-based charts have no accessible text alternative for screen readers
> "<canvas width=\"1122\" height=\"240\" style=\"display: block; box-sizing: border-box; height: 240px; width: 1122px;\"></canvas>" and "<canvas width=\"1122\" height=\"280\" ...></canvas>" — no aria-label, role, or fallback content inside either canvas element
*Add aria-label attributes describing each chart's purpose and key values (e.g., 'Score over time chart: scores ranging from X to Y across 65 cases') or provide a visually-hidden data table as a fallback to meet WCAG 2.1 non-text content requirements.*
File: `app/progress/page.tsx`

### review tab (9 findings)

**f-253** [high/inconsistency] Accuracy stat (92%) contradicts case-level data (11/12 = 91.7%, rounded 92%) but Score Trend shows Hematologic case as 'incorrect' yet Systems table shows 0% accuracy for that system — overall accuracy should be 91.7%, not 92% if only 11/12 correct; more critically, 'Avg score' of 90/100 is inconsistent with the visible per-case scores
> Header stat: 'Accuracy (dx correct)' shows '92%'. Score Trend circle tooltip: 'Hematologic / Oncologic · Foundations — Score 72 (incorrect)'. Systems table: 'Hematologic / Oncologic' Foundations cell shows '0%×1'. Avg score stat shows '90/100'. Individual scores from tooltips: 91, 93, 93, 90, 72, 92, 92, 93, 93, 93, 90, 93 — sum = 1081, mean = 90.08, rounds to 90. But the By Difficulty row shows 'avg 90 ×12' while also showing '92%' accuracy — 11 correct out of 12 = 91.67%, which rounds to 92%, but displaying '92%' alongside only 12 total cases with one wrong creates a rounding presentation risk. The deeper inconsistency is the Avg score card shows '90/100' while the By Difficulty section also shows 'avg 90 ×12' — these are redundant and consistent with each other but the '92%' accuracy figure rounds 91.67% up, which overstates performance for a learner tracking their true hit rate.
*Display accuracy as '91.7%' (one decimal place) or '11/12' so learners see the exact fraction; rounding 91.67% to 92% in a performance tracker inflates perceived accuracy and harms self-assessment.*
File: `app/review/page.tsx`

**f-254** [high/inconsistency] Score Distribution histogram counts 12 cases but bars show only 11+1=12 — 0-count buckets render non-zero bars
> Score Distribution bars: '0–19' bucket has 'height: 2%' with no count label shown (empty span); '20–39' bucket has 'height: 2%' with no count label; '40–59' bucket has 'height: 2%' with no count label. Only '60–79' shows count '1' and '80–100' shows count '11'. The zero-count buckets (0–19, 20–39, 40–59) are rendered with 'min-h-[2px]' making them visually appear as non-zero bars with no label, misleading learners into thinking there are cases in those score ranges.
*Zero-count buckets should render with no visible bar (height: 0) or be clearly marked '0'; the 'min-h-[2px]' floor height for empty buckets creates a false visual impression of cases in the 0–59 score ranges.*
File: `app/review/page.tsx`

**f-255** [medium/inconsistency] 7-case rolling average line starts at case 1, but a 7-case average requires at least 7 data points
> Chart legend: 'span class="flex items-center gap-1.5">...7-case avg</span>'. The dashed polyline starts at point 1 (cx=26): 'points="26,23.179999999999996 73.63636363636364,22.159999999999997 121.27272727272728,21.82 ...' — the rolling average line begins plotting from the very first case, when a 7-case rolling average cannot be computed until the 7th data point.
*The rolling average line should only begin rendering from the 7th case onward (cx=311.8...); rendering it from case 1 implies false precision and teaches learners an incorrect concept of how rolling averages work.*
File: `app/review/page.tsx`

**f-256** [medium/inconsistency] Dimension score 'Test Ordering 97%' rounds inconsistently with displayed bar width of 96.5%
> 'Test Ordering' label shows: 'span class="tabular-nums font-semibold text-green-400">97%</span>' but the bar inline style reads 'style="width: 96.5278%; background-color: ...'
*Round the displayed percentage and the bar width to the same value — either show '97%' with a 97% bar, or show '96.5%' with a 96.5% bar; mixing rounded label with precise bar width undermines trust in the data.*
File: `app/review/page.tsx`

**f-257** [medium/improvement] Systems tried stat '12 / 12' is misleading — denominator implies 12 total systems exist, but table shows only 12 systems all at Foundations difficulty
> 'Systems tried' stat displays '12 / 12'. The System × Difficulty table lists exactly 12 body systems (Cardiovascular, Respiratory, Neurologic, Gastrointestinal, Renal, Endocrine/Metabolic, Infectious, Hematologic/Oncologic, Musculoskeletal, Psychiatric, Toxicologic, Trauma), all with '—' for Clinical and Advanced columns.
*The denominator '12' conflates 'number of systems' with 'number of system × difficulty combinations'; clarify the stat as 'Systems tried: 12 of 12 (Foundations only)' or change the denominator to reflect all available system-difficulty pairings (e.g., 12/36 if three difficulty tiers exist) so learners understand the full scope of content available.*
File: `app/review/page.tsx`

**f-258** [medium/improvement] Score Trend chart has no x-axis case labels or dates, making individual data points unidentifiable without hover
> SVG chart contains no x-axis text labels for case numbers or dates. Tooltips are only accessible via native SVG 'title' elements (e.g., '<title>Trauma · Foundations — Score 91 (correct) · 5/16/2026</title>'), which are not accessible on touch devices and have no keyboard interaction path.
*Add visible x-axis case-number labels (1–12) below the chart and ensure case detail is accessible via keyboard-focusable elements or a companion table, so the data is accessible on mobile and to keyboard users.*
File: `app/review/page.tsx`

**f-259** [medium/improvement] Dimension score 'History & Interview' at 81% with no actionable drill-down harms targeted study
> 'History &amp; Interview' label with score 'span class="tabular-nums font-semibold text-green-400">81%</span>' — this is the lowest dimension score (81% vs. 97%, 94%, 88% for others) and is visually colored green despite being the weakest area. There is no link, tooltip, or breakdown explaining which cases contributed to the lower score.
*Flag the lowest-scoring dimension with a distinct color or 'needs improvement' indicator and provide a link to the specific cases where history-taking was weak, so learners know exactly what to revisit; coloring 81% the same green as 97% removes the signal value of the dimension breakdown.*
File: `app/review/page.tsx`

**f-260** [low/improvement] All 12 cases share the same date (5/16/2026), making the Score Trend timeline meaningless
> Every circle title in the SVG ends with '· 5/16/2026': e.g., 'Trauma · Foundations — Score 91 (correct) · 5/16/2026', 'Cardiovascular · Foundations — Score 93 (correct) · 5/16/2026' (repeated across all 12 data points).
*If all cases were genuinely completed on the same day, the x-axis should display session/attempt number rather than date, or show time-of-day; displaying 12 identical dates suggests either a data seeding artifact or a timestamp bug where only the date (not datetime) is stored per case.*
File: `app/review/page.tsx`

**f-261** [low/improvement] Legend color for Score Trend 'Correct/Incorrect' dots mismatches actual rendered dot fill colors
> Legend: 'span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>Correct' and 'span class="inline-block w-2 h-2 rounded-full bg-red-500"></span>Incorrect'. Actual correct dot fill in SVG: 'fill="#2d7a4a"' (dark green, not Tailwind green-500 which is #22c55e). Actual incorrect dot fill: 'fill="#b43b3b"' (dark red, not Tailwind red-500 which is #ef4444).
*Match legend swatch colors exactly to the SVG fill values ('#2d7a4a' and '#b43b3b') so the legend is a reliable key to the chart.*
File: `app/review/page.tsx`

### settings tab (12 findings)

**f-263** [high/bug] Dark mode toggle button not found — Appearance section non-functional
> {"action": "toggle-dark-mode", "status": "button not found"}
*The three theme chip buttons (☀ Light, ☾ Dark, ⬤ Auto) in the Appearance card are rendered as <button class="dx-chip"> elements but the interaction layer cannot locate a target with a dark-mode toggle role or id. Ensure buttons have a stable data-testid or aria attribute and that click handlers are wired to persist the choice to localStorage key 'medtrainer_color_scheme'.*
File: `app/settings/page.tsx`

**f-264** [high/inconsistency] Theme chips show 'Auto' as active but localStorage script may override silently
> <button class="dx-chip active" style="text-transform:capitalize">⬤ Auto</button> ... (function(){try{var s=localStorage.getItem('medtrainer_color_scheme')||'auto';var eff=s==='auto'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;if(eff==='dark')document.documentElement.classList.add('scheme-dark');}catch(e){}})();
*The UI shows 'Auto' as selected, but since the toggle is broken (f-263), any previously persisted value in localStorage could be 'light' or 'dark' while the chip still renders 'Auto' as active. On page load, read localStorage and reflect the actual stored value in the active chip state so the UI and the applied theme are always consistent.*
File: `app/settings/page.tsx`

**f-265** [medium/bug] Weekly case goal input accepts values above 14 via manual keyboard entry
> <input class="dx-input" type="number" min="1" max="14" style="max-width:80px" value="5">
*HTML number inputs enforce min/max only on form submit in some browsers, not during typing. Add an onInput/onChange handler that clamps the value to [1, 14] immediately and display an inline validation message if the entered value is out of range, so learners receive instant feedback rather than a silent failure on save.*
File: `app/settings/page.tsx`

**f-266** [medium/bug] Upgrade to Pro uses mailto: — no in-app upgrade flow exists
> <a href="mailto:support@medtrainer.app?subject=MedTrainer Pro upgrade" class="dx-btn-primary" ...>Upgrade to Pro →</a><p class="dx-help-text" style="margin:0">Opens your email to contact us.</p>
*A mailto: link will silently fail for users without a configured email client (common in browser-only or institutional environments), leaving them with no upgrade path. Provide a fallback in-app form or link to a web-based contact/payment page so the upgrade CTA never dead-ends.*
File: `app/settings/page.tsx`

**f-267** [medium/bug] Update password button permanently disabled regardless of input state
> <button class="dx-btn-primary" style="font-size:13px;padding:7px 18px" disabled="">Update password</button>
*The button is rendered with a hard-coded disabled attribute and no JavaScript handler appears to enable it when the three password fields are populated. Wire an onChange listener to all three password inputs that enables the button only when all fields are non-empty and the new/confirm values match, providing inline validation feedback for mismatches.*
File: `app/settings/page.tsx`

**f-268** [medium/bug] Delete account button disabled but no minimum confirmation logic is wired
> <input class="dx-input" type="email" placeholder="Type your email address" style="max-width:320px" value=""> ... <button class="dx-btn-danger" style="opacity: 0.5;" disabled="">Delete my account</button>
*Similar to the password button, the Delete button is statically disabled. There must be a live comparison between the typed email and the authenticated user's email (audit@medtrainer.test) to enable the button only on exact match; without this logic, the confirmation field is purely decorative and provides no actual safety guard.*
File: `app/settings/page.tsx`

**f-269** [medium/inconsistency] Rest-day chips and training preferences have no Save feedback or persistence indication
> <button class="dx-chip">Mon</button><button class="dx-chip">Tue</button><button class="dx-chip active">Wed</button>...<button class="dx-chip active">Sun</button> ... <button class="dx-btn-primary" style="font-size:13px;padding:7px 18px">Save preferences</button>
*Toggling a day chip has no visible state-change animation or dirty-state indicator, and 'Save preferences' gives no success/failure toast or confirmation. Add optimistic UI feedback (chip toggle animation, a disabled 'Saving…' state on the button, and a brief success toast) so users know their changes were persisted.*
File: `app/settings/page.tsx`

**f-270** [medium/inconsistency] Notification save button present despite feature being explicitly unimplemented
> <p class="dx-help-text" style="margin-bottom:8px">Email sending is coming soon — your preferences are saved and will take effect when enabled.</p> ... <button class="dx-btn-primary" style="font-size:13px;padding:7px 18px">Save notifications</button>
*Showing a functional-looking 'Save notifications' button while simultaneously admitting the feature is not yet active creates a false affordance. Either disable/hide the save button with a tooltip explaining the feature is pending, or remove the checkboxes entirely until the backend is ready, to avoid misleading learners about whether their preferences have any effect.*
File: `app/settings/page.tsx`

**f-271** [medium/improvement] Weekly case goal cap of 14 is unexplained and may confuse advanced learners
> <input class="dx-input" type="number" min="1" max="14" style="max-width:80px" value="5"><p class="dx-help-text">Number of cases you aim to complete each week.</p>
*The upper bound of 14 cases/week is silently enforced with no rationale given. Add help text such as 'Maximum 14 cases/week (2 per day) on the Free plan' so learners understand this is a plan-tier limit rather than an arbitrary system constraint, and link to the upgrade path.*
File: `app/settings/page.tsx`

**f-272** [medium/improvement] Free plan '2 cases per day' conflicts with weekly goal max of 14 (2×7=14, not 2×active days)
> <span style="font-size:13px;color:var(--muted)">Free plan — 2 cases per day, basic scorecard.</span> ... <input class="dx-input" type="number" min="1" max="14" style="max-width:80px" value="5">
*With 2 rest days selected (Wed + Sun), a user has 5 active days, so their effective weekly cap is 10 cases, not 14. The maximum of 14 only holds if zero rest days are chosen. Compute and display the effective weekly case ceiling dynamically based on the selected rest days so learners can set a realistic and consistent goal.*
File: `app/settings/page.tsx`

**f-273** [low/improvement] Email field is read-only but lacks visible read-only styling beyond opacity reduction
> <input class="dx-input" type="email" readonly="" style="max-width:320px;opacity:0.6;cursor:default" value="audit@medtrainer.test"><p class="dx-help-text">Email cannot be changed here. Contact support to update it.</p>
*Opacity-only signalling of read-only state can be missed by users and fails WCAG 1.4.3 contrast requirements at 0.6 opacity on some background colors. Add a distinct background fill (e.g., var(--surface-1)) and an aria-readonly='true' attribute, or replace the input with a styled <p> to make the non-editable nature immediately clear without contrast issues.*
File: `app/settings/page.tsx`

**f-274** [low/improvement] Display name max length of 60 is not communicated to the user
> <input class="dx-input" type="text" maxlength="60" placeholder="Your name" style="max-width:320px" value="audit">
*Add a live character counter (e.g., '5/60') below the field so learners know the constraint exists before they hit it silently mid-entry, which is standard practice for name fields with non-obvious limits.*
File: `app/settings/page.tsx`

### trainer tab (10 findings)

**f-276** [high/inconsistency] Two separate 'Generate Case' buttons with no functional differentiation
> Header button: 'Generate Case' (class: rounded-md bg-primary-500 px-4 py-1.5) AND main content area button: 'Generate Your First Case' (class: rounded-md bg-primary-500 px-8 py-3). Both appear on the same empty-state screen with no indication they differ in behavior.
*Remove the redundant main-content button or make the header button invisible on the empty state so there is a single clear call-to-action; if they behave identically, consolidate to one.*
File: `app/trainer/page.tsx`

**f-277** [high/bug] All nav steps permanently disabled before case generation with no re-enable logic visible
> Every sidebar nav button carries disabled="" attribute: e.g. '<button disabled="" class="... cursor-not-allowed text-ink-tertiary/50"><span>History of Present Illness</span>' — all six steps (HPI, ROS, Physical Exam, Order Tests, Test Results, Diagnosis) are disabled.
*Verify that the click handler on 'Generate Case' actually removes the disabled attribute from the first step (HPI) after a case loads; if state management is not wired, steps will never become interactive.*
File: `app/trainer/page.tsx`

**f-278** [medium/inconsistency] Difficulty tooltip describes Clinical level with a 22-minute timer, contradicting normal clinical exam conventions
> Tooltip text: 'Clinical — Moderate diagnoses, 1-2 atypical features, 22-minute timer.' Advanced is listed as '15-minute timer.' The Clinical tier has a longer timer (22 min) than Advanced (15 min), which is counterintuitive — harder cases get less time.
*Clarify the intent: if Advanced cases are meant to be harder and faster, document that explicitly in the tooltip (e.g., 'time pressure is part of the challenge'); otherwise invert the timers so harder tiers allow equal or more time.*
File: `app/trainer/page.tsx`

**f-279** [medium/medical_inaccuracy] Difficulty level 'Foundations' described as output: diagnosis only — omits reasoning, a core learning objective
> Tooltip: 'Foundations — Common textbook diagnoses, classic presentations, no timer. Output: diagnosis only.'
*Even at the Foundations level, trainees should be required to provide a brief rationale (e.g., one-sentence justification) to build clinical reasoning habits; 'diagnosis only' output reinforces pattern-matching without reasoning and is inconsistent with best practices in medical education.*
File: `app/trainer/page.tsx`

**f-280** [medium/inconsistency] Case Notes textarea is active and editable before any case is generated
> The chat input is correctly disabled: '<input type="text" disabled="" placeholder="Generate a case first">' but the Case Notes textarea has no disabled attribute: '<textarea placeholder="Your case notes…" class="resize-y min-h-[120px] w-full bg-surface-0 p-4 ...">' — it is fully interactive with no case loaded.
*Disable or visually grey-out the Case Notes textarea until a case is generated, consistent with how the patient interview input is handled, to avoid learners writing notes against a nonexistent case.*
File: `app/trainer/page.tsx`

**f-281** [medium/bug] 'SOAP template' button in Case Notes has no visible action or content
> '<button class="text-[10px] text-ink-tertiary hover:text-ink-primary transition-colors">SOAP template</button>' — no onclick handler, no aria attributes, no modal or insert behavior described anywhere in the interaction log.
*Wire the SOAP template button to insert a standard SOAP scaffold (Subjective / Objective / Assessment / Plan headers) into the textarea, or remove the button until the feature is implemented to avoid user confusion.*
File: `app/trainer/page.tsx`

**f-282** [medium/improvement] No progress indicator or step count shown in the sidebar navigation
> All six nav items render identically as plain disabled buttons: '<button disabled="">...<span>History of Present Illness</span></button>' through '<span>Diagnosis</span>' — there is no step number, completion checkmark, or active-step highlight.
*Add step numbers (1–6) and completion state icons to the sidebar so learners can see where they are in the workflow at a glance, which is especially important for timed Advanced cases.*
File: `app/trainer/page.tsx`

**f-283** [medium/improvement] Timer mentioned in difficulty descriptions but no timer UI is present on the page
> Tooltip states 'Clinical — ... 22-minute timer' and 'Advanced — ... 15-minute timer' yet no timer widget, countdown, or clock element exists anywhere in the rendered HTML.
*Add a visible countdown timer to the header or sidebar that activates when a Clinical or Advanced case is generated; its absence means the described difficulty mechanic is completely non-functional and misleading.*
File: `app/trainer/page.tsx`

**f-284** [low/improvement] Dictate button available before any case exists, with no disabled state
> '<button type="button" title="Dictate" class="flex-shrink-0 rounded-md border px-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-surface-4 bg-surface-2 ...">...(microphone icon)...</button>' — the button has disabled styling classes defined but is not actually disabled (no disabled attribute) even in the empty state.
*Apply the disabled attribute to the dictate button when no case is active, consistent with the pattern used for the chat input field.*
File: `app/trainer/page.tsx`

**f-285** [low/inconsistency] Case Notes label styled in caution color with no explanatory reason
> '<span class="text-[11px] font-semibold uppercase tracking-wider text-caution">Case Notes</span>' — the 'caution' (amber/yellow) color token is used for the Case Notes heading, which typically signals a warning or alert state, but no tooltip or explanation is provided.
*Use a neutral text color for the Case Notes label, or add a tooltip explaining why it is highlighted (e.g., 'Notes are not saved between sessions') so learners are not misled into thinking there is an error or warning condition.*
File: `app/trainer/page.tsx`

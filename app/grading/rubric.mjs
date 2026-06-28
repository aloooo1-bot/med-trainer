/**
 * Shared rubric logic — plain ESM so both the Next.js TS build and the
 * Node-only audit scripts (scripts/student-audit/solve.mjs) can import it
 * without a TypeScript compilation step.
 *
 * Source of truth: keep this in sync with the type signatures in rubric.ts.
 * Do not add TS type annotations here — this file runs in raw Node ESM.
 */

// ── Rubric definitions ────────────────────────────────────────────────────────

export const RUBRIC_TOTAL = 100

export const FOUNDATIONS_RUBRIC = [
  { key: 'historyInterview',      label: 'History & Interview',    max: 24 },
  { key: 'testOrdering',          label: 'Test Ordering',          max: 24 },
  { key: 'diagnosisAccuracy',     label: 'Diagnosis Accuracy',     max: 36 },
  { key: 'diagnosisCompleteness', label: 'Diagnosis Completeness', max: 16 },
]

export const CLINICAL_ADVANCED_RUBRIC = [
  { key: 'historyInterview',      label: 'History & Interview',    max: 20 },
  { key: 'testOrdering',          label: 'Test Ordering',          max: 20 },
  { key: 'diagnosisAccuracy',     label: 'Diagnosis Accuracy',     max: 30 },
  { key: 'diagnosisCompleteness', label: 'Diagnosis Completeness', max: 15 },
  { key: 'clinicalReasoning',     label: 'Clinical Reasoning',     max: 15 },
]

export function getRubric(difficulty) {
  return difficulty === 'Foundations' ? FOUNDATIONS_RUBRIC : CLINICAL_ADVANCED_RUBRIC
}

// ── Grading system prompt ─────────────────────────────────────────────────────

export const GRADING_SYSTEM_PROMPT = `You are a medical education evaluator grading a trainee's diagnostic performance.
You are grading a medical student, not a resident or attending. Apply a standard appropriate for someone still developing clinical reasoning. Reward correct thinking and penalize genuine errors, but do not penalize for absence of advanced clinical nuance unless the difficulty level is Advanced. When choosing between two scores, choose the higher one. The goal is accurate, encouraging feedback that motivates improvement — not a score that discourages continued learning.
The "Tests ordered" block in the grading payload lists the COMPLETE set of test results the student saw. Do NOT reason about, score on, or reference specific values from any test not in that block — treat unordered tests as if they do not exist.
Return ONLY valid JSON. No markdown, no code fences, no explanation.`

// ── Grading prompt ────────────────────────────────────────────────────────────

export function buildRubricPrompt(input) {
  const rubric = getRubric(input.difficulty)
  const isFoundations = input.difficulty === 'Foundations'

  const hi  = rubric.find(d => d.key === 'historyInterview')
  const to  = rubric.find(d => d.key === 'testOrdering')
  const da  = rubric.find(d => d.key === 'diagnosisAccuracy')
  const dc  = rubric.find(d => d.key === 'diagnosisCompleteness')
  const cr  = rubric.find(d => d.key === 'clinicalReasoning')

  const hiHigh   = Math.round(hi.max * 0.89)
  const hiLow    = Math.round(hi.max * 0.72)
  const hiMid    = Math.round(hi.max * 0.67)
  const hiFloor  = Math.round(hi.max * 0.61)
  const hiNever  = Math.round(hi.max * 0.56)

  const toFullMin  = Math.round(to.max * 0.83)
  const toMidMin   = Math.round(to.max * 0.56)
  const toMidMax   = Math.round(to.max * 0.78)
  const toLowMin   = Math.round(to.max * 0.28)
  const toLowMax   = Math.round(to.max * 0.50)
  const toFloor    = Math.round(to.max * 0.61)

  const daCorrectMin = Math.round(da.max * 0.81)
  const daPartialMin = Math.round(da.max * 0.59)
  const daPartialMax = Math.round(da.max * 0.78)
  const daStemiCap   = isFoundations ? Math.round(da.max * 0.44) : Math.round(da.max * 0.43)

  const dcFoundMin = Math.round(dc.max * 0.75)
  const dcClinMin  = Math.round(dc.max * 0.77)
  const dcClinMax  = dc.max
  const dcLowMax   = Math.round(dc.max * 0.44)

  const hardFloorGeneric     = isFoundations ? 86 : 82
  const hardFloorFoundCorr   = 86


  const weightBlock = rubric
    .map(d => `- ${d.label} (${d.key}): ${d.max} points`)
    .join('\n')

  const crSection = cr ? `
CLINICAL REASONING (/${cr.max}):
- Grade based on the written clinical reasoning text (if provided); if absent at Clinical/Advanced difficulty, grade based on whether the interview and test ordering demonstrated coherent diagnostic reasoning
- Award credit if the student cited specific findings (lab values, symptoms, history) that support the diagnosis — not just naming them but linking them
- Cited findings must be accurate and clinically relevant to this case
- DO NOT penalize for: absence of a differential, missing findings not asked about, brevity, or style
- DO penalize for: citing findings that do not exist in the case data, linking findings to the wrong conclusion, omitting the single most important supporting finding
- A student who correctly names the diagnosis and cites 3+ accurate supporting findings should score at least ${Math.round(cr.max * 0.67)}/${cr.max}
- If no reasoning text was provided AT CLINICAL OR ADVANCED DIFFICULTY (where the field exists but was left blank) and the interview/test ordering was coherent, score ${Math.round(cr.max * 0.47)}-${Math.round(cr.max * 0.67)}/${cr.max} based on observable reasoning
- IMAGING IMAGES NOTE: Visual images shown alongside imaging studies are sourced from published medical literature by keyword match and may not exactly depict this case's findings. Evaluate the student's imaging interpretation against the radiology reports in "Tests ordered" above (the authoritative ground truth), not against any specific visual details the student may describe. Do not penalize a student for image-specific descriptions that differ from the reports — the image may simply have been non-representative.
- ANTI-FABRICATION RULE: Before penalizing the trainee for citing fabricated information, verify the claim is not present anywhere in the Background History block above (which includes past medical history, medications, surgeries, hospitalizations, social history, family history, allergies, and hidden symptoms). Only flag information as fabricated if it is genuinely absent from ALL case fields — HPI, Background History, lab/imaging results, and the interview transcript.
- ANCHORING BIAS IDENTIFICATION: If the student's transcript shows a clear anchoring pattern — commits early to one diagnosis based on a single finding and fails to revise despite accumulating contradicting evidence — the clinicalReasoning feedback MUST name it as anchoring bias and specify the evidence that should have prompted reassessment. Example: "Your early commitment to SAH appears to have anchored your workup — the non-thunderclap onset and normal CT at 6h without LP significantly lowers post-test probability; bacterial meningitis should have moved up the differential when fever and nuchal rigidity were confirmed."${input.studentPrediction ? `
- PRE-TEST COMMITMENT: The student committed to a leading diagnosis BEFORE ordering any tests (see "Student's pre-test commitment" above). A correct pre-test leading diagnosis held with appropriate confidence is strong evidence of hypothesis-driven reasoning — reward it. A confidently-wrong pre-test commitment that the student then failed to revise toward the correct diagnosis despite the evidence is an anchoring/calibration weakness — reflect it in the score and name it in the feedback. Do NOT double-penalize: if you already flagged anchoring above, this is the same deduction, not an additional one.` : ''}
` : ''

  const crJsonField = cr
    ? `    "clinicalReasoning":     { "score": <0-${cr.max}>, "feedback": "<1 sentence on the quality of reasoning or evidence linkage>" }`
    : ''

  return `Case: ${input.patientInfo}
HPI: ${input.hpi}
Difficulty: ${input.difficulty}
${input.prePresentedInfo ? `\nPre-presented to student (shown in the structured HPI panel before the case began — the student did NOT need to ask for any of this):\n${input.prePresentedInfo}\n` : ''}
Background History (full ground-truth — includes all structured history fields and anything the patient could reveal):
${input.backgroundHistory}

Tests ordered:
${input.orderedLabResults || '(no labs ordered)'}
${input.orderedImagingResults || '(no imaging ordered)'}

Patient interview transcript:
${input.chatSummary || '(physician did not interview the patient)'}

${input.reasoningText ? `Trainee's written clinical reasoning:\n"""\n${input.reasoningText}\n"""` : '(No clinical reasoning text provided)'}

Trainee's submitted diagnosis: "${input.submittedDiagnosis}"
Correct diagnosis: "${input.correctDiagnosis}"
Key clinical information that should have been elicited: ${input.keyQuestions.join(' | ')}
Teaching points: ${input.teachingPoints.join(' | ')}
Differentials: ${input.differentials.join(', ')}
${input.differentialAnalysis ? `\nEVIDENCE-BASED DIFFERENTIAL RANKING (computed from this case's reasoning model over the tests the student actually ordered — this is AUTHORITATIVE and is the same ranking the student saw on the differential board; the "differentials" discussion you output MUST be consistent with it and MUST NOT contradict any confirm/exclude effect or the ordering):\n${input.differentialAnalysis}\n` : ''}${input.studentPrediction ? `\nStudent's pre-test commitment: ${input.studentPrediction}\n` : ''}
SCORING WEIGHTS (must sum to 100 — efficiency is tracked separately and is NOT part of this rubric):
${weightBlock}
${input.timedOut ? '\nNOTE: This case was submitted when time expired. Grade whatever was submitted fairly — partial work should receive partial credit. Do not penalize harshly for incomplete reasoning if it appears the student was mid-sentence. Note in the feedback: "This case was submitted when time expired." Do not reduce scores further beyond what the time expiry already reflects.\n' : ''}
HISTORY & INTERVIEW (/${hi.max}):
- ELICITATION TYPES: When evaluating each keyQuestion, classify how the student captured the information:
    • PROACTIVE: The student's question explicitly names the symptom, system, or history item (e.g., "Any chest pain?" "Family history of stroke?" "Are you on any blood thinners?") and the patient's next turn supplies the answer.
    • INCIDENTAL: The information appears in the patient's reply but the student's question was broad/open ("Tell me more," "Anything else?," "What else is going on?") OR the patient volunteered the info during a reply to a different topic.
- Treat PROACTIVE elicitation as a full hit for the corresponding keyQuestion; treat INCIDENTAL surfacing as a half-hit (worth ~50% of the per-question contribution). The scoring tiers below apply after this proactive/incidental weighting.
- Do not penalize for questions not asked unless they are critical to ruling out a dangerous alternative diagnosis or directly change management
- A student who asked high-yield targeted questions should score ${hiFloor}-${hiHigh}/${hi.max}; score ${hiLow}-${hi.max} if they also asked about safety-critical differentials (e.g. PE symptoms in a DVT case)
- ${hiMid}-${hiHigh}: asked most high-yield questions; missed 1 management-relevant area
- Only drop to ${hiFloor} if the student missed 2+ questions that each independently change management
- Never drop below ${hiNever} for a Foundations case unless the interview was entirely absent or off-topic
${isFoundations ? `- Foundations difficulty: do NOT penalize for missing advanced risk-stratification questions (e.g. hypercoagulable workup, formal scoring tools) — these are Clinical/Advanced expectations\n` : ''}
TEST ORDERING (/${to.max}):
${input.expectedLabs?.length ? `Core expected tests for this diagnosis (MUST-ORDER list — the standard acute workup):
  Labs: ${input.expectedLabs.join(' | ')}
  Imaging: ${(input.expectedImaging ?? []).join(' | ') || 'none specified'}
${input.supplementaryTests?.length ? `Supplementary/advanced tests (specialty follow-up — NOT required for full score; mention as teaching points only):
  ${input.supplementaryTests.join(' | ')}
` : ''}- ${toFullMin}-${to.max}: ordered ALL core expected tests above. Extra appropriate-but-unnecessary tests (e.g., a broader panel, redundant labs) are NEUTRAL and do NOT drop the score. Supplementary tests are not required; their absence does NOT drop from this band.
- IF THE STUDENT ORDERED ALL CORE EXPECTED TESTS: score MUST be ${toFullMin}-${to.max}. Only deduct below ${toFullMin} for explicitly contraindicated or dangerous additions (e.g., contrast CT in known severe contrast allergy).
- ${toFloor + 1}-${toMidMax}: ordered most core but missed exactly 1 core test that would change immediate management.
- ${toMidMin}-${toFloor}: missed exactly 2 core tests, OR ordered most core PLUS a clearly contraindicated addition.
- ${toLowMin}-${toLowMax}: missed 3+ core tests; at least some appropriate workup was present but the diagnostic workup was significantly incomplete.
- 0-${toLowMin - 1}: workup absent or fundamentally inappropriate for the diagnosis.
` : `- Award full or near-full credit if all ordered tests are appropriate and the core diagnostic workup is complete
- Minor additions (e.g. a slightly broad panel) should not drop the score
- Only penalize meaningfully for clearly unnecessary or contraindicated tests
`}${input.difficulty === 'Advanced' ? `- This student used free-text search with no pre-curated test list. Weight initiative and precision more heavily — ordering the exact right test by name (e.g. "Anti-PLA2R Antibody" rather than just "ANA") should be rewarded.` : ''}

DIAGNOSIS ACCURACY (/${da.max}):
- A correct primary diagnosis scores at least ${daCorrectMin}/${da.max} regardless of specificity
- Partial credit (${daPartialMin}-${daPartialMax}) only for correct organ system or syndrome with a meaningfully wrong pathological process — not for simply omitting a modifier
- Do not require subspecialty-level specificity unless difficulty is Advanced
- MODIFIER RULE: If the student names the correct pathological entity but omits a qualifying modifier (e.g. "pneumothorax" instead of "spontaneous pneumothorax", "hepatitis" instead of "alcoholic hepatitis", "heart failure" instead of "acute decompensated heart failure"), this is still correct: true and scores ${daCorrectMin}-${daPartialMax}. Only lower to partial credit if the missing modifier indicates a completely different disease process or management pathway.
- ADDED SPECIFICITY RULE: If the student's diagnosis names the correct core pathological entity AND adds qualifiers that are clinically accurate and supported by the case (e.g., a temporal modifier like "Acute" when the presentation is acute, an anatomic qualifier like "Left-sided" matching imaging, a severity descriptor matching the case), this is fully correct: set correct: true and award FULL diagnosisAccuracy (${da.max}/${da.max}). Do not deduct for accurate elaboration — added specificity that is clinically supported is a strength, not a deviation.
- ABBREVIATION RULE: Common abbreviations alongside the full term in parentheses (e.g., "Epidural Hematoma (EDH)", "Myocardial Infarction (MI)", "Pulmonary Embolism (PE)") are equivalent to the full term. Treat the parenthetical abbreviation as redundant labelling, not as added specificity to evaluate.
- INCORRECT ADDED SPECIFICITY: Only deduct if the added qualifier is clinically wrong for this case (e.g., "Chronic" when the case is clearly acute, a laterality that contradicts imaging) — score ${daPartialMin}-${daPartialMax} like other partial-credit cases. If the added qualifier names a different pathological process (e.g., "Subdural" instead of "Epidural"), treat as wrong core entity.
- STEMI and NSTEMI are NOT clinically equivalent — they differ in ECG findings, management (cath lab activation vs. medical), and outcomes. A student who submits NSTEMI when the correct diagnosis is any form of STEMI (or vice versa) has made a fundamental error: set correct: false AND cap diagnosisAccuracy at ${daStemiCap}/${da.max}. This rule overrides the general leniency rule above.
- STEMI TERRITORIAL QUALIFIER FEEDBACK: When the correctDiagnosis includes a territorial qualifier (Inferior / Anterior / Lateral / Posterior / RV) and the student's submitted diagnosis omits it, the diagnosisAccuracy feedback MUST (a) name the missing qualifier explicitly, (b) state the management implication tied to that territory (e.g., "Inferior STEMI with RV involvement: avoid nitrates and high-dose morphine because preload-dependent hemodynamics can collapse with vasodilation" / "Anterior STEMI: higher risk for cardiogenic shock and LV dysfunction; consider mechanical support thresholds"), and (c) name the exact point deduction tied to the missing qualifier. Do NOT call this omission "minor" without naming the management consequence — the verbal "minor" framing combined with a numeric deduction creates contradictory feedback to the learner.
- STEMI TERRITORY REQUIRED FOR CORRECT (Clinical/Advanced): When correctDiagnosis contains a territorial qualifier (Inferior / Anterior / Lateral / Posterior / RV) and the student's diagnosis omits it, set correct: false at Clinical or Advanced difficulty — territory determines management (nitrate avoidance in inferior/RV STEMI, mechanical support thresholds in anterior STEMI). At Foundations difficulty, territory omission is partial credit: correct: true, but reduce diagnosisAccuracy to the ${daPartialMin}–${daPartialMax} band and name the territory per STEMI TERRITORIAL QUALIFIER FEEDBACK.
- Closely related descriptions of the same syndrome are clinically equivalent and must be marked correct: e.g. "obstructive pyelonephritis," "complicated pyelonephritis with bacteremia," "urosepsis secondary to pyelonephritis," and "acute pyelonephritis with bacteremia" all describe the same core entity — accept any of them as correct.

DIAGNOSIS COMPLETENESS (/${dc.max}):
- WRONG DIAGNOSIS: If correct=false, diagnosisCompleteness MUST be ≤ ${dcLowMax}/${dc.max}. A student who names the wrong pathological entity cannot receive meaningful completeness credit — completeness presupposes the correct entity was identified. Only exceed ${dcLowMax}/${dc.max} if the student correctly identified the organ system or syndrome but got the pathological process wrong (partial-credit territory).
- For Foundations: a correct core diagnosis IS complete — MUST score ≥ ${dcFoundMin}/${dc.max}. The Foundations difficulty does not require etiology, staging, severity, or complication detail; naming the disease is the entire task. Do not deduct for missing modifiers or sub-classifications. Score ${dc.max}/${dc.max} if the core diagnosis is named cleanly. VERIFY: before returning, confirm diagnosisCompleteness ≥ ${dcFoundMin}/${dc.max} when correct=true and difficulty=Foundations — if your draft is below this, raise it before submitting.
- For Clinical: award ${dcClinMin}-${dcClinMax} if the core diagnosis is correct; require at least one supporting detail (etiology, severity, or complication) to score ${Math.round(dc.max * 0.87)}-${dcClinMax}
- Reserve scores below ${dcLowMax + 1} for cases where the student is meaningfully incomplete or names only a vague syndrome without the correct pathological process
- For Advanced only: require etiology, staging, or complication details to score above ${Math.round(dc.max * 0.67)}
${crSection}
GENERAL CALIBRATION:
- Reward efficient targeted questioning over exhaustive checklists
- Do NOT penalise for skipping history questions if the same information was already apparent from physical exam or the HPI
- Do NOT penalise for any item listed in the "Pre-presented to student" section above — that information was visible before the case began and required no elicitation
- Do NOT penalise for skipping redundant tests when the diagnosis was already clear
- Credit any question whose answer conveyed the same clinical information, regardless of exact phrasing

SCORE↔FEEDBACK CONSISTENCY RULE:
- If dimension feedback uses praise language ("strong", "excellent", "thorough", "asked all key questions", "outstanding"), the score for that dimension MUST be ≥ 90% of its max value. Praise language paired with a sub-90% score is internally inconsistent.
- If a dimension score is below 80% of max, the feedback for that dimension MUST cite a specific, concrete deduction — name the missed question, the omitted test, or the specific reasoning gap. Vague language like "minor deduction" or "slightly incomplete" is insufficient when ≥ 20% of the dimension's points are removed.
- Never write "minor deduction" or "small reduction" when the deduction is ≥ 4 points on a /24 dimension (or ≥ 4 points on a /20 dimension, or ≥ 6 points on a /30 dimension). Call out the specific gap by name.
- VERIFY before returning: scan each dimension's feedback text and score. If any dimension uses praise language with a score < 90% of max, revise the score upward or replace the praise text. If any score is < 80% of max without a named concrete deduction in the feedback, add the specific gap before submitting.
- DIMENSION WEIGHT CONSISTENCY: Apply the same rubric thresholds consistently regardless of how many cases you have graded in this session. Do not drift toward leniency or severity across cases — each grading call must be evaluated independently against the fixed band definitions above.

KEY-QUESTION ELICITATION RULE (grader-side):
- When the missedQuestions list references a fact, symptom, or history item that was ONLY present in hiddenSymptoms or hiddenHistory and was NEVER listed as one of the keyQuestions the student was given, do NOT penalise the student for missing it in historyInterview.
- If a finding is not in the keyQuestions list, it should be noted as "bonus high-yield context" in feedback, not as a graded deduction.
- Only penalise historyInterview for questions that appear verbatim or by close paraphrase in the keyQuestions array above.

PROACTIVE ELICITATION RULE:
- For historyInterview scoring, count each keyQuestion as either PROACTIVE (full credit) or INCIDENTAL (half credit) per the ELICITATION TYPES definitions in the HISTORY & INTERVIEW block above. Use the speaker labels in the transcript (Physician: / Patient:) to determine which student utterance preceded each patient disclosure.
- Heuristic for INCIDENTAL: the Physician turn immediately before the patient's disclosure does NOT name the relevant symptom, system, or history item. Generic prompts ("Tell me more," "Anything else?," "What else?") and unrelated questions count as incidental.
- When historyInterview is reduced because of incidental elicitation, the dimension feedback MUST name at least one specific topic that was captured incidentally and suggest the proactive phrasing (e.g., "You learned about the family history of stroke only after asking 'Anything else?' — next time ask directly: 'Any family history of stroke or early heart disease?'").
- Do NOT add incidentally-surfaced items to missedQuestions — the student did surface them and should not see them in the "you missed asking about X" panel. The deduction lives only in the score + dimension feedback.

GRADING TEXT FIDELITY RULE:
- The feedback text for testOrdering MUST enumerate ONLY the tests the student actually ordered (as listed in "Tests ordered" above). Do NOT write "you correctly ordered [test]" or "you included [test]" if that test does not appear in the student's ordered set.
- Do NOT invent or attribute tests the student did not order. If a test appears in the student's ordered set, it may be credited or critiqued. If it does not appear, it must not be mentioned as ordered.
- This rule applies to all dimension feedback text, not just testOrdering.
- Score AND feedback for every dimension must be derivable solely from the student's transcript + the "Tests ordered" block. Do NOT lower or raise a dimension score based on a test that was not ordered, even if its expected value is inferable from the diagnosis (e.g., "a CBC would have shown leukocytosis" is forbidden reasoning unless a CBC appears in Tests ordered).

ORDERED-TESTS SCORING CONTRACT:
- The diagnosisCompleteness, dataInterpretation, and clinicalReasoning dimensions may use ONLY data that appears in (a) the student's transcript or (b) the "Tests ordered" block.
- The testOrdering dimension is the ONE exception: it may compare the ordered set against the case's expectedLabs / supplementaryTests to credit or deduct for missed must-orders. It must NOT use the values of unordered tests when reasoning — only the binary fact that they were/weren't ordered.
- Never write "if you had ordered [X], the result would have been [Y]" — this leaks unordered-result information into the feedback even though X wasn't credited.

ABG-AS-CONFIRMATORY RULE (asthma cases):
- For asthma cases, feedback MUST NOT describe Arterial Blood Gas (ABG) as "confirming the diagnosis" or "establishing the diagnosis of asthma." ABG informs severity assessment (hypercapnia = impending respiratory failure), not diagnostic confirmation.
- Use language such as "informed severity stratification" or "assessed ventilatory status" — never "confirmed asthma" or "confirmed the diagnosis."

APAP NAC TIMING RULE (acetaminophen-toxicity cases only):
- TRIGGER: This rule applies ONLY when the correctDiagnosis above contains "Acetaminophen", "APAP", "Tylenol", or "Paracetamol" (case-insensitive). For all other diagnoses, this rule is dormant — skip it entirely.
- CLINICAL BACKGROUND: NAC (N-acetylcysteine) is highly effective when started within 8 hours of acetaminophen ingestion; efficacy decays sharply after that window. When history suggests a toxic dose (≥150 mg/kg, unknown amount, or staggered ingestion) AND the ingestion-to-presentation interval is approaching or past 8 hours, empiric NAC is the standard of care — do NOT wait for the serum APAP level to return if waiting would push initiation past the 8-hour optimum.
- AWARD (Clinical/Advanced clinicalReasoning): If the student's reasoningText OR chat transcript explicitly states they would start NAC empirically (e.g., "start NAC empirically", "begin NAC now without waiting for the level", "give NAC while the APAP level pends", or equivalent phrasing) AND the case timeline genuinely warrants empiric treatment (>4 hours from ingestion or unknown timing with toxic-dose history), award clinicalReasoning at the TOP of the band — score must be ≥ 87% of clinicalReasoning max (i.e., ≥ 13/15). Cite this in the dimension feedback by name: "Correctly identified the need for empiric NAC without waiting for the serum level."
- NEUTRAL (Clinical/Advanced clinicalReasoning): If the student mentions NAC only AFTER referencing the serum APAP result, OR orders the APAP level without commenting on NAC timing, score in the MID-band (no bonus, no penalty beyond other factors). This is acceptable but not exemplary.
- PENALTY (all difficulties): If the student does NOT mention NAC anywhere in reasoning or transcript despite a clear toxic-ingestion history, this is a meaningful management gap. At Clinical/Advanced, cap clinicalReasoning at ≤ 67% of max (i.e., ≤ 10/15) and name the gap explicitly: "Did not address NAC management — empiric NAC is the cornerstone of acetaminophen toxicity treatment." At Foundations, mention the gap in teachingPoints output only (no score deduction, since management is outside the Foundations rubric scope).
- INTERACTION WITH ORDERED-TESTS SCORING CONTRACT: NAC is a treatment, not a test. References to NAC in reasoningText do NOT violate the ORDERED-TESTS SCORING CONTRACT rule above — that rule restricts reasoning about unordered TESTS, not management decisions.

STEMI CATH-LAB TIMING RULE (STEMI / ST-elevation MI cases only):
- TRIGGER: This rule applies ONLY when the correctDiagnosis above contains "STEMI" or "ST-elevation" or "ST elevation MI" or "ST-Elevation Myocardial Infarction" (case-insensitive). For all other diagnoses (including NSTEMI, unstable angina, pericarditis), this rule is dormant — skip it entirely. NSTEMI is risk-stratified, not emergent-reperfusion-mandated, so the trigger MUST exclude NSTEMI explicitly.
- CLINICAL BACKGROUND: STEMI is a time-critical reperfusion emergency. The standard of care is primary PCI with a door-to-balloon target of ≤90 minutes when a PCI-capable facility is available, OR fibrinolysis within 30 minutes (door-to-needle) when PCI is unavailable within 120 minutes of first medical contact. Aspirin + P2Y12 inhibitor loading and anticoagulation are adjuncts, not substitutes for reperfusion. Delay to reperfusion correlates directly with myocardial loss and mortality.
- AWARD (Clinical/Advanced clinicalReasoning): If the student's reasoningText OR chat transcript explicitly states they would activate the cath lab / pursue primary PCI / arrange emergent reperfusion (e.g., "activate cath lab", "primary PCI now", "door-to-balloon", "emergent coronary angiography", "transfer for PCI", or "fibrinolysis if PCI unavailable") within the student's stated management plan, award clinicalReasoning at the TOP of the band — score must be ≥ 87% of clinicalReasoning max (i.e., ≥ 13/15). Cite this in the dimension feedback by name: "Correctly prioritized emergent reperfusion (primary PCI / cath-lab activation) as the time-critical intervention."
- NEUTRAL (Clinical/Advanced clinicalReasoning): If the student mentions reperfusion only after listing several non-emergent steps (e.g., orders multiple labs and serial ECGs before naming cath-lab activation), OR mentions only adjuncts (aspirin, heparin, nitrates) without naming reperfusion, score in the MID-band (no bonus, no penalty beyond other factors).
- PENALTY (all difficulties): If the student does NOT mention cath-lab activation, primary PCI, fibrinolysis, or any form of emergent reperfusion anywhere in reasoning or transcript, this is a meaningful management gap — reperfusion is the cornerstone of STEMI care. At Clinical/Advanced, cap clinicalReasoning at ≤ 67% of max (i.e., ≤ 10/15) and name the gap explicitly: "Did not address emergent reperfusion — primary PCI (door-to-balloon ≤90 min) or fibrinolysis (door-to-needle ≤30 min) is the time-critical intervention in STEMI." At Foundations, mention the gap in teachingPoints output only (no score deduction, since management is outside the Foundations rubric scope).
- INTERACTION WITH ORDERED-TESTS SCORING CONTRACT: Cath-lab activation / PCI / fibrinolysis are treatments and procedures, not diagnostic tests. References to them in reasoningText do NOT violate the ORDERED-TESTS SCORING CONTRACT rule above — that rule restricts reasoning about unordered TESTS, not management decisions.
- INTERACTION WITH STEMI/NSTEMI CAP: The existing diagnosisAccuracy STEMI/NSTEMI swap cap (in the DIAGNOSIS ACCURACY block above) governs diagnostic mis-classification only. This rule governs management quality given a correct STEMI diagnosis. The two operate on different dimensions and do NOT double-count.

CONTRADICTED CO-DIAGNOSIS RULE:
- If the student's submitted diagnosis adds a co-diagnosis or qualifier that is explicitly contradicted by the available imaging, labs, or physical exam in this case (e.g., "with concurrent meniscus injury" when MRI shows no meniscal tear; "with right-sided pleural effusion" when CXR shows no effusion), deduct ≥ 6 points from diagnosisAccuracy on a /36 scale (or ≥ 5 on /30) and explicitly name the contradiction in diagnosisAccuracy feedback. This represents a meaningful clinical error — the student added a diagnosis unsupported by evidence.

HARD FLOOR — CORRECT DIAGNOSIS:
- If correct=true, the sum of all dimension scores MUST be ≥ ${hardFloorGeneric}/100. Verify the arithmetic before returning. If your sum is below ${hardFloorGeneric}, redistribute upward starting from testOrdering then historyInterview.
- At Foundations difficulty, a student who names the correct diagnosis and ordered the core confirmatory tests MUST score ≥ ${hardFloorFoundCorr}/100 even if they asked few questions or skipped supplementary tests.
- A testOrdering score of ≤ ${toFloor}/${to.max} is only valid if the student missed 2+ core expected tests (from the must-order list above) — not for missing supplementary/advanced tests.

WRONG DIAGNOSIS TOTAL SCORE CAP:
- When correct=false (wrong primary diagnosis), the total score MUST NOT exceed 60/100, regardless of how high workup sub-scores are. A student who named the wrong pathological entity cannot receive a passing total. After drafting dimension scores: if their sum exceeds 60, reduce historyInterview first, then testOrdering, until the total equals 60.
- PARTIAL-CREDIT EXCEPTION: When the student named the correct organ system or syndrome but the wrong pathological process (diagnosisAccuracy in the ${daPartialMin}–${daPartialMax} partial-credit band), the cap is 70/100 instead of 60/100.
- VERIFY before returning: if correct=false, confirm total score ≤ 60 (or ≤ 70 for partial-credit cases). If your draft exceeds the cap, revise before submitting.

PIVOTAL TEST MANDATORY DEDUCTION:
- A "pivotal test" is the single confirmatory test whose absence makes it impossible to differentiate the primary diagnosis from a dangerous alternative at this difficulty level. Examples: LP in suspected bacterial meningitis (to rule out SAH and get CSF culture), CT-PA in suspected PE, troponin in chest-pain presentations.
- If the pivotal test is absent from the student's ordered set AND the student's diagnosis was wrong: testOrdering MUST be in the lower band (≤ ${toLowMax}/${to.max}) — it cannot be near-full even if other workup was appropriate.
- If the pivotal test is absent but the diagnosis was still correct (lucky reasoning): note the missing test in testOrdering feedback and reduce by at least 3 points below the upper band.

KEY-QUESTION PROPORTIONAL FLOOR RULE:
- Count the keyQuestions that the student neither proactively asked nor incidentally surfaced. Call this N_missed.
- If N_missed ≥ 2: historyInterview MUST be ≤ ${hiFloor}/${hi.max}. A student who missed half or more of the listed key questions cannot score in the upper band.
- VERIFY before returning: count N_missed from the transcript. If N_missed ≥ 2 and your draft historyInterview > ${hiFloor}, lower it before submitting.

VITALS CROSS-REFERENCE RULE:
- Vital signs (HR, BP, RR, temperature, SpO2, weight, BMI) are pre-presented to the student and appear in the case data above. Before issuing any fabrication warning for a vital sign the student cited, verify the cited value against the case vitals. Only flag as fabricated if the cited value is materially wrong (e.g., student says BP 180/110 when actual BP was 120/80). Do NOT penalize a student for citing a vital sign that matches or closely approximates the case data — they are reading it, not inventing it.

STUDENT LAB MISREAD FLAG:
- If the student's reasoning or transcript cites a specific lab value that materially differs from the actual result in "Tests ordered" (e.g., states "uric acid elevated at 8.2" when actual result is 4.8 mg/dL; states "troponin normal" when troponin is elevated), note the discrepancy in dimension feedback: "Note: You cited [test] as [student value], but the actual result was [actual value] — please re-read the lab panel carefully."
- This note does NOT independently reduce the dimension score. However, if the student's diagnosis or management was predicated entirely on the misread value, deduct from clinicalReasoning proportionally.

MISSED QUESTIONS — only list a question if ALL of the following are true:
1. The answer was not already available from the physical exam or HPI
2. Asking it would have meaningfully changed the diagnosis or management (not just completeness)
3. The trainee genuinely never surfaced the information through any question (including incidental capture via broad prompts — those count as surfaced and belong in historyInterview feedback, not here)

Return:
{
  "score": <integer — MUST equal the exact arithmetic sum of the dimension scores below; do NOT calculate this independently>,
  "correct": <true if diagnosis is correct or clinically equivalent, false otherwise>,
  "feedback": "<2-3 sentences of direct, constructive feedback on overall performance>",
  "strengths": ["<specific thing the trainee did well or efficiently>", ...2-4 items],
  "dimensions": {
    "historyInterview":      { "score": <0-${hi.max}>, "feedback": "<1 sentence: what they did well or missed>" },
    "testOrdering":          { "score": <0-${to.max}>, "feedback": "<1 sentence>" },
    "diagnosisAccuracy":     { "score": <0-${da.max}>, "feedback": "<1 sentence>" },
    "diagnosisCompleteness": { "score": <0-${dc.max}>, "feedback": "<1 sentence>" }${crJsonField ? `,\n    ${crJsonField}` : ''}
  },
  "missedQuestions": ["<question that would have meaningfully changed dx or management>", ...omit anything already available],
  "teachingPoints": ${JSON.stringify(input.teachingPoints)},
  "differentials": ["<dx>: <1 sentence explanation of why it's on the differential and how to distinguish — when an EVIDENCE-BASED DIFFERENTIAL RANKING is provided above, this discussion MUST be consistent with it: do not describe a differential as still-likely if that ranking marks it excluded, and do not contradict the confirm/exclude effects or the ordering>", ...]
}`
}

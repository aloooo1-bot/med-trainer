import type { GradingInput } from './types'

// ── Rubric definitions (single source of truth for weights) ───────────────────

export type DimensionKey =
  | 'historyInterview'
  | 'testOrdering'
  | 'diagnosisAccuracy'
  | 'diagnosisCompleteness'
  | 'clinicalReasoning'

export interface RubricDimension {
  key: DimensionKey
  label: string
  max: number
}

export const RUBRIC_TOTAL = 100

const FOUNDATIONS_RUBRIC: RubricDimension[] = [
  { key: 'historyInterview',      label: 'History & Interview',    max: 24 },
  { key: 'testOrdering',          label: 'Test Ordering',          max: 24 },
  { key: 'diagnosisAccuracy',     label: 'Diagnosis Accuracy',     max: 36 },
  { key: 'diagnosisCompleteness', label: 'Diagnosis Completeness', max: 16 },
]

const CLINICAL_ADVANCED_RUBRIC: RubricDimension[] = [
  { key: 'historyInterview',      label: 'History & Interview',    max: 20 },
  { key: 'testOrdering',          label: 'Test Ordering',          max: 20 },
  { key: 'diagnosisAccuracy',     label: 'Diagnosis Accuracy',     max: 30 },
  { key: 'diagnosisCompleteness', label: 'Diagnosis Completeness', max: 15 },
  { key: 'clinicalReasoning',     label: 'Clinical Reasoning',     max: 15 },
]

export function getRubric(difficulty: string): RubricDimension[] {
  return difficulty === 'Foundations' ? FOUNDATIONS_RUBRIC : CLINICAL_ADVANCED_RUBRIC
}

// ── Grading system prompt ─────────────────────────────────────────────────────

export const GRADING_SYSTEM_PROMPT = `You are a medical education evaluator grading a trainee's diagnostic performance.
You are grading a medical student, not a resident or attending. Apply a standard appropriate for someone still developing clinical reasoning. Reward correct thinking and penalize genuine errors, but do not penalize for absence of advanced clinical nuance unless the difficulty level is Advanced. When choosing between two scores, choose the higher one. The goal is accurate, encouraging feedback that motivates improvement — not a score that discourages continued learning.
Return ONLY valid JSON. No markdown, no code fences, no explanation.`

// ── Grading prompt ────────────────────────────────────────────────────────────

export function buildRubricPrompt(input: GradingInput): string {
  const rubric = getRubric(input.difficulty)
  const isFoundations = input.difficulty === 'Foundations'

  const hi  = rubric.find(d => d.key === 'historyInterview')!
  const to  = rubric.find(d => d.key === 'testOrdering')!
  const da  = rubric.find(d => d.key === 'diagnosisAccuracy')!
  const dc  = rubric.find(d => d.key === 'diagnosisCompleteness')!
  const cr  = rubric.find(d => d.key === 'clinicalReasoning')

  // Proportional calibration ranges derived from each axis's max
  const hiHigh   = Math.round(hi.max * 0.89)   // e.g. 80% of max
  const hiLow    = Math.round(hi.max * 0.72)
  const hiMid    = Math.round(hi.max * 0.67)
  const hiFloor  = Math.round(hi.max * 0.61)
  const hiNever  = Math.round(hi.max * 0.56)

  const toFullMin  = Math.round(to.max * 0.83)
  const toMidMin   = Math.round(to.max * 0.56)
  const toMidMax   = Math.round(to.max * 0.78)
  const toLowMin   = Math.round(to.max * 0.28)
  const toLowMax   = Math.round(to.max * 0.50)
  const toFloor    = Math.round(to.max * 0.61)  // ≤ this means 2+ core tests missed

  const daCorrectMin = Math.round(da.max * 0.81)   // correct → at least this
  const daPartialMin = Math.round(da.max * 0.59)
  const daPartialMax = Math.round(da.max * 0.78)
  const daStemiCap   = isFoundations ? Math.round(da.max * 0.44) : Math.round(da.max * 0.43)

  const dcFoundMin = Math.round(dc.max * 0.75)
  const dcClinMin  = Math.round(dc.max * 0.77)
  const dcClinMax  = dc.max
  const dcLowMax   = Math.round(dc.max * 0.44)

  const hardFloorGeneric     = isFoundations ? 86 : 82
  const hardFloorFoundCorr   = 86  // Foundations + correct + core tests → ≥ 86/100

  const crFloor = cr ? Math.round(cr.max * 0.73) : 0  // 11/15 scaled

  const weightBlock = rubric
    .map(d => `- ${d.label} (${d.key}): ${d.max} points`)
    .join('\n')

  const crSection = cr ? `
CLINICAL REASONING (/${cr.max}):
${isFoundations ? '' : ''}- Grade based on the written clinical reasoning text (if provided); if absent at Clinical/Advanced difficulty, grade based on whether the interview and test ordering demonstrated coherent diagnostic reasoning
- Award credit if the student cited specific findings (lab values, symptoms, history) that support the diagnosis — not just naming them but linking them
- Cited findings must be accurate and clinically relevant to this case
- DO NOT penalize for: absence of a differential, missing findings not asked about, brevity, or style
- DO penalize for: citing findings that do not exist in the case data, linking findings to the wrong conclusion, omitting the single most important supporting finding
- A student who correctly names the diagnosis and cites 3+ accurate supporting findings should score at least ${Math.round(cr.max * 0.67)}/${cr.max}
- If no reasoning text was provided AT CLINICAL OR ADVANCED DIFFICULTY (where the field exists but was left blank) and the interview/test ordering was coherent, score ${Math.round(cr.max * 0.47)}-${Math.round(cr.max * 0.67)}/${cr.max} based on observable reasoning
- IMAGING IMAGES NOTE: Visual images shown alongside imaging studies are sourced from published medical literature by keyword match and may not exactly depict this case's findings. Evaluate the student's imaging interpretation against the radiology reports in "Tests ordered" above (the authoritative ground truth), not against any specific visual details the student may describe. Do not penalize a student for image-specific descriptions that differ from the reports — the image may simply have been non-representative.
- ANTI-FABRICATION RULE: Before penalizing the trainee for citing fabricated information, verify the claim is not present anywhere in the Background History block above (which includes past medical history, medications, surgeries, hospitalizations, social history, family history, allergies, and hidden symptoms). Only flag information as fabricated if it is genuinely absent from ALL case fields — HPI, Background History, lab/imaging results, and the interview transcript.
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

SCORING WEIGHTS (must sum to 100 — efficiency is tracked separately and is NOT part of this rubric):
${weightBlock}
${input.timedOut ? '\nNOTE: This case was submitted when time expired. Grade whatever was submitted fairly — partial work should receive partial credit. Do not penalize harshly for incomplete reasoning if it appears the student was mid-sentence. Note in the feedback: "This case was submitted when time expired." Do not reduce scores further beyond what the time expiry already reflects.\n' : ''}
HISTORY & INTERVIEW (/${hi.max}):
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
` : ''}- ${toFullMin}-${to.max}: ordered all or nearly all CORE expected tests; no clearly inappropriate additions
- IF THE STUDENT ORDERED ALL CORE EXPECTED TESTS ABOVE: score MUST be ${toFullMin}-${to.max} regardless of missing supplementary tests — supplementary tests are advanced follow-up, not acute workup
- ${toMidMin}-${toMidMax}: ordered most core tests but missed 1-2 that would change immediate management
- ${toLowMin}-${toLowMax}: missed multiple core diagnostic tests or workup was significantly incomplete
- 0-${toLowMin - 1}: workup absent or fundamentally inappropriate for the diagnosis
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
- Closely related descriptions of the same syndrome are clinically equivalent and must be marked correct: e.g. "obstructive pyelonephritis," "complicated pyelonephritis with bacteremia," "urosepsis secondary to pyelonephritis," and "acute pyelonephritis with bacteremia" all describe the same core entity — accept any of them as correct.

DIAGNOSIS COMPLETENESS (/${dc.max}):
- For Foundations: a correct core diagnosis IS complete — MUST score ≥ ${dcFoundMin}/${dc.max}. The Foundations difficulty does not require etiology, staging, severity, or complication detail; naming the disease is the entire task. Do not deduct for missing modifiers or sub-classifications. Score ${dc.max}/${dc.max} if the core diagnosis is named cleanly.
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

HARD FLOOR — CORRECT DIAGNOSIS:
- If correct=true, the sum of all dimension scores MUST be ≥ ${hardFloorGeneric}/100. Verify the arithmetic before returning. If your sum is below ${hardFloorGeneric}, redistribute upward starting from testOrdering then historyInterview.
- At Foundations difficulty, a student who names the correct diagnosis and ordered the core confirmatory tests MUST score ≥ ${hardFloorFoundCorr}/100 even if they asked few questions or skipped supplementary tests.
- A testOrdering score of ≤ ${toFloor}/${to.max} is only valid if the student missed 2+ core expected tests (from the must-order list above) — not for missing supplementary/advanced tests.

MISSED QUESTIONS — only list a question if ALL of the following are true:
1. The answer was not already available from the physical exam or HPI
2. Asking it would have meaningfully changed the diagnosis or management (not just completeness)
3. The trainee genuinely never surfaced the information through any question

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
  "differentials": ["<dx>: <1 sentence explanation of why it's on the differential and how to distinguish>", ...]
}`
}

export function buildOralPrompt(
  patientInfo: string,
  correctDiagnosis: string,
  keyQuestions: string[],
  presentationText: string
): string {
  return `You are an attending physician evaluating a trainee's oral case presentation.

Case: ${patientInfo}
Correct diagnosis: "${correctDiagnosis}"
Key clinical information: ${keyQuestions.join(' | ')}

Trainee's oral presentation:
"""
${presentationText}
"""

Grade on four axes (each 0-25 points, total /100):
1. Accuracy (0-25): Are clinical facts, findings, and the diagnosis correct and free of errors?
2. Completeness (0-25): Are all key positive and pertinent negative findings included? Is the assessment and plan addressed?
3. Conciseness (0-25): Is the presentation appropriately brief — signal over noise, no unnecessary repetition?
4. Safety (0-25): Would this presentation prompt safe, appropriate management? Are critical findings flagged? Are dangerous diagnoses appropriately excluded?

Return ONLY valid JSON:
{
  "scores": {
    "accuracy": <integer 0-25>,
    "completeness": <integer 0-25>,
    "conciseness": <integer 0-25>,
    "safety": <integer 0-25>
  },
  "presentationTotal": <sum of the four scores>,
  "presentationFeedback": "<3-4 sentences of direct narrative feedback on the overall presentation quality>",
  "criticalMisses": ["<critical finding or safety issue that was omitted or misrepresented>", ...or empty array if none]
}`
}

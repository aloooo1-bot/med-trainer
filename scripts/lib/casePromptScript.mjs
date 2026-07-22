/**
 * Shared case-generation prompt constants + history helpers for the local
 * image-first generators (local-image-cases.mjs, local-chest-cases.mjs).
 * Extracted to a single source; each generator keeps its own JSON_SCHEMA since
 * special-modality (procedureResults) and radiology (imagingResults) cases
 * legitimately differ.
 */

export const CASE_SYSTEM_PROMPT = `You are a medical education case generator. Generate realistic, detailed clinical cases.
Return ONLY valid JSON. No markdown, no code fences, no explanation. Just the raw JSON object.
Invent a completely unique patient name. Draw from diverse ethnicities and countries each time (rotate through Eastern European, West African, East Asian, Latin American, Scandinavian, South Asian, Middle Eastern, etc.). Never reuse first names or last names across cases.`

export const DIFFICULTY_RULES = {
  Foundations: `DIFFICULTY — FOUNDATIONS:
- Common, high-prevalence diagnosis with a classic, unambiguous presentation
- Labs and imaging directly confirm the diagnosis with clearly abnormal values
- Physical exam findings are classic and confined to the primary organ system
- 2-3 differentials; the correct diagnosis is clearly favored`,

  Clinical: `DIFFICULTY — CLINICAL:
- Common-to-moderate prevalence diagnosis encountered by general internists or ER physicians
- ONE atypical feature that actively misleads toward a competing differential
- ONE comorbidity that meaningfully changes the presentation or lab interpretation
- At least one lab requiring correlation with another finding to interpret correctly
- 3-4 genuine differentials, at least one requiring a confirmatory test to exclude`,

  Advanced: `DIFFICULTY — ADVANCED:
- ONE uncommon or rare diagnosis — do NOT stack multiple rare conditions
- Comorbidities must be common (hypertension, diabetes, COPD, CKD)
- ONE objective red herring that actively supports a wrong diagnosis
- Lab and imaging findings require synthesis across multiple data points
- ONE pathognomonic or definitively discriminating result available in the test list
- 4-5 differentials with at least two strongly supported by early data`,
}

export const CRITICAL_RULES = `Return this exact JSON structure with all fields populated. For labResults, every panel must list every individual analyte as a separate component. Single-value tests also use a one-item components array.
CRITICAL: Every lab name listed in availableLabs MUST have a corresponding entry in labResults. Every imaging study in availableImaging MUST have a result in imagingResults (or procedureResults if it is a procedure). Do not list a test without also providing its result.
CRITICAL: The key in labResults for each test MUST be the EXACT same string as it appears in availableLabs.
CRITICAL: Imaging studies (X-Ray, CT, MRI, Ultrasound, ECG) must ONLY appear in availableImaging and imagingResults — NEVER in availableLabs or labResults.
CRITICAL: The lab/imaging results must include at least one finding that definitively confirms the correct diagnosis over its closest differential.
STEMI RULE: When the diagnosis is any form of STEMI, ecgFindings MUST explicitly state the affected leads with millimeter elevation.
PAST HISTORY CONSISTENCY RULE: The pastMedicalHistory fields shown to the patient (conditions, surgeries, hospitalizations) MUST NOT contradict hiddenHistory.fullHistory. If pastMedicalHistory.surgeries states "None" or "No prior surgeries", then hiddenHistory.fullHistory MUST NOT reveal any surgeries. The patient's visible history and hidden history must be completely consistent — the hidden history may ADD detail, but must never contradict what was already stated.
PHYSICAL EXAM OBJECTIVITY RULE: Every physicalExam field MUST describe only objective, observable findings (e.g., "dullness to percussion at right base", "pitting edema 2+ bilateral lower extremities", "JVD at 45 degrees"). NEVER include diagnostic interpretations, disease names, or phrases like "consistent with X", "suggesting X", or "findings of X". The exam reports what the clinician sees, hears, and feels — not what it means. Diagnosis is the user's task.
CLINICAL HPI WORD LIMIT RULE: The clinicalHpi field is a HARD MAXIMUM of 40 words. Count every word. If your draft exceeds 40 words, cut it. State only: age, sex, primary symptom, and duration. Do NOT add associated symptoms, characterization, radiation, pertinent positives/negatives, or social context — those belong in hiddenHistory.fullHistory. Two to three sentences only.
FOUNDATIONS HPI WORD LIMIT RULE: The hpi field is a HARD MAXIMUM of 60 words. Count every word. If your draft exceeds 60 words, cut it. State ONLY: the chief complaint, primary symptom(s), and duration. STRICTLY FORBIDDEN in hpi: associated symptoms, review of systems positives, family history, social history details, exam findings on arrival, and ANY diagnosis-narrowing detail. Move everything forbidden into hiddenHistory.fullHistory — the patient will reveal these during the clinical interview when asked. The hpi must leave the differential open.`


// ── Helpers ───────────────────────────────────────────────────────────────────
export function repairJson(text) {
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

export function reconcileHistoryConsistency(caseData) {
  const pmh    = caseData.pastMedicalHistory
  const hidden = caseData.hiddenHistory
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

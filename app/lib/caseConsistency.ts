import { VITAL_THRESHOLDS } from './caseJitter'
import { caseBmiIsInterpretable } from './bmi'

/**
 * Internal-consistency checks for a generated case.
 *
 * These encode defects found by auditing real played cases — the kind a
 * generation prompt cannot be trusted to prevent, because a prompt rule is a
 * request and this is a verification. Each check is a discrete, objective
 * relationship between two parts of the same case, so a student reading either
 * part alone would be misled by the disagreement.
 *
 * Pure + testable: no model calls, no I/O, no server-only imports, so it can
 * run at generation time, in unit tests, and as a sweep over the library.
 */

export type Severity = 'error' | 'warning'

export interface ConsistencyIssue {
  /** Stable machine-readable id, so a sweep can group and a fix can target. */
  code: string
  severity: Severity
  /** Which part of the case is wrong. */
  field: string
  message: string
}

/** The subset of a case these checks read. Loose so scripts can pass raw JSON. */
export interface CheckableCase {
  patientInfo?: { name?: string; age?: number; gender?: string; height?: string; heightInches?: number }
  vitals?: { bp?: string; hr?: number; rr?: number; temp?: number; spo2?: number; weight?: string }
  physicalExam?: Record<string, string>
  reviewOfSystems?: Record<string, string>
  /** Read by the BMI validity gate: the deformity is not always the diagnosis. */
  pastMedicalHistory?: { conditions?: string }
  clinicalHpi?: string
  advancedHpi?: string
  currentMedications?: { medications?: string; otc?: string }
  imagingResults?: Record<string, string>
  diagnosis?: string
  mechanism?: string
  hpi?: string
}

// ── vitals ↔ prose ───────────────────────────────────────────────────────────
// The exam narrative asserts a rate/temperature in words while the vitals bar
// shows a number. A case asserting "Tachycardic" at 96 bpm teaches the student
// that 96 is tachycardic.

interface VitalClaim {
  code: string
  /** Word used in the exam prose. */
  pattern: RegExp
  /** Guard so a negated or hedged mention does not count. */
  exclude?: RegExp
  vital: 'hr' | 'temp' | 'spo2' | 'rr'
  /** True when the number actually supports the claim. */
  holds: (v: number) => boolean
  describe: (v: number) => string
  /** Diagnoses where the vital legitimately dissociates from the claim. */
  skipWhenDiagnosis?: RegExp
}

const VITAL_CLAIMS: VitalClaim[] = [
  {
    code: 'vitals/tachycardia-claim',
    pattern: /\btachycard(ic|ia)\b/i,
    vital: 'hr',
    holds: hr => hr > 100,
    describe: hr => `exam describes tachycardia but heart rate is ${hr} (tachycardia is >100)`,
  },
  {
    code: 'vitals/bradycardia-claim',
    pattern: /\bbradycard(ic|ia)\b/i,
    vital: 'hr',
    holds: hr => hr < 60,
    describe: hr => `exam describes bradycardia but heart rate is ${hr} (bradycardia is <60)`,
  },
  {
    code: 'vitals/fever-claim',
    pattern: /\bfebrile\b|\bfever(ish)?\b|\bpyrexia\b/i,
    exclude: /\bafebrile\b|\bno fever\b|\bdenies fever\b/i,
    vital: 'temp',
    holds: t => t >= 100.4,
    describe: t => `exam describes fever but temperature is ${t}°F (fever is ≥100.4)`,
  },
  {
    code: 'vitals/afebrile-claim',
    pattern: /\bafebrile\b/i,
    vital: 'temp',
    holds: t => t < 100.4,
    describe: t => `exam states afebrile but temperature is ${t}°F`,
  },
  {
    code: 'vitals/tachypnea-claim',
    pattern: /\btachypn(eic|ea)\b/i,
    vital: 'rr',
    holds: rr => rr > 20,
    describe: rr => `exam describes tachypnea but respiratory rate is ${rr} (tachypnea is >20)`,
  },
  {
    code: 'vitals/hypoxia-claim',
    pattern: /\bhypox(ic|emia|emic)\b/i,
    vital: 'spo2',
    holds: s => s < 92,
    describe: s => `exam describes hypoxia but SpO₂ is ${s}%`,
    // Cyanide, CO and methaemoglobinaemia produce CELLULAR hypoxia with a
    // normal or high pulse-oximetry reading — the dissociation IS the teaching
    // point, so flagging it would be flagging correct medicine. This exclusion
    // was added because the sweep caught exactly that case.
    skipWhenDiagnosis: /cyanide|carbon monoxide|methemoglobin|methaemoglobin|sulfhemoglobin|mitochondrial/i,
  },
]

function checkVitalsProse(c: CheckableCase): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = []
  const prose = Object.entries(c.physicalExam ?? {})
  const dx = `${c.diagnosis ?? ''} ${c.mechanism ?? ''}`
  for (const claim of VITAL_CLAIMS) {
    const value = c.vitals?.[claim.vital]
    if (typeof value !== 'number') continue
    if (claim.skipWhenDiagnosis?.test(dx)) continue
    for (const [region, text] of prose) {
      if (!text || !claim.pattern.test(text)) continue
      if (claim.exclude?.test(text)) continue
      if (claim.holds(value)) continue
      out.push({
        code: claim.code,
        severity: 'error',
        field: `physicalExam.${region}`,
        message: claim.describe(value),
      })
    }
  }
  return out
}

// ── pronouns ─────────────────────────────────────────────────────────────────
// A case that calls a woman "he" breaks immersion and, worse, makes the student
// doubt they are reading the right chart. Collateral historians are the reason
// this cannot be a naive scan: "his wife reports…" legitimately uses both.

const COLLATERAL = /\b(wife|husband|mother|father|daughter|son|sister|brother|partner|spouse|caregiver|friend|neighbou?r|paramedic|nurse|roommate|granddaughter|grandson)\b/i

function checkPronouns(c: CheckableCase): ConsistencyIssue[] {
  const gender = (c.patientInfo?.gender ?? '').toLowerCase()
  const wrong = gender.startsWith('f') ? /\b(he|his|him)\b/i
    : gender.startsWith('m') ? /\b(she|her|hers)\b/i
    : null
  if (!wrong) return []

  const fields: Array<[string, string | undefined]> = [
    ['hpi', c.hpi],
    ...Object.entries(c.reviewOfSystems ?? {}).map(([k, v]) => [`reviewOfSystems.${k}`, v] as [string, string]),
    ...Object.entries(c.physicalExam ?? {}).map(([k, v]) => [`physicalExam.${k}`, v] as [string, string]),
  ]

  const out: ConsistencyIssue[] = []
  for (const [field, text] of fields) {
    if (!text) continue
    // Sentence-level: a mismatched pronoun only counts when no collateral
    // historian is named in the same sentence to own it.
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (!wrong.test(sentence)) continue
      if (COLLATERAL.test(sentence)) continue
      out.push({
        code: 'prose/pronoun-mismatch',
        severity: 'error',
        field,
        message: `patient is ${c.patientInfo?.gender} but this reads "${sentence.match(wrong)?.[0]}": ${sentence.trim().slice(0, 90)}`,
      })
      break // one report per field is enough to act on
    }
  }
  return out
}

// ── medication classification ────────────────────────────────────────────────

// Deliberately conservative: only drugs a patient buys and takes on their own
// initiative. Low-dose aspirin, naproxen and famotidine were removed after the
// first sweep — all three are routinely physician-directed, so flagging them
// produced 51 warnings that were mostly correct entries and drowned the report.
const OTC_DRUGS = /\b(acetaminophen|paracetamol|tylenol|ibuprofen|advil|motrin|loratadine|cetirizine|diphenhydramine|benadryl|calcium carbonate|vitamin [a-e]\b|multivitamin|melatonin|fish oil|magnesium oxide)\b/i

function checkMedications(c: CheckableCase): ConsistencyIssue[] {
  const rx = c.currentMedications?.medications ?? ''
  if (!rx) return []
  const hit = rx.match(OTC_DRUGS)
  if (!hit) return []
  return [{
    code: 'meds/otc-listed-as-prescription',
    severity: 'warning',
    field: 'currentMedications.medications',
    message: `"${hit[0]}" is over-the-counter but is listed under prescription medications; a student asking "what do you take?" is told the wrong thing`,
  }]
}

// ── radiology setting ────────────────────────────────────────────────────────
// Image-first cases are authored from a real film. When that film is an
// inpatient study, its report describes monitoring hardware — which contradicts
// a vignette that presents an ambulatory clinic patient.

const INPATIENT_HARDWARE = /\b(monitoring lead|support equipment|endotracheal tube|central (venous )?line|telemetry lead|nasogastric tube|chest tube|sternotomy wire|pacemaker lead|ecg lead)s?\b/i
const INPATIENT_SETTING = /\b(intubated|ventilat|icu|intensive care|admitted|inpatient|resuscitat|emergency department|ed |er )\b/i

function checkRadiologySetting(c: CheckableCase): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = []
  const context = `${c.hpi ?? ''} ${c.diagnosis ?? ''}`
  const looksInpatient = INPATIENT_SETTING.test(context)
  for (const [test, report] of Object.entries(c.imagingResults ?? {})) {
    const hit = report?.match(INPATIENT_HARDWARE)
    if (!hit || looksInpatient) continue
    out.push({
      code: 'imaging/setting-mismatch',
      severity: 'warning',
      field: `imagingResults.${test}`,
      message: `report describes "${hit[0]}" but the vignette presents an ambulatory patient; reconcile the setting or drop the incidental hardware`,
    })
  }
  return out
}

// ── physiology-required exam elements ────────────────────────────────────────
// Some diagnoses have a bedside sign you would lead with. Omitting it does not
// make the case wrong, but it makes it teach the wrong search pattern.

const REQUIRED_EXAM: Array<{ code: string; when: RegExp; region: string; expect: RegExp; sign: string }> = [
  {
    code: 'exam/missing-jvp',
    when: /cor pulmonale|right(-| )heart failure|right ventricular failure|pulmonary hypertension|tricuspid regurgitation|congestive heart failure|kyphoscoliosis|constrictive pericarditis|cardiac tamponade|fluid overload/i,
    region: 'Neck',
    expect: /jvp|jugular|jvd|neck vein/i,
    sign: 'jugular venous pressure',
  },
  {
    code: 'exam/missing-peripheral-pulses',
    when: /peripheral arterial disease|aortic dissection|acute limb ischemia|coarctation/i,
    region: 'Extremities',
    expect: /pulse|doppler|capillary refill/i,
    sign: 'peripheral pulses',
  },
]

function checkRequiredExam(c: CheckableCase): ConsistencyIssue[] {
  const context = `${c.diagnosis ?? ''} ${c.mechanism ?? ''} ${c.hpi ?? ''}`
  const out: ConsistencyIssue[] = []
  for (const rule of REQUIRED_EXAM) {
    if (!rule.when.test(context)) continue
    const text = c.physicalExam?.[rule.region] ?? ''
    if (rule.expect.test(text)) continue
    out.push({
      code: rule.code,
      severity: 'warning',
      field: `physicalExam.${rule.region}`,
      message: `${rule.sign} is the bedside sign for this physiology but the ${rule.region.toLowerCase()} exam does not mention it`,
    })
  }
  return out
}

// ── BMI validity ─────────────────────────────────────────────────────────────
// BMI is derived from measured height, which is not true height in these
// patients. Reporting a reassuring "normal" is misleading in exactly the
// population where the metric breaks.

/**
 * Delegates to the shared BMI module so the student-facing header, the admin
 * preview and this validator can never disagree about which patients the metric
 * breaks for. Kept as a named export because caseSource.ts and the sweep script
 * already import it.
 */
export function bmiIsValid(c: CheckableCase): boolean {
  return caseBmiIsInterpretable(c)
}

function checkBmi(c: CheckableCase): ConsistencyIssue[] {
  if (bmiIsValid(c) || !c.patientInfo?.height) return []
  return [{
    code: 'vitals/bmi-invalid-for-habitus',
    severity: 'warning',
    field: 'patientInfo.height',
    message: 'measured height is not true height in this diagnosis, so BMI derived from it is not interpretable — use arm span or ulnar length, and do not display a reassuring BMI category',
  }]
}

// ── entry point ──────────────────────────────────────────────────────────────

/** Run every consistency check. Empty array means nothing detectable is wrong. */
export function checkCaseConsistency(c: CheckableCase): ConsistencyIssue[] {
  return [
    ...checkVitalsProse(c),
    ...checkPronouns(c),
    ...checkMedications(c),
    ...checkRadiologySetting(c),
    ...checkRequiredExam(c),
    ...checkBmi(c),
  ]
}

/** Errors only — the subset severe enough to reject a freshly generated case. */
export function consistencyErrors(c: CheckableCase): ConsistencyIssue[] {
  return checkCaseConsistency(c).filter(i => i.severity === 'error')
}

/** Re-export so callers validating jittered cases share one source of truth. */
export { VITAL_THRESHOLDS }

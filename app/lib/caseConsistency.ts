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
  pastMedicalHistory?: { conditions?: string; surgeries?: string; hospitalizations?: string }
  socialHistory?: Record<string, string>
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

const COLLATERAL = /\b(wife|husband|mother|father|daughter|son|sister|brother|partner|girlfriend|boyfriend|fianc(é|e)e?|spouse|caregiver|carer|friend|neighbou?r|paramedic|ems|nurse|teacher|roommate|granddaughter|grandson|grandmother|grandfather|aunt|uncle|guardian)\b/i

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
    // A collateral historian named ANYWHERE in the field licenses the other
    // pronoun for the whole field. Checking only the same sentence produced
    // false positives on every case with a witness, because the historian is
    // introduced in one sentence and referred to in the next:
    //   "brought by his mother … On the day of presentation, she noted swelling"
    //   "found unresponsive by his wife. She reports he had taken his insulin"
    // Both are correct prose. Distinguishing a genuine slip from a historian's
    // pronoun needs real coreference resolution, so the field is skipped —
    // a missed error is much cheaper here than rewriting correct clinical text.
    if (COLLATERAL.test(text)) continue
    const hit = text.match(wrong)
    if (!hit) continue
    const sentence = text.split(/(?<=[.!?])\s+/).find(s => wrong.test(s)) ?? text
    out.push({
      code: 'prose/pronoun-mismatch',
      severity: 'error',
      field,
      message: `patient is ${c.patientInfo?.gender} but this reads "${hit[0]}": ${sentence.trim().slice(0, 90)}`,
    })
  }
  return out
}

// ── medication classification ────────────────────────────────────────────────

// Deliberately conservative: only drugs a patient buys and takes on their own
// initiative. Low-dose aspirin, naproxen and famotidine were removed after the
// first sweep — all three are routinely physician-directed, so flagging them
// produced 51 warnings that were mostly correct entries and drowned the report.
// Antihistamines were removed after a sweep: cetirizine sitting beside albuterol
// and fluticasone is a prescribed allergic-asthma regimen, not self-care.
const OTC_DRUGS = /\b(acetaminophen|paracetamol|tylenol|ibuprofen|advil|motrin|calcium carbonate|vitamin [a-e]\b|multivitamin|melatonin|fish oil|magnesium oxide)\b/i
// The entry says who directed it. "Ibuprofen 600mg TID (newly prescribed by
// PCP)" is a prescription — and in a lithium-toxicity case it is the
// precipitant the whole case turns on.
const PHYSICIAN_DIRECTED = /prescrib|per (pcp|physician|doctor)|\brx\b|started (on|by)|directed by/i
// Prescription-strength ibuprofen: OTC tops out at 400 mg per dose.
const RX_STRENGTH_NSAID = /\bibuprofen\s*\(?\s*(6\d\d|[89]\d\d|1\d{3})\s*mg/i

// Calcium and vitamin D alongside a glucocorticoid are not self-care — they are
// prescribed bone protection, and belong under prescriptions.
const STEROID = /prednis|dexameth|methylprednisolone|hydrocortisone|budesonide|glucocorticoid|alendronate|risedronate|zoledronic|denosumab/i
const BONE_PROTECTION = /calcium carbonate|vitamin d/i

function checkMedications(c: CheckableCase): ConsistencyIssue[] {
  const rx = c.currentMedications?.medications ?? ''
  if (!rx) return []
  const hit = rx.match(OTC_DRUGS)
  if (!hit) return []
  if (BONE_PROTECTION.test(hit[0]) && STEROID.test(rx)) return []
  if (PHYSICIAN_DIRECTED.test(rx)) return []
  if (RX_STRENGTH_NSAID.test(rx)) return []
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

// Sternotomy wires are deliberately absent: they are permanent, and a patient
// walking into clinic years after a CABG still has them. Flagging them told a
// post-sternotomy case that its defining finding did not belong.
const INPATIENT_HARDWARE = /\b(monitoring lead|support equipment|endotracheal tube|central (venous )?line|telemetry lead|nasogastric tube|orogastric tube|umbilical (venous |arterial )?catheter|chest tube|pacemaker lead|ecg lead)s?\b/i
const INPATIENT_SETTING = /\b(intubated|intubation|ventilat|icu|nicu|intensive care|admitted|inpatient|resuscitat|emergency department|\bed\b|\ber\b|trauma bay|code|arrest|unresponsive|obtunded|neonate|newborn)\b/i
// Conditions whose management IS the hardware — the patient cannot be
// ambulatory and have this diagnosis at the moment the film was taken.
const INPATIENT_DIAGNOSIS = /acute respiratory distress syndrome|\bards\b|tension pneumothorax|hemorrhagic shock|septic shock|cardiac arrest|congenital diaphragmatic hernia|overdose|toxidrome|poisoning|respiratory failure|status epilepticus|polytrauma/i
// A test whose own name says where it was taken.
const INPATIENT_TEST = /portable|post-?chest[- ]tube|babygram|bedside|\bap\b(?!.*lateral)/i

function checkRadiologySetting(c: CheckableCase): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = []
  const context = `${c.hpi ?? ''} ${c.diagnosis ?? ''}`
  const looksInpatient = INPATIENT_SETTING.test(context) || INPATIENT_DIAGNOSIS.test(context)
  for (const [test, report] of Object.entries(c.imagingResults ?? {})) {
    const hit = report?.match(INPATIENT_HARDWARE)
    if (!hit || looksInpatient || INPATIENT_TEST.test(test)) continue
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
  // Jugular venous pressure is not assessable in an infant — the neck is too
  // short and the column cannot be seen — so demanding it of a neonatal case
  // asks for a finding no clinician would document.
  const isInfant = typeof c.patientInfo?.age === 'number' && c.patientInfo.age < 1
  for (const rule of REQUIRED_EXAM) {
    if (rule.code === 'exam/missing-jvp' && isInfant) continue
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

// ── authoring notes in student-facing prose ──────────────────────────────────
// A stage direction for the patient agent, printed in the chart. Found live:
// the past-medical-history panel read "Vitiligo (diagnosed age 30, not
// volunteered initially)" — which is not a fact about the patient, and was
// self-contradicting because she had just volunteered it.
//
// The app already has the mechanism this intent belongs in:
// hiddenHistory.fullHistory, which patientPrompt.ts wraps in "only reveal
// specific details when the physician asks — do NOT volunteer these
// proactively". A note in a displayed field is that instruction written where
// it gets read by the student instead of obeyed by the patient.

// 'withhold' cannot be matched on its own — "the family elected to withhold
// resuscitation" is real clinical prose. What marks a stage direction is a
// non-disclosure verb bound to a marker about the INTERVIEW rather than the
// illness ("initially", "unless asked"), or a bare imperative to the agent.
const AUTHORING_NOTE: RegExp[] = [
  /\b(?:not|never|does not|do not|don't|won't)\s+(?:be\s+)?(?:volunteer(?:ed)?|disclos(?:e|ed)|reveal(?:ed)?|offer(?:ed)?|mention(?:ed)?|report(?:ed)?)\b[^.;)]{0,25}\b(?:initially|unless asked|until asked|spontaneously|on (?:their|his|her) own|if asked)\b/i,
  /\b(?:only|unless|until)\s+(?:if\s+|when\s+)?(?:directly\s+)?asked\b/i,
  /\bdo(?:es)? not volunteer\b|\bdon't volunteer\b|\bwithholds? (?:this|that|it)\b/i,
]

/** The offending text, or null. Exported so the model-driven audit agrees. */
export function findAuthoringNote(text: string): string | null {
  return AUTHORING_NOTE.map(re => text.match(re)).find(Boolean)?.[0] ?? null
}

/** Every field a student can read as the patient's record. */
export function studentFacingProse(c: CheckableCase): Array<[string, string | undefined]> {
  return [
    ['hpi', c.hpi],
    ['pastMedicalHistory.conditions', c.pastMedicalHistory?.conditions],
    ['pastMedicalHistory.surgeries', c.pastMedicalHistory?.surgeries],
    ['pastMedicalHistory.hospitalizations', c.pastMedicalHistory?.hospitalizations],
    ['currentMedications.medications', c.currentMedications?.medications],
    ['currentMedications.otc', c.currentMedications?.otc],
    ...Object.entries(c.socialHistory ?? {}).map(([k, v]) => [`socialHistory.${k}`, v] as [string, string]),
    ...Object.entries(c.reviewOfSystems ?? {}).map(([k, v]) => [`reviewOfSystems.${k}`, v] as [string, string]),
    ...Object.entries(c.physicalExam ?? {}).map(([k, v]) => [`physicalExam.${k}`, v] as [string, string]),
  ]
}

function checkAuthoringNotes(c: CheckableCase): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = []
  for (const [field, text] of studentFacingProse(c)) {
    if (typeof text !== 'string') continue
    const hit = findAuthoringNote(text)
    if (!hit) continue
    out.push({
      code: 'content/authoring-note',
      severity: 'error',
      field,
      message: `"${hit}" is an instruction to the patient agent, not a fact about the patient, and it is printed in the chart; withheld history belongs in hiddenHistory.fullHistory, which the patient prompt already gates`,
    })
  }
  return out
}

// ── removing a note ──────────────────────────────────────────────────────────
// Shared by the library repair script and the generation-time audit, so the two
// can never disagree about what a repaired field should look like.

const SEPARATOR = String.raw`\s*(?:[,;—–-]+\s*)?`
/** A note plus the punctuation binding it to the text around it. */
const NOTE_FRAGMENT = new RegExp(
  AUTHORING_NOTE.map(re => `${SEPARATOR}(?:${re.source})`).join('|'), 'gi',
)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Excise the note and tidy the punctuation it leaves behind. */
function excise(text: string, pattern: RegExp): string {
  const out = text
    .replace(pattern, '')
    .replace(/\(\s*\)/g, '')            // a parenthetical that was only the note
    .replace(/\s+([,.;)])/g, '$1')      // space stranded before punctuation
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*([,;—–-])\s*\./g, '.') // a dangling separator before the stop
    .replace(/[\s,;—–-]+$/, '')         // a separator left dangling at the end
    .trim()
  // The note can take the sentence's full stop with it when it sat last. These
  // fields are displayed, so give it back rather than leaving a bare clause.
  return out && /[.!?]$/.test(text.trim()) && !/[.!?)]$/.test(out) ? `${out}.` : out
}

/**
 * Remove an authoring note from one field.
 *
 * The field decides the surgery. A background field is a list whose entries
 * stand alone, so the note is excised and the entry kept — losing "Vitiligo
 * (diagnosed age 30)" to save a parenthetical would throw away an autoimmune
 * diagnosis that points at the answer.
 *
 * The vignette is narrative, and there the whole sentence goes. Excising the
 * clause from "He notes dysuria that began approximately 1 week ago, which he
 * had not volunteered initially" leaves the finding without the tell — the
 * dysuria stays in the opening paragraph, where beside the conjunctivitis and
 * the post-diarrhoeal arthritis it completes the Reiter triad before the
 * student has asked anything. The case stages that symptom as withheld, so the
 * sentence has no business being there at all.
 *
 * `span` lets the model-driven audit remove a note the regex cannot describe.
 */
export function stripAuthoringNote(field: string, text: string, span?: string): string {
  const pattern = span
    ? new RegExp(`${SEPARATOR}${escape(span)}`, 'gi')
    : NOTE_FRAGMENT
  if (field !== 'hpi') return excise(text, pattern)
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter(s => { pattern.lastIndex = 0; return !pattern.test(s) })
    .join(' ')
    .trim()
  // A one-sentence vignette carrying a note would be deleted outright. An
  // empty HPI is worse than a trimmed one, so fall back to excising.
  return kept || excise(text, pattern)
}

/** One instruction a reviewer found, quoted verbatim from a named field. */
export interface NoteFinding {
  field: string
  span: string
}

/**
 * Apply spans a model quoted, and refuse the ones it did not.
 *
 * Everything here is a guard against the reviewer being wrong, because the
 * cost of a false positive is deleted clinical text. The model may only point;
 * it never supplies replacement prose. A span that is not literally present —
 * paraphrased, reformatted, or attached to a field that does not exist — is
 * discarded rather than approximated, and a span covering most of its field is
 * treated as a misread rather than a stage direction.
 *
 * Pure, so the guards can be tested without a model call.
 */
export function applyAuthoringNoteFindings(
  c: CheckableCase,
  findings: unknown,
): string[] {
  if (!Array.isArray(findings)) return []
  const fields = new Map(
    studentFacingProse(c).filter((f): f is [string, string] => typeof f[1] === 'string'),
  )
  const removed: string[] = []

  for (const f of findings as NoteFinding[]) {
    if (!f || typeof f.field !== 'string' || typeof f.span !== 'string') continue
    const span = f.span.trim()
    const current = fields.get(f.field)
    if (!current || !span || !current.includes(span)) continue
    // Backstop against a reviewer that quoted the whole entry rather than the
    // instruction inside it — that would delete the clinical fact along with
    // the note. Deliberately loose: a long instruction in a short field is
    // ordinary, and the verbatim requirement is what does the real work here.
    if (span.length > current.length * 0.8) continue

    const fixed = stripAuthoringNote(f.field, current, span)
    // Nothing left means the span was the field. Refuse rather than blank it.
    if (!fixed || fixed === current) continue

    const [head, tail] = f.field.split('.')
    if (tail) {
      const parent = (c as unknown as Record<string, Record<string, string>>)[head]
      if (!parent || typeof parent !== 'object') continue
      parent[tail] = fixed
    } else {
      (c as unknown as Record<string, unknown>)[head] = fixed
    }
    fields.set(f.field, fixed)
    removed.push(`${f.field}: removed "${span}"`)
  }
  return removed
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
    ...checkAuthoringNotes(c),
  ]
}

/** Errors only — the subset severe enough to reject a freshly generated case. */
export function consistencyErrors(c: CheckableCase): ConsistencyIssue[] {
  return checkCaseConsistency(c).filter(i => i.severity === 'error')
}

/** Re-export so callers validating jittered cases share one source of truth. */
export { VITAL_THRESHOLDS }

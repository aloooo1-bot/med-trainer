export const ROS_CATEGORIES = [
  'Constitutional',
  'HEENT',
  'Cardiovascular',
  'Respiratory',
  'Gastrointestinal',
  'Genitourinary',
  'Musculoskeletal',
  'Neurological',
  'Psychiatric',
  'Integumentary',
  'Endocrine',
  'Hematologic/Lymphatic',
  'Allergic/Immunologic',
] as const

export type ROSCategory = (typeof ROS_CATEGORIES)[number]
export type ROSCategoryStatus = 'locked' | 'positive' | 'negative'

export interface ROSCategoryState {
  status: ROSCategoryStatus
  finding: string           // pre-generated caseData content, used for grading and post-submission reveal
  derivedFinding?: string   // chat-derived AI summary, shown during live interview (undefined = loading)
}

export type ROSState = Record<ROSCategory, ROSCategoryState>

const KEYWORD_MAP: Record<ROSCategory, string[]> = {
  Constitutional:          ['tired', 'fatigue', 'fever', 'chills', 'weight', 'appetite', 'night sweats'],
  HEENT:                   ['head', 'headache', 'vision', 'eyes', 'ears', 'hearing', 'nose', 'throat', 'sinus', 'neck'],
  Cardiovascular:          ['chest pain', 'palpitation', 'heart', 'shortness of breath', 'swelling', 'edema'],
  Respiratory:             ['cough', 'wheeze', 'breath', 'breathing', 'sputum', 'inhaler', 'lung'],
  Gastrointestinal:        ['nausea', 'vomit', 'diarrhea', 'constipation', 'stomach', 'abdomen', 'bowel', 'heartburn'],
  Genitourinary:           ['urination', 'urine', 'bladder', 'frequency', 'burning', 'discharge', 'dysuria', 'hematuria', 'polyuria', 'kidney', 'renal', 'prostate'],
  Musculoskeletal:         ['joint', 'muscle', 'back', 'pain', 'stiffness', 'swollen joint', 'weakness', 'fracture', 'bone', 'ligament'],
  Neurological:            ['dizzy', 'dizziness', 'numbness', 'tingling', 'seizure', 'memory', 'coordination', 'balance', 'speech', 'aphasia', 'diplopia', 'vision', 'confusion', 'syncope', 'fainting', 'headache'],
  Psychiatric:             ['anxiety', 'depression', 'mood', 'sleep', 'stress', 'panic', 'suicidal', 'hallucination', 'delusion', 'mania', 'psychosis', 'paranoia'],
  Integumentary:           ['rash', 'skin', 'itch', 'hair', 'nail', 'wound'],
  Endocrine:               ['thyroid', 'diabetes', 'thirst', 'heat intolerance', 'cold intolerance'],
  'Hematologic/Lymphatic': ['bruise', 'bleed', 'clot', 'lymph node', 'swollen gland', 'anemia'],
  'Allergic/Immunologic':  ['allergy', 'allergic', 'reaction', 'hives', 'immune'],
}

/**
 * Keywords that legitimately belong to more than one system, or are so generic
 * that a hit says nothing about which system was asked about.
 *
 * These exist because the keyword scan SHORT-CIRCUITS the AI classifier: one
 * match and the classifier never runs. A question about daytime hypersomnolence
 * hit 'sleep' → Psychiatric, so the morning-headache exchange — the highest-yield
 * finding in that case — was filed under Psychiatric and HEENT was left to be
 * summarised from an unrelated exchange, where it came out as "denies HEENT
 * concerns". The case itself documented the headaches correctly; only the
 * routing was wrong.
 */
const AMBIGUOUS_KEYWORDS = new Set([
  'sleep', 'headache', 'head', 'pain', 'back', 'weakness', 'vision', 'neck',
  'swelling', 'breath', 'breathing', 'tired', 'fatigue', 'confusion', 'dizzy',
  'dizziness', 'heart', 'lung', 'bone',
])

export interface ROSScan {
  categories: ROSCategory[]
  /** Categories matched only via ambiguous keywords — too weak to trust alone. */
  ambiguous: ROSCategory[]
  /** True when every match is ambiguous, so the AI classifier should arbitrate. */
  needsClassifier: boolean
}

/**
 * Case-insensitive keyword scan, reporting how much weight each match can bear.
 * An unambiguous hit is decisive and skips the model call; an ambiguous-only
 * result is a hint that must be arbitrated rather than acted on.
 */
export function scanMessageForROSDetailed(message: string): ROSScan {
  const lower = message.toLowerCase()
  const categories: ROSCategory[] = []
  const ambiguous: ROSCategory[] = []
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP) as [ROSCategory, string[]][]) {
    const hits = keywords.filter(kw => lower.includes(kw))
    if (!hits.length) continue
    categories.push(cat)
    if (hits.every(kw => AMBIGUOUS_KEYWORDS.has(kw))) ambiguous.push(cat)
  }
  return {
    categories,
    ambiguous,
    needsClassifier: categories.length > 0 && ambiguous.length === categories.length,
  }
}

/** Case-insensitive keyword scan. Returns matched ROS categories. */
export function scanMessageForROS(message: string): ROSCategory[] {
  return scanMessageForROSDetailed(message).categories
}

/** Heuristic: is this message long or question-like enough to warrant an AI classifier call? */
export function looksClinical(message: string): boolean {
  return message.trim().split(/\s+/).length >= 3 || message.includes('?')
}

export type HPISection = 'pmh' | 'medications' | 'social'

export type HPIField =
  | 'pmh_conditions' | 'pmh_surgeries' | 'pmh_hospitalizations'
  | 'med_medications' | 'med_otc'
  | 'soc_smoking' | 'soc_alcohol' | 'soc_drugs' | 'soc_occupation' | 'soc_living' | 'soc_other'

const HPI_FIELD_KEYWORD_MAP: Record<HPIField, string[]> = {
  pmh_conditions:       ['medical history', 'past history', 'diagnosed', 'conditions', 'illnesses', 'health problems', 'chronic', 'diseases', 'disorders'],
  pmh_surgeries:        ['surgery', 'surgeries', 'operation', 'operated', 'procedure', 'surgical', 'removed', 'appendix', 'gallbladder'],
  pmh_hospitalizations: ['hospitalized', 'hospitalizations', 'hospital stay', 'admitted to the hospital', 'inpatient stay', 'icu stay', 'emergency room visit', 'er visit', 'ever been admitted', 'ever been in the hospital', 'hospital before'],
  med_medications:      ['medication', 'medications', 'medicine', 'medicines', 'prescribed', 'prescription',
                         'what are you taking', 'any medications', 'current medications', 'on any medications',
                         'taking any pills', 'treatment', 'pharmacy', 'refill',
                         'nsaids', 'ibuprofen', 'naproxen', 'aspirin', 'acetaminophen', 'tylenol',
                         'blood pressure medication', 'cholesterol medication', 'diabetes medication', 'antibiotics',
                         // A blood-thinner question is a medication question, and in a stroke
                         // or bleeding case it is usually the most important one asked.
                         'blood thinner', 'blood thinners', 'anticoagulant', 'anticoagulants',
                         'warfarin', 'coumadin', 'eliquis', 'apixaban', 'xarelto', 'rivaroxaban',
                         'clopidogrel', 'plavix', 'heparin'],
  // The drug names are here as well as under med_medications on purpose. They
  // are the drugs most likely to BE the OTC entry, so a question naming one —
  // "are you on any blood thinners, like aspirin?" — was revealing the
  // prescription list while hiding the over-the-counter list the aspirin
  // actually sat in. In a stroke case that hid a daily antiplatelet from the
  // chart while the patient was describing it out loud.
  med_otc:              ['supplements', 'vitamins', 'vitamin', 'over the counter', 'otc',
                         'anything over the counter', 'herbal', 'natural remedies',
                         'antacid', 'antacids', 'anything without a prescription', 'non-prescription',
                         'anything else you take',
                         'aspirin', 'ibuprofen', 'acetaminophen', 'tylenol', 'advil', 'motrin',
                         'naproxen', 'aleve', 'nsaid', 'nsaids', 'blood thinner', 'blood thinners',
                         'antiplatelet', 'multivitamin', 'fish oil', 'melatonin'],
  soc_smoking:          ['smoke', 'smoking', 'cigarettes', 'tobacco', 'nicotine', 'vape', 'vaping', 'pack', 'quit smoking'],
  soc_alcohol:          ['drink', 'drinking', 'alcohol', 'beer', 'wine', 'liquor', 'spirits', 'alcoholic', 'how much do you drink'],
  soc_drugs:            ['recreational drugs', 'street drugs', 'marijuana', 'cannabis', 'cocaine', 'drug use', 'illicit'],
  soc_occupation:       ['work', 'job', 'occupation', 'employed', 'career', 'profession', 'what do you do', 'workplace', 'office', 'labor'],
  soc_living:           ['live', 'living', 'home', 'family', 'married', 'spouse', 'partner', 'children', 'alone', 'housing', 'apartment', 'house'],
  soc_other:            ['travel', 'exercise', 'diet', 'physical activity', 'expose', 'exposure', 'chemical', 'toxin', 'outside the country'],
}

export function scanMessageForHPIFields(message: string): HPIField[] {
  if (message.trim().split(/\s+/).filter(Boolean).length < 4) return []
  const lower = message.toLowerCase()
  return (Object.entries(HPI_FIELD_KEYWORD_MAP) as [HPIField, string[]][])
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
    .map(([field]) => field)
}

// Words that appear in background-history prose everywhere and identify
// nothing. Matching on these would unlock a field the patient never mentioned:
// "never" alone would hand over a smoking history, "diagnosed" a problem list.
const FIELD_STOPWORDS = new Set([
  'daily', 'twice', 'once', 'nightly', 'needed', 'oral', 'orally', 'tablet', 'tablets',
  'capsule', 'capsules', 'prescribed', 'prescription', 'regularly', 'occasional',
  'occasionally', 'supplement', 'supplements', 'takes', 'taking', 'self', 'initiated',
  'about', 'approximately', 'years', 'month', 'months', 'weeks', 'other', 'none',
  'documented', 'morning', 'evening', 'bedtime', 'meals', 'unit', 'units', 'every',
  'never', 'denies', 'denied', 'reports', 'history', 'prior', 'patient', 'currently',
  'current', 'recent', 'recently', 'since', 'active', 'treated', 'resolved', 'managed',
  'diagnosed', 'times', 'week', 'approximate', 'noted', 'notes', 'without', 'their',
  'there', 'these', 'those', 'which', 'while', 'after', 'before', 'agent', 'unknown',
  // Laterality and anatomy. "It was on the right side" is not a disclosure of
  // "Right knee arthroscopy", but it matched one and handed over the surgical
  // history of a patient who had only described hitting their head.
  'right', 'left', 'upper', 'lower', 'lateral', 'medial', 'anterior', 'posterior',
  'bilateral', 'sided', 'distal', 'proximal', 'central',
  // Words that carry the narrative of almost any answer. 'falls' is here for a
  // sharper reason: a patient describing a fall matched a problem list whose
  // first entry was atrial fibrillation, handing over the diagnosis of a
  // subdural case from a question about tripping on a rug.
  'falls', 'fallen', 'injury', 'injuries', 'started', 'starting', 'began', 'around',
  'couple', 'several', 'first', 'later', 'still', 'quite', 'really', 'thing', 'things',
  'going', 'getting', 'something', 'anything', 'nothing', 'others', 'today',
  'yesterday', 'night', 'nights', 'hours', 'minutes', 'during', 'feeling', 'noticed',
  'notice', 'think', 'thought', 'seemed', 'seems', 'maybe', 'probably', 'usually',
  'sometimes', 'always', 'often', 'ongoing', 'moderate', 'severe', 'small', 'large',
])

/**
 * Identifying tokens in a stored background-history value — the words that
 * would only appear in a reply if the patient had actually disclosed this.
 * Pure + testable.
 */
export function fieldTerms(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(
    value.toLowerCase().match(/[a-z]{5,}/g)?.filter(w => !FIELD_STOPWORDS.has(w)) ?? [],
  )]
}

/**
 * Keywords too generic to prove a reply was about that topic. A patient saying
 * "I felt fine at home" has not disclosed that they live alone in an apartment,
 * and "it hurt while I was at work" is not an occupational history.
 */
const WEAK_HPI_KEYWORDS = new Set([
  'home', 'work', 'live', 'living', 'house', 'family', 'alone', 'children',
  'married', 'pain', 'treatment', 'removed', 'procedure', 'conditions', 'chronic',
  'drink', 'pack', 'office', 'labor', 'diseases', 'disorders', 'partner',
])

/**
 * Which background fields the patient's own reply actually disclosed.
 *
 * The chart must not contradict the transcript. A patient who volunteers "I take
 * a baby aspirin every day" while the medication panel shows only their
 * amlodipine is telling the student two different things — and the unlock record
 * is what grading treats as authoritative for whether they elicited it, so the
 * omission also costs marks for a history they did take.
 *
 * Two signals, either of which is enough:
 *
 *  - the reply names an identifying term from the field's own stored text, so a
 *    match means the patient said the very thing the case documents. This is
 *    what catches a drug named without the word "medication" anywhere near it.
 *  - failing that, the reply contains an unambiguous keyword for that topic.
 *    Needed because many values are content-free ("None", "Denies alcohol use")
 *    and share no term with any honest answer to them.
 *
 * This supplements the question-driven unlock rather than replacing it, so it
 * can afford to be conservative: the ordinary case is already covered by what
 * the student asked.
 */
export function disclosedHpiFields(
  patientReply: string | undefined,
  values: Partial<Record<HPIField, string | undefined>>,
): HPIField[] {
  if (!patientReply?.trim()) return []
  const reply = patientReply.toLowerCase()
  const out: HPIField[] = []
  for (const [field, keywords] of Object.entries(HPI_FIELD_KEYWORD_MAP) as [HPIField, string[]][]) {
    if (fieldTerms(values[field]).some(t => reply.includes(t))) { out.push(field); continue }
    if (keywords.some(k => !WEAK_HPI_KEYWORDS.has(k) && reply.includes(k))) out.push(field)
  }
  return out
}

export function makeInitialHPIFieldState(): Record<HPIField, boolean> {
  return {
    pmh_conditions: false, pmh_surgeries: false, pmh_hospitalizations: false,
    med_medications: false, med_otc: false,
    soc_smoking: false, soc_alcohol: false, soc_drugs: false,
    soc_occupation: false, soc_living: false, soc_other: false,
  }
}

const HPI_KEYWORD_MAP: Record<HPISection, string[]> = {
  pmh: ['medical history', 'past history', 'diagnosed', 'conditions', 'illnesses', 'surgeries', 'hospitalizations', 'chronic', 'health problems', 'prior'],
  medications: ['medications', 'medication', 'medicines', 'taking anything', 'prescribed', 'drugs', 'pills', 'supplements', 'pharmacy', 'treatment'],
  social: ['smoke', 'smoking', 'tobacco', 'drink', 'alcohol', 'recreational', 'work', 'occupation', 'job', 'live', 'living situation', 'married', 'exercise', 'diet', 'social'],
}

export function scanMessageForHPISections(message: string): HPISection[] {
  const lower = message.toLowerCase()
  return (Object.entries(HPI_KEYWORD_MAP) as [HPISection, string[]][])
    .filter(([, keywords]) => keywords.some(kw => lower.includes(kw)))
    .map(([section]) => section)
}

// Negation triggers + the scope terminators that end a denial. A negation
// covers everything up to the next sentence end, semicolon, or contrastive
// conjunction — so "denies fever, chills, and weight loss" negates the WHOLE
// comma list, while "denies X but reports Y" stops the negation at "but".
const NEG_TRIGGER = '(?:no|not|non|without|denies?|denied|deny|negative\\s+for|none|absent|unremarkable|normal|clear)'
const NEG_STOP = '(?:\\bbut\\b|\\bhowever\\b|\\bthough\\b|\\balthough\\b|[.!?;])'
const NEG_CLAUSE = new RegExp(`\\b${NEG_TRIGGER}\\b(?:(?!${NEG_STOP}).)*`, 'gi')
// Filler left behind after stripping negations — subject, reporting verbs, and
// connectives that don't themselves constitute a positive finding.
const FILLER = /\b(the|a|an|patient|pt|client|he|she|they|reports?|states?|notes?|noted|endorses?|complains?|of|with|and|or|but|however|has|had|been|is|are|was|were)\b/g

/**
 * Determine whether a ROS finding is positive (has at least one affirmative
 * symptom) or purely negative (all denials). Handles both the canonical case
 * format ("Fatigue present. Denies fever, chills.") and the LLM-derived summary
 * format ("Patient denies joint pain, swelling, or stiffness.") — the latter
 * exposed two bugs in the old stripper (the "Patient" subject surviving, and
 * comma-list denials only stripping the first item).
 */
export function classifyFinding(finding: string): 'positive' | 'negative' {
  if (!finding) return 'negative'
  const stripped = finding
    .toLowerCase()
    .replace(NEG_CLAUSE, ' ')   // drop negated symptoms (full clause, not just first item)
    .replace(FILLER, ' ')       // drop subject/verb/connective filler
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return stripped.length > 3 ? 'positive' : 'negative'
}

export function makeInitialROSState(): ROSState {
  return Object.fromEntries(
    ROS_CATEGORIES.map(cat => [cat, { status: 'locked' as ROSCategoryStatus, finding: '' }])
  ) as ROSState
}

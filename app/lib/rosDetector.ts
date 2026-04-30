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

/** Case-insensitive keyword scan. Returns matched ROS categories. */
export function scanMessageForROS(message: string): ROSCategory[] {
  const lower = message.toLowerCase()
  const matched: ROSCategory[] = []
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP) as [ROSCategory, string[]][]) {
    if (keywords.some(kw => lower.includes(kw))) matched.push(cat)
  }
  return matched
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
                         'blood pressure medication', 'cholesterol medication', 'diabetes medication', 'antibiotics'],
  med_otc:              ['supplements', 'vitamins', 'over the counter', 'otc',
                         'anything over the counter', 'herbal', 'natural remedies',
                         'antacid', 'antacids', 'anything without a prescription', 'non-prescription',
                         'anything else you take'],
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

/**
 * Determine whether a generated ROS finding is positive (has at least one
 * affirmative symptom) or purely negative (all denials).
 * Strips negation clauses and checks if meaningful content remains.
 */
export function classifyFinding(finding: string): 'positive' | 'negative' {
  if (!finding) return 'negative'
  const stripped = finding
    .toLowerCase()
    .replace(/\b(no |denies?\s|without |absent |negative for |none )\b[^,;.]*/g, '')
    .replace(/[,;.\s]+/g, ' ')
    .trim()
  return stripped.length > 3 ? 'positive' : 'negative'
}

export function makeInitialROSState(): ROSState {
  return Object.fromEntries(
    ROS_CATEGORIES.map(cat => [cat, { status: 'locked' as ROSCategoryStatus, finding: '' }])
  ) as ROSState
}

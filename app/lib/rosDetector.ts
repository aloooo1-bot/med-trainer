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
  finding: string
}

export type ROSState = Record<ROSCategory, ROSCategoryState>

const KEYWORD_MAP: Record<ROSCategory, string[]> = {
  Constitutional:          ['tired', 'fatigue', 'fever', 'chills', 'weight', 'appetite', 'night sweats'],
  HEENT:                   ['head', 'headache', 'vision', 'eyes', 'ears', 'hearing', 'nose', 'throat', 'sinus', 'neck'],
  Cardiovascular:          ['chest pain', 'palpitation', 'heart', 'shortness of breath', 'swelling', 'edema'],
  Respiratory:             ['cough', 'wheeze', 'breath', 'breathing', 'sputum', 'inhaler', 'lung'],
  Gastrointestinal:        ['nausea', 'vomit', 'diarrhea', 'constipation', 'stomach', 'abdomen', 'bowel', 'heartburn'],
  Genitourinary:           ['urination', 'urine', 'bladder', 'frequency', 'burning', 'discharge'],
  Musculoskeletal:         ['joint', 'muscle', 'back', 'pain', 'stiffness', 'swollen joint', 'weakness'],
  Neurological:            ['dizzy', 'dizziness', 'numbness', 'tingling', 'seizure', 'memory', 'coordination', 'balance'],
  Psychiatric:             ['anxiety', 'depression', 'mood', 'sleep', 'stress', 'panic', 'suicidal'],
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

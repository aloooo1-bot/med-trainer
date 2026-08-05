export interface ECGImage {
  path: string    // e.g. "/ecg/afib/00012.png"
  report: string  // PTB-XL cardiologist report string
}

// Module-level caches — loaded once per browser session
let indexCache: Record<string, string[]> | null = null
let metaCache: Record<string, string> | null = null

async function loadIndex(): Promise<Record<string, string[]>> {
  if (indexCache) return indexCache
  try {
    const res = await fetch('/ecg/index.json')
    if (!res.ok) return {}
    indexCache = await res.json()
    return indexCache!
  } catch {
    return {}
  }
}

async function loadMeta(): Promise<Record<string, string>> {
  if (metaCache) return metaCache
  try {
    const res = await fetch('/ecg/metadata.json')
    if (!res.ok) return {}
    metaCache = await res.json()
    return metaCache!
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Diagnosis → ECG category
// ---------------------------------------------------------------------------

const CATEGORY_RULES: Array<{
  category: string
  diagnosisTerms?: string[]
  ecgTerms?: string[]
  /** Findings containing any of these can never belong to this category. */
  excludeEcgTerms?: string[]
}> = [
  {
    category: 'stemi',
    diagnosisTerms: ['stemi', 'st-elevation myocardial infarction', 'st elevation myocardial infarction', 'acute coronary', 'heart attack'],
    ecgTerms: ['st elevation', 'st-elevation', 'stemi', 'anterior mi', 'inferior mi', 'lateral mi'],
  },
  {
    category: 'nstemi_ischemia',
    diagnosisTerms: ['nstemi', 'unstable angina', 'acs', 'non-st elevation', 'non st elevation', 'ischemia', 'ischemic'],
    ecgTerms: ['st depression', 'st-depression', 't-wave inversion', 't wave inversion', 'nstemi', 'ischemia'],
  },
  {
    category: 'afib',
    diagnosisTerms: ['atrial fibrillation', 'afib', 'a-fib', 'af ', 'irregular rhythm', 'irregularly irregular'],
    ecgTerms: ['atrial fibrillation', 'afib', 'a-fib', 'irregularly irregular', 'no p waves'],
  },
  {
    category: 'lbbb',
    ecgTerms: ['lbbb', 'left bundle branch block', 'left bundle-branch block'],
  },
  {
    category: 'rbbb',
    ecgTerms: ['rbbb', 'right bundle branch block', 'right bundle-branch block'],
  },
  {
    category: 'heart_block',
    diagnosisTerms: ['heart block', 'av block', 'atrioventricular block', 'third degree', 'second degree', 'mobitz'],
    ecgTerms: ['heart block', 'av block', 'pr prolonged', 'pr interval', 'first degree', 'second degree', 'third degree', 'mobitz', 'wenckebach'],
  },
  {
    category: 'wpw',
    diagnosisTerms: ['wolff-parkinson-white', 'wolff parkinson white', 'wpw', 'pre-excitation'],
    ecgTerms: ['wpw', 'wolff-parkinson-white', 'delta wave', 'pre-excitation', 'short pr'],
  },
  {
    category: 'bradycardia',
    diagnosisTerms: ['sick sinus', 'sinus node dysfunction'],
    ecgTerms: ['bradycardia', 'sinus brady', 'bradycardic', 'slow rate', 'pacemaker', 'junctional rhythm', 'heart rate 4', 'heart rate 5'],
  },
  {
    // Mostly SUPRAVENTRICULAR tachycardia, which is why a bare 'tachycardia'
    // match once served an SVT strip (no P waves) to a sinus tachycardia case.
    // The category still admits sinus tachycardia because the pool contains a
    // faithful sinus-tach tracing; contradictsFindings is what keeps the SVT
    // strips out, rather than excluding the whole category up front.
    category: 'tachycardia',
    diagnosisTerms: ['svt', 'supraventricular tachycardia', 'psvt', 'paroxysmal supraventricular'],
    ecgTerms: ['tachycardia', 'svt', 'psvt', 'supraventricular', 'narrow complex tachycardia'],
  },
  {
    category: 'lvh',
    diagnosisTerms: ['left ventricular hypertrophy', 'lvh', 'hypertensive heart', 'hypertensive cardiomyopathy'],
    ecgTerms: ['left ventricular hypertrophy', 'lvh', 'voltage criteria', 'sokolow'],
  },
  {
    category: 'afib_flutter',
    diagnosisTerms: ['atrial flutter', 'flutter'],
    ecgTerms: ['atrial flutter', 'flutter waves', 'sawtooth'],
  },
  {
    category: 'normal',
    diagnosisTerms: ['normal', 'healthy', 'no acute', 'anxiety', 'syncope', 'vasovagal', 'musculoskeletal'],
    ecgTerms: ['normal sinus rhythm', 'sinus rhythm', 'no acute'],
  },
]

/**
 * Resolve the tracing category for a case, or null when none faithfully fits.
 *
 * Returning null matters: this used to fall through to 'normal', so any case
 * whose ECG findings matched no rule was served a NORMAL tracing — a normal
 * ECG presented as the abnormal one the student had ordered. Suppressing is
 * the only honest answer when the library cannot represent the finding (there
 * is, for instance, no right-axis/RVH category at all).
 */
export function getECGCategory(caseDiagnosis: string, ecgFinding?: string): string | null {
  const dx = caseDiagnosis.toLowerCase()
  const ecg = (ecgFinding ?? '').toLowerCase()

  for (const rule of CATEGORY_RULES) {
    if (rule.excludeEcgTerms?.some(t => ecg.includes(t))) continue
    const matchDx = rule.diagnosisTerms?.some(t => dx.includes(t)) ?? false
    const matchEcg = rule.ecgTerms?.some(t => ecg.includes(t)) ?? false
    if (matchDx || matchEcg) return rule.category
  }

  return null
}

export async function getRandomECGImage(category: string): Promise<ECGImage | null> {
  const [index, meta] = await Promise.all([loadIndex(), loadMeta()])
  const files = index[category]
  if (!files || files.length === 0) return null
  const file = files[Math.floor(Math.random() * files.length)]
  return {
    path: `/ecg/${category}/${file}`,
    report: meta[`${category}/${file}`] ?? '',
  }
}

// 12-lead names + distinctive ECG vocabulary used to score how well a candidate
// tracing's report matches the case's stated ECG findings.
const ECG_LEADS = ['i', 'ii', 'iii', 'avr', 'avl', 'avf', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6']
const ECG_TERMS = [
  'elevation', 'depression', 'inversion', 'q wave', 'st', 't wave', 'block', 'fibrillation',
  'flutter', 'hypertrophy', 'tachycardia', 'bradycardia', 'bundle', 'branch', 'ischem',
  'infarct', 'anterior', 'inferior', 'lateral', 'posterior', 'septal', 'pre-excitation', 'delta',
]

// ── Contradiction guard ──────────────────────────────────────────────────────
// A positive scoreEcgMatch only means "shares vocabulary"; it does not mean the
// tracing is compatible with the case. "Sinus tachycardia … P pulmonale" and
// "supraventricular tachycardia without evident p waves" share the word
// tachycardia and scored as a match, yet P pulmonale IS a P wave — the student
// was asked to find a feature the displayed tracing cannot contain.
//
// These axes are deliberately narrow: each is a discrete, objective property a
// reader can check on the strip, so a false positive is unlikely.

type Stance<T extends string> = T | 'unstated'

// Negation has to be read before presence, or "no discernible P waves" counts
// as a mention of P waves and the guard fires on a perfectly faithful afib
// tracing. Both sides are read by the same function so the comparison is
// symmetric.
const P_ABSENT = /\b(?:no|without|absent|lacking)\s+(?:\w+\s+){0,2}p\s*waves?\b|\batrial fibrillation\b|\bafib\b/
const P_PRESENT = /\b(?:sinus|p pulmonale|p mitrale)\b|\bp\s*waves?\b/

function pWaveStance(text: string): Stance<'present' | 'absent'> {
  if (P_ABSENT.test(text)) return 'absent'
  if (P_PRESENT.test(text)) return 'present'
  return 'unstated'
}

// Rhythm ORIGIN, which the P-wave axis alone cannot see: a report may name a
// non-sinus rhythm without ever mentioning P waves ("a rapid, regular
// supraventricular tachycardia is present"). SVT, flutter, junctional and VT
// are all by definition not sinus, so pairing any of them with a case that
// says "sinus" is a contradiction regardless of how P waves are described.
// German reports are matched too — the PTB-XL corpus is bilingual.
const NON_SINUS = /\bsupraventricular tachycardia\b|\bsvt\b|\bpsvt\b|\batrial fibrillation\b|\batrial flutter\b|\bjunctional\b|\bventricular tachycardia\b|\bpacemaker\b|\bpaced\b|tachykardie|vorhofflimmern|vorhofflattern|schrittmacher/
const SINUS = /\bsinus\b|sinusrhythmus|sinusbradykardie|sinustachykardie/

function rhythmOriginStance(text: string): Stance<'sinus' | 'non-sinus'> {
  // Sinus is checked first: a report that names sinus rhythm alongside ectopy
  // ("premature atrial contractions. sinus rhythm.") is still sinus.
  if (SINUS.test(text)) return 'sinus'
  if (NON_SINUS.test(text)) return 'non-sinus'
  return 'unstated'
}

// Features a case may explicitly DENY, paired with how the corpus asserts them
// (English and German — the PTB-XL reports are bilingual).
const ST_NEGATED = /\bno\s+(?:\w+\s+){0,3}st[- ]?(?:changes|abnormalit|elevation|depression|segment)/
const ST_ABNORMAL = /\bst[- ]?(?:elevation|depression|hebung|senkung)\b|\bst\s*&\s*t\s*abnormal|\bst-t wave changes\b/
const CONDUCTION_NEGATED = /\bno\s+(?:\w+\s+){0,4}conduction\s+(?:abnormalit|delay|disturbance|block)|\bno\s+(?:\w+\s+){0,3}(?:av|bundle branch)\s*block/
const CONDUCTION_ABNORMAL = /\bav[-\s]?block\b|\bbundle[-\s]branch\b|\bhemiblock\b|\bfascicular block\b|\bheart block\b|schenkelblock|leitungsst(?:oe|ö)rung/

const RHYTHM_IRREGULAR = /\birregular\b|\birregularly irregular\b|\batrial fibrillation\b|\bafib\b/
const RHYTHM_REGULAR = /\bregular\b/

function regularityStance(text: string): Stance<'regular' | 'irregular'> {
  if (RHYTHM_IRREGULAR.test(text)) return 'irregular'
  // Checked second so the "regular" inside "irregular" can never win.
  if (RHYTHM_REGULAR.test(text)) return 'regular'
  return 'unstated'
}

/**
 * Return a reason when a candidate tracing contradicts the case's stated ECG
 * findings, or null when the two can coexist. Pure + testable.
 *
 * Only compares axes where BOTH sides take a definite position — an unstated
 * property is not a disagreement.
 */
export function contradictsFindings(report: string, findings: string): string | null {
  if (!report || !findings) return null
  const r = report.toLowerCase()
  const f = findings.toLowerCase()

  const of_ = rhythmOriginStance(f)
  const or_ = rhythmOriginStance(r)
  if (of_ !== 'unstated' && or_ !== 'unstated' && of_ !== or_) {
    return `case rhythm is ${of_}; tracing is ${or_}`
  }

  const pf = pWaveStance(f)
  const pr = pWaveStance(r)
  if (pf !== 'unstated' && pr !== 'unstated' && pf !== pr) {
    return pf === 'present'
      ? 'case describes P waves; tracing has none'
      : 'case describes absent P waves; tracing is sinus'
  }

  const rf = regularityStance(f)
  const rr = regularityStance(r)
  if (rf !== 'unstated' && rr !== 'unstated' && rf !== rr) {
    return `case rhythm is ${rf}; tracing is ${rr}`
  }

  // Explicit negation. A case that says "No ST changes or conduction
  // abnormalities" cannot be illustrated by a strip reporting ST elevation and
  // a first-degree AV block — the student would read findings the case denies.
  // Only the case→tracing direction is checked: corpus reports are terse and
  // rarely state absences, so the reverse would fire constantly.
  if (ST_NEGATED.test(f) && ST_ABNORMAL.test(r)) {
    return 'case reports no ST changes; tracing has them'
  }
  if (CONDUCTION_NEGATED.test(f) && CONDUCTION_ABNORMAL.test(r)) {
    return 'case reports no conduction abnormality; tracing has one'
  }

  // Rate: the case's stated rate is the objective anchor. A tracing reported as
  // brady/tachy must actually agree with it — 96 bpm is neither.
  const rate = Number(f.match(/\b(\d{2,3})\s*(?:bpm|beats)/)?.[1] ?? NaN)
  if (Number.isFinite(rate)) {
    if (/\bbrady/.test(r) && rate >= 60) return `tracing is bradycardic; case rate is ${rate}`
    if (/\btachy/.test(r) && rate <= 100) return `tracing is tachycardic; case rate is ${rate}`
  }

  return null
}

/**
 * Whether a corpus report says anything a reader could check the strip against.
 *
 * PTB-XL contains stubs like "trace only requested." Those carry no findings,
 * so nothing can confirm or contradict them — they are unusable rather than
 * neutral, and previously slipped through as apparent matches. Pure + testable.
 */
export function isInterpretableReport(report: string): boolean {
  const r = report.toLowerCase().trim()
  if (!r) return false
  if (SINUS.test(r) || NON_SINUS.test(r)) return true
  if (ECG_LEADS.some(l => new RegExp(`\\b${l}\\b`).test(r))) return true
  if (ECG_TERMS.some(t => new RegExp(`\\b${t}\\b`).test(r))) return true
  // German corpus vocabulary the English term list does not cover.
  return /\b(ekg|rhythmus|hemiblock|infarkt|extrasystole|niederspannung|schenkelblock)\b/.test(r)
}

/**
 * Score how well a PTB-XL report matches the case's ECG findings. Lead-territory
 * overlap (e.g. both mention II/III/aVF) is weighted highest. Pure + testable.
 */
export function scoreEcgMatch(report: string, findings: string): number {
  if (!report || !findings) return 0
  const r = report.toLowerCase()
  const f = findings.toLowerCase()
  let score = 0
  for (const lead of ECG_LEADS) {
    const re = new RegExp(`\\b${lead}\\b`)
    if (re.test(r) && re.test(f)) score += 2
  }
  for (const term of ECG_TERMS) {
    // Word-bounded, like the leads above. Plain substring matching scored 'st'
    // inside "reque(st)ed", which let the corpus placeholder report "trace only
    // requested." look like a match and beat real tracings.
    const re = new RegExp(`\\b${term}\\b`)
    if (re.test(r) && re.test(f)) score += 1
  }
  return score
}

/**
 * Pick the tracing in a category whose report best overlaps the case's findings,
 * so the displayed ECG is case-matched rather than random. Falls back to a random
 * tracing when there is no matching signal (or no findings supplied).
 */
export async function getBestECGImage(category: string, ecgFindings?: string): Promise<ECGImage | null> {
  const [index, meta] = await Promise.all([loadIndex(), loadMeta()])
  const files = index[category]
  if (!files || files.length === 0) return null
  if (!ecgFindings) return getRandomECGImage(category)

  let best = files[0]
  let bestScore = -1
  for (const file of files) {
    const s = scoreEcgMatch(meta[`${category}/${file}`] ?? '', ecgFindings)
    if (s > bestScore) { bestScore = s; best = file }
  }
  // No distinctive overlap → keep variety with a random pick.
  if (bestScore <= 0) return getRandomECGImage(category)
  return { path: `/ecg/${category}/${best}`, report: meta[`${category}/${best}`] ?? '' }
}

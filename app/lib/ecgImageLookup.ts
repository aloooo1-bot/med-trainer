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

const CATEGORY_RULES: Array<{ category: string; diagnosisTerms?: string[]; ecgTerms?: string[] }> = [
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
    category: 'tachycardia',
    diagnosisTerms: ['svt', 'supraventricular tachycardia', 'psvt', 'paroxysmal supraventricular'],
    ecgTerms: ['tachycardia', 'svt', 'psvt', 'supraventricular', 'rapid rate', 'narrow complex tachycardia'],
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

export function getECGCategory(caseDiagnosis: string, ecgFinding?: string): string {
  const dx = caseDiagnosis.toLowerCase()
  const ecg = (ecgFinding ?? '').toLowerCase()

  for (const rule of CATEGORY_RULES) {
    const matchDx = rule.diagnosisTerms?.some(t => dx.includes(t)) ?? false
    const matchEcg = rule.ecgTerms?.some(t => ecg.includes(t)) ?? false
    if (matchDx || matchEcg) return rule.category
  }

  return 'normal'
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

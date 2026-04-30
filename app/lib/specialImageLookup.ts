export interface SpecialImage {
  path: string    // e.g. "/images/smear/00001.png"
  label: string   // display label (e.g. "Plasmodium falciparum ring forms")
  source: string  // attribution string
}

export type SpecialModality = 'smear' | 'biopsy' | 'fundus' | 'derm' | 'urine'

// Module-level caches — loaded once per browser session
const indexCaches: Partial<Record<SpecialModality, Record<string, string[]> | null>> = {}
const metaCaches: Partial<Record<SpecialModality, Record<string, { label: string; source: string }> | null>> = {}

async function loadIndex(modality: SpecialModality): Promise<Record<string, string[]>> {
  if (indexCaches[modality]) return indexCaches[modality]!
  try {
    const res = await fetch(`/images/${modality}/index.json`)
    if (!res.ok) return {}
    indexCaches[modality] = await res.json()
    return indexCaches[modality]!
  } catch {
    return {}
  }
}

async function loadMeta(modality: SpecialModality): Promise<Record<string, { label: string; source: string }>> {
  if (metaCaches[modality]) return metaCaches[modality]!
  try {
    const res = await fetch(`/images/${modality}/metadata.json`)
    if (!res.ok) return {}
    metaCaches[modality] = await res.json()
    return metaCaches[modality]!
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Test name → modality detection
// ---------------------------------------------------------------------------

export function isSmearTest(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('blood smear') || n.includes('peripheral smear') ||
    n.includes('peripheral blood') || n.includes('malaria') ||
    n.includes('cbc smear') || n.includes('blood film')
}

export function isBiopsyTest(name: string): boolean {
  const n = name.toLowerCase()
  return (n.includes('biopsy') || n.includes('pathology') || n.includes('histology') ||
    n.includes('h&e') || n.includes('hematoxylin')) &&
    !n.includes('skin biopsy') // skin biopsy handled by derm
}

export function isFundusTest(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('fundus') || n.includes('fundoscopy') || n.includes('ophthalmoscopy') ||
    n.includes('retinal') || n.includes('optic disc') || n.includes('eye exam')
}

export function isDermTest(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('skin biopsy') || n.includes('dermoscopy') || n.includes('dermatology') ||
    n.includes('skin lesion') || n.includes('punch biopsy')
}

export function isUrineTest(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('urine microscopy') || n.includes('urinalysis microscopy') ||
    n.includes('urine micro') || n.includes('urine sediment') ||
    n.includes('microscopic urinalysis')
}

export function getSpecialModality(testName: string): SpecialModality | null {
  if (isSmearTest(testName)) return 'smear'
  if (isBiopsyTest(testName)) return 'biopsy'
  if (isFundusTest(testName)) return 'fundus'
  if (isDermTest(testName)) return 'derm'
  if (isUrineTest(testName)) return 'urine'
  return null
}

// ---------------------------------------------------------------------------
// Category mapping (diagnosis → image category for each modality)
// ---------------------------------------------------------------------------

const SMEAR_CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  { category: 'malaria_falciparum', terms: ['malaria', 'plasmodium falciparum', 'falciparum'] },
  { category: 'malaria_vivax', terms: ['plasmodium vivax', 'vivax'] },
  { category: 'sickle_cell', terms: ['sickle cell', 'sickle-cell', 'hbss', 'sickling'] },
  { category: 'anemia', terms: ['anemia', 'anaemia', 'iron deficiency', 'thalassemia'] },
  { category: 'leukemia', terms: ['leukemia', 'leukaemia', 'lymphoma', 'blast'] },
  { category: 'normal', terms: [] },
]

const BIOPSY_CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  { category: 'colon_cancer', terms: ['colon cancer', 'colorectal', 'colon adenocarcinoma'] },
  { category: 'breast_cancer', terms: ['breast cancer', 'breast carcinoma', 'ductal carcinoma'] },
  { category: 'lung_cancer', terms: ['lung cancer', 'lung carcinoma', 'adenocarcinoma lung'] },
  { category: 'gastric', terms: ['gastric', 'stomach', 'helicobacter', 'h. pylori'] },
  { category: 'liver', terms: ['hepatitis', 'cirrhosis', 'liver fibrosis', 'nafld'] },
  { category: 'normal', terms: [] },
]

const FUNDUS_CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  { category: 'diabetic_retinopathy', terms: ['diabetic retinopathy', 'diabetes', 'diabetic'] },
  { category: 'glaucoma', terms: ['glaucoma', 'optic disc cupping', 'elevated iop'] },
  { category: 'amd', terms: ['macular degeneration', 'amd', 'drusen', 'choroidal'] },
  { category: 'hypertensive', terms: ['hypertensive retinopathy', 'hypertension', 'av nicking'] },
  { category: 'normal', terms: [] },
]

const DERM_CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  { category: 'melanoma', terms: ['melanoma', 'malignant melanoma'] },
  { category: 'basal_cell', terms: ['basal cell', 'bcc', 'basal cell carcinoma'] },
  { category: 'squamous_cell', terms: ['squamous cell', 'scc', 'squamous carcinoma'] },
  { category: 'nevus', terms: ['nevus', 'nevi', 'mole', 'benign melanocytic', 'dysplastic nevus'] },
  { category: 'normal', terms: [] },
]

const URINE_CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  { category: 'uti', terms: ['uti', 'urinary tract infection', 'cystitis', 'pyelonephritis', 'bacteria urine'] },
  { category: 'nephrotic', terms: ['nephrotic', 'proteinuria', 'nephrosis', 'minimal change'] },
  { category: 'nephritic', terms: ['nephritic', 'glomerulonephritis', 'hematuria', 'rbc casts'] },
  { category: 'kidney_stone', terms: ['kidney stone', 'nephrolithiasis', 'renal calculi', 'calcium oxalate'] },
  { category: 'normal', terms: [] },
]

const MODALITY_RULES: Record<SpecialModality, Array<{ category: string; terms: string[] }>> = {
  smear: SMEAR_CATEGORY_RULES,
  biopsy: BIOPSY_CATEGORY_RULES,
  fundus: FUNDUS_CATEGORY_RULES,
  derm: DERM_CATEGORY_RULES,
  urine: URINE_CATEGORY_RULES,
}

export function getSpecialCategory(modality: SpecialModality, diagnosis: string, finding?: string): string {
  const combined = ((diagnosis ?? '') + ' ' + (finding ?? '')).toLowerCase()
  const rules = MODALITY_RULES[modality]
  for (const rule of rules) {
    if (rule.terms.some(t => combined.includes(t))) return rule.category
  }
  return 'normal'
}

// ---------------------------------------------------------------------------
// Random image picker
// ---------------------------------------------------------------------------

export async function getRandomSpecialImage(
  modality: SpecialModality,
  category: string,
): Promise<SpecialImage | null> {
  const [index, meta] = await Promise.all([loadIndex(modality), loadMeta(modality)])
  const files = index[category]
  const chosen = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

  if (!files || files.length === 0) return null

  const file = chosen(files)
  const key = `${category}/${file}`
  return {
    path: `/images/${modality}/${category}/${file}`,
    label: meta[key]?.label ?? '',
    source: meta[key]?.source ?? '',
  }
}

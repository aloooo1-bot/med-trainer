import Anthropic from '@anthropic-ai/sdk'
import {
  CASE_SYSTEM_PROMPT, DIFFICULTY_RULES, CRITICAL_RULES, JSON_SCHEMA_TEMPLATE,
  repairJson, reconcileHistoryConsistency, sanitizePmhLeak,
} from './shared'

export interface LocalCombo {
  modality: string
  category: string
  diagnosis: string
  system: string
  difficulty: string
  expectedImagingName: string
  imagingCategory: string
  findingsField: string
  findingsKeyword: string
}

export const COMBOS: LocalCombo[] = [
  // SMEAR
  {
    modality: 'smear', category: 'malaria_falciparum',
    diagnosis: 'Plasmodium falciparum Malaria', system: 'Infectious', difficulty: 'Clinical',
    expectedImagingName: 'Peripheral Blood Smear', imagingCategory: 'peripheral smear',
    findingsField: 'hematologyFindings', findingsKeyword: 'ring forms',
  },
  // BIOPSY
  {
    modality: 'biopsy', category: 'breast_cancer',
    diagnosis: 'Invasive Ductal Carcinoma of the Breast', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Core Needle Breast Biopsy', imagingCategory: 'breast biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'cribriform architecture',
  },
  {
    modality: 'biopsy', category: 'colon_cancer',
    diagnosis: 'Colorectal Adenocarcinoma', system: 'Gastrointestinal', difficulty: 'Clinical',
    expectedImagingName: 'Colonoscopy with Biopsy', imagingCategory: 'colorectal biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'tubular glands',
  },
  {
    modality: 'biopsy', category: 'gastric',
    diagnosis: 'Helicobacter pylori-Associated Gastric Cancer', system: 'Gastrointestinal', difficulty: 'Advanced',
    expectedImagingName: 'Upper Endoscopy with Gastric Biopsy', imagingCategory: 'gastric biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'signet ring cells',
  },
  {
    modality: 'biopsy', category: 'liver',
    diagnosis: 'Alcoholic Liver Cirrhosis', system: 'Gastrointestinal', difficulty: 'Clinical',
    expectedImagingName: 'Liver Biopsy (Percutaneous)', imagingCategory: 'liver biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'bridging fibrosis',
  },
  // DERM
  {
    modality: 'derm', category: 'melanoma',
    diagnosis: 'Cutaneous Melanoma', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Dermoscopy and Skin Biopsy', imagingCategory: 'dermoscopy',
    findingsField: 'skinFindings', findingsKeyword: 'irregular pigment network',
  },
  {
    modality: 'derm', category: 'basal_cell',
    diagnosis: 'Basal Cell Carcinoma', system: 'Hematologic / Oncologic', difficulty: 'Foundations',
    expectedImagingName: 'Skin Biopsy (Punch Biopsy)', imagingCategory: 'skin biopsy',
    findingsField: 'skinFindings', findingsKeyword: 'palisading nuclei',
  },
  {
    modality: 'derm', category: 'squamous_cell',
    diagnosis: 'Cutaneous Squamous Cell Carcinoma', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Skin Biopsy (Punch Biopsy)', imagingCategory: 'skin biopsy',
    findingsField: 'skinFindings', findingsKeyword: 'keratin pearls',
  },
  {
    modality: 'derm', category: 'nevus',
    diagnosis: 'Dysplastic Melanocytic Nevus', system: 'Hematologic / Oncologic', difficulty: 'Foundations',
    expectedImagingName: 'Dermoscopy', imagingCategory: 'dermoscopy',
    findingsField: 'skinFindings', findingsKeyword: 'irregular network',
  },
  // FUNDUS
  {
    modality: 'fundus', category: 'amd',
    diagnosis: 'Neovascular Age-Related Macular Degeneration', system: 'Neurologic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography and OCT', imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'drusen',
  },
  {
    modality: 'fundus', category: 'diabetic_retinopathy',
    diagnosis: 'Proliferative Diabetic Retinopathy', system: 'Endocrine / Metabolic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography (Dilated Eye Exam)', imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'microaneurysms',
  },
  {
    modality: 'fundus', category: 'glaucoma',
    diagnosis: 'Primary Open-Angle Glaucoma', system: 'Neurologic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography with Tonometry', imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'cup-to-disc',
  },
  {
    modality: 'fundus', category: 'hypertensive',
    diagnosis: 'Grade III Hypertensive Retinopathy', system: 'Cardiovascular', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography (Dilated Eye Exam)', imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'flame hemorrhages',
  },
  // URINE
  {
    modality: 'urine', category: 'uti',
    diagnosis: 'Acute Uncomplicated Cystitis (UTI)', system: 'Renal', difficulty: 'Foundations',
    expectedImagingName: 'Urine Microscopy', imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'bacteria urine',
  },
  {
    modality: 'urine', category: 'nephrotic',
    diagnosis: 'Minimal Change Disease (Nephrotic Syndrome)', system: 'Renal', difficulty: 'Clinical',
    expectedImagingName: 'Urine Microscopy', imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'oval fat bodies',
  },
  {
    modality: 'urine', category: 'nephritic',
    diagnosis: 'IgA Nephropathy (Berger Disease)', system: 'Renal', difficulty: 'Clinical',
    expectedImagingName: 'Urine Microscopy', imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'rbc casts',
  },
  {
    modality: 'urine', category: 'kidney_stone',
    diagnosis: 'Calcium Oxalate Nephrolithiasis', system: 'Renal', difficulty: 'Foundations',
    expectedImagingName: 'Urine Microscopy', imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'calcium oxalate',
  },
]

export async function generateLocal(combo: LocalCombo): Promise<Record<string, unknown>> {
  const { diagnosis, system, difficulty, expectedImagingName, imagingCategory, findingsField, findingsKeyword } = combo
  const diffCount = difficulty === 'Foundations' ? '2-3' : difficulty === 'Clinical' ? '3-4' : '4-5'

  const schema = JSON_SCHEMA_TEMPLATE
    .replace(/IMAGE_TEST_NAME/g, expectedImagingName)
    .replace('IMAGE_FINDINGS_DESCRIPTION', `<detailed ${expectedImagingName} findings described objectively — do NOT name the diagnosis "${diagnosis}" anywhere in this field>`)
    .replace('IMAGE_CATEGORY', imagingCategory)
    .replace('DIFF_COUNT', diffCount)

  const prompt = `Generate a ${system} clinical training case. The diagnosis MUST be "${diagnosis}".

SPECIAL MODALITY REQUIREMENT:
- "${expectedImagingName}" MUST appear in both availableImaging and procedureResults (it is a procedure/special test, not radiology).
- The "${findingsField}" field MUST contain the phrase "${findingsKeyword}" — this is required for the trainer's image-lookup system to display the correct image category. Weave it naturally into a clinically accurate description.

${DIFFICULTY_RULES[difficulty] ?? DIFFICULTY_RULES.Foundations}

${CRITICAL_RULES}

${schema}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: CASE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (response.content.find(c => c.type === 'text') as { text: string } | undefined)?.text ?? ''
  let parsed: Record<string, unknown>
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    parsed = JSON.parse(match[0])
  } catch {
    parsed = JSON.parse(repairJson(text))
  }

  // Validate the keyword is present
  const findings = ((parsed[findingsField] as string) ?? '').toLowerCase()
  if (!findings.includes(findingsKeyword.toLowerCase())) {
    throw new Error(`"${findingsField}" missing keyword "${findingsKeyword}" (got: "${String(parsed[findingsField]).slice(0, 80)}")`)
  }

  parsed.nativeDifficulty = difficulty
  return sanitizePmhLeak(reconcileHistoryConsistency(parsed))
}

export function findCombo(modality: string, category: string): LocalCombo | undefined {
  return COMBOS.find(c => c.modality === modality && c.category === category)
}

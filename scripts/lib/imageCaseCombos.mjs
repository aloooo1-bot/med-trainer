/**
 * Image-first case combos — SINGLE SOURCE.
 *
 * Each combo maps ONE local image category to ONE distinct diagnosis. The point
 * is diversity, not volume: a category holding 20 near-identical films of the
 * same finding yields ONE case, not 20 duplicates of the same diagnosis. The
 * surplus images are redundant for case-building (the planner reports them).
 *
 * Consumed by scripts/local-image-cases.mjs (special modalities, existing) and
 * scripts/plan-image-cases.mjs (coverage planning across all datasets).
 */

// ── Special modalities (the image IS diagnosis-specific: a dermoscopy of a
//    melanoma, a smear of malaria). One category → one diagnosis. ──────────────
export const SPECIAL_COMBOS = [
  // ── SMEAR ──
  {
    modality: 'smear', category: 'malaria_falciparum',
    diagnosis: 'Plasmodium falciparum Malaria', system: 'Infectious', difficulty: 'Clinical',
    expectedImagingName: 'Peripheral Blood Smear',
    imagingCategory: 'peripheral smear',
    findingsField: 'hematologyFindings', findingsKeyword: 'plasmodium falciparum',
  },
  // ── BIOPSY ──
  {
    modality: 'biopsy', category: 'breast_cancer',
    diagnosis: 'Invasive Ductal Carcinoma of the Breast', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Core Needle Breast Biopsy',
    imagingCategory: 'breast biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'ductal carcinoma',
  },
  {
    modality: 'biopsy', category: 'colon_cancer',
    diagnosis: 'Colorectal Adenocarcinoma', system: 'Gastrointestinal', difficulty: 'Clinical',
    expectedImagingName: 'Colonoscopy with Biopsy',
    imagingCategory: 'colorectal biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'colorectal',
  },
  {
    modality: 'biopsy', category: 'gastric',
    diagnosis: 'Helicobacter pylori-Associated Gastric Cancer', system: 'Gastrointestinal', difficulty: 'Advanced',
    expectedImagingName: 'Upper Endoscopy with Gastric Biopsy',
    imagingCategory: 'gastric biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'gastric',
  },
  {
    modality: 'biopsy', category: 'liver',
    diagnosis: 'Alcoholic Liver Cirrhosis', system: 'Gastrointestinal', difficulty: 'Clinical',
    expectedImagingName: 'Liver Biopsy (Percutaneous)',
    imagingCategory: 'liver biopsy',
    findingsField: 'biopsyFindings', findingsKeyword: 'cirrhosis',
  },
  // ── DERM ──
  {
    modality: 'derm', category: 'melanoma',
    diagnosis: 'Cutaneous Melanoma', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Dermoscopy and Skin Biopsy',
    imagingCategory: 'dermoscopy',
    findingsField: 'skinFindings', findingsKeyword: 'melanoma',
  },
  {
    modality: 'derm', category: 'basal_cell',
    diagnosis: 'Basal Cell Carcinoma', system: 'Hematologic / Oncologic', difficulty: 'Foundations',
    expectedImagingName: 'Skin Biopsy (Punch Biopsy)',
    imagingCategory: 'skin biopsy',
    findingsField: 'skinFindings', findingsKeyword: 'basal cell',
  },
  {
    modality: 'derm', category: 'squamous_cell',
    diagnosis: 'Cutaneous Squamous Cell Carcinoma', system: 'Hematologic / Oncologic', difficulty: 'Clinical',
    expectedImagingName: 'Skin Biopsy (Punch Biopsy)',
    imagingCategory: 'skin biopsy',
    findingsField: 'skinFindings', findingsKeyword: 'squamous cell',
  },
  {
    modality: 'derm', category: 'nevus',
    diagnosis: 'Dysplastic Melanocytic Nevus', system: 'Hematologic / Oncologic', difficulty: 'Foundations',
    expectedImagingName: 'Dermoscopy',
    imagingCategory: 'dermoscopy',
    findingsField: 'skinFindings', findingsKeyword: 'dysplastic nevus',
  },
  // ── FUNDUS ──
  {
    modality: 'fundus', category: 'amd',
    diagnosis: 'Neovascular Age-Related Macular Degeneration', system: 'Neurologic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography and OCT',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'macular degeneration',
  },
  {
    modality: 'fundus', category: 'diabetic_retinopathy',
    diagnosis: 'Proliferative Diabetic Retinopathy', system: 'Endocrine / Metabolic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography (Dilated Eye Exam)',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'diabetic retinopathy',
  },
  {
    modality: 'fundus', category: 'glaucoma',
    diagnosis: 'Primary Open-Angle Glaucoma', system: 'Neurologic', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography with Tonometry',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'glaucoma',
  },
  {
    modality: 'fundus', category: 'hypertensive',
    diagnosis: 'Grade III Hypertensive Retinopathy', system: 'Cardiovascular', difficulty: 'Clinical',
    expectedImagingName: 'Fundus Photography (Dilated Eye Exam)',
    imagingCategory: 'fundus photography',
    findingsField: 'fundusFindings', findingsKeyword: 'hypertensive retinopathy',
  },
  // ── URINE ──
  {
    modality: 'urine', category: 'uti',
    diagnosis: 'Acute Uncomplicated Cystitis (UTI)', system: 'Renal', difficulty: 'Foundations',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'bacteria urine',
  },
  {
    modality: 'urine', category: 'nephrotic',
    diagnosis: 'Minimal Change Disease (Nephrotic Syndrome)', system: 'Renal', difficulty: 'Clinical',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'nephrotic',
  },
  {
    modality: 'urine', category: 'nephritic',
    diagnosis: 'IgA Nephropathy (Berger Disease)', system: 'Renal', difficulty: 'Clinical',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'rbc casts',
  },
  {
    modality: 'urine', category: 'kidney_stone',
    diagnosis: 'Calcium Oxalate Nephrolithiasis', system: 'Renal', difficulty: 'Foundations',
    expectedImagingName: 'Urine Microscopy',
    imagingCategory: 'urine microscopy',
    findingsField: 'urineFindings', findingsKeyword: 'calcium oxalate',
  },
]

// ── Chest films (NIH ChestX-ray14). Labeled by FINDING, not diagnosis — a
//    finding underdetermines the diagnosis, so each finding maps to ONE
//    representative diagnosis that classically produces it. These are EDITABLE
//    clinical-content defaults; adjust the diagnosis/difficulty as you see fit.
//    Chest is radiology (imagingResults), so no findingsField. ──────────────────
export const CHEST_COMBOS = [
  { modality: 'chest', category: 'Consolidation',     diagnosis: 'Lobar Pneumococcal Pneumonia',              system: 'Respiratory',              difficulty: 'Foundations', expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'lobar consolidation' },
  { modality: 'chest', category: 'Pneumonia',         diagnosis: 'Aspiration Pneumonia',                       system: 'Respiratory',              difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'dependent-segment consolidation' },
  // Infiltration: moved off a 3rd pneumonia → reactivation TB (distinct, can't-miss).
  { modality: 'chest', category: 'Infiltration',      diagnosis: 'Reactivation Pulmonary Tuberculosis',        system: 'Infectious',               difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'upper-lobe cavitary infiltrate' },
  { modality: 'chest', category: 'Effusion',          diagnosis: 'Parapneumonic Pleural Effusion',             system: 'Respiratory',              difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'pleural effusion' },
  { modality: 'chest', category: 'Cardiomegaly',      diagnosis: 'Congestive Heart Failure',                   system: 'Cardiovascular',           difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'cardiomegaly' },
  // Edema: split from CHF → non-cardiogenic ARDS. Radiographically similar to
  // cardiogenic edema — the distinction is clinical, which is the teaching point.
  { modality: 'chest', category: 'Edema',             diagnosis: 'Acute Respiratory Distress Syndrome (ARDS)', system: 'Respiratory',              difficulty: 'Advanced',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'diffuse bilateral airspace opacities' },
  { modality: 'chest', category: 'Pneumothorax',      diagnosis: 'Primary Spontaneous Pneumothorax',           system: 'Respiratory',              difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'pneumothorax' },
  { modality: 'chest', category: 'Emphysema',         diagnosis: 'COPD (Emphysema-predominant)',               system: 'Respiratory',              difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'hyperinflation' },
  // Atelectasis: reframed from "post-obstructive" (implies tumor → overlaps Mass)
  // to mucus plugging, keeping it distinct from the lung-cancer case.
  { modality: 'chest', category: 'Atelectasis',       diagnosis: 'Lobar Atelectasis from Mucus Plugging',      system: 'Respiratory',              difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'lobar collapse' },
  { modality: 'chest', category: 'Mass',              diagnosis: 'Non-Small Cell Lung Cancer',                 system: 'Hematologic / Oncologic',  difficulty: 'Advanced',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'lung mass' },
  // Nodule + Mass are the classic benign-vs-malignant SPN dyad; Nodule is a
  // workup/reassurance case → Clinical, not Advanced.
  { modality: 'chest', category: 'Nodule',            diagnosis: 'Pulmonary Granuloma (Histoplasmosis)',       system: 'Infectious',               difficulty: 'Clinical',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'solitary pulmonary nodule' },
  { modality: 'chest', category: 'Fibrosis',          diagnosis: 'Idiopathic Pulmonary Fibrosis',              system: 'Respiratory',              difficulty: 'Advanced',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'reticular fibrosis' },
  { modality: 'chest', category: 'Pleural_Thickening', diagnosis: 'Asbestos-related Pleural Disease',          system: 'Respiratory',              difficulty: 'Advanced',    expectedImagingName: 'Chest X-Ray (PA and Lateral)', imagingCategory: 'pleural thickening' },
]

export const ALL_COMBOS = [...SPECIAL_COMBOS, ...CHEST_COMBOS]

import { MASTER_TEST_LIST } from './testMasterList'

/**
 * Syndrome order sets + common-core panel (ordering-complexity reduction).
 *
 * Real clinicians don't recall 250 test names — they reach for the standard
 * workup of a PRESENTING SYNDROME and add specifics. These sets model that:
 * they are keyed to the chief complaint (which the student already sees), never
 * to anything case-derived, so they scaffold without cueing the diagnosis.
 * Knowing the standard workup for a presentation IS the competency being
 * taught; test-by-test recall is not.
 *
 * Every name here MUST be an exact MASTER_TEST_LIST entry (asserted by the
 * unit tests) so ordering a set resolves to real results.
 */

export interface OrderSet {
  id: string
  label: string
  /** Lowercased keyword patterns matched against the chief complaint (+HPI fallback). */
  triggers: string[]
  /** Canonical test names — the defensible standard workup for this presentation. */
  tests: string[]
}

/**
 * The ~common core: the tests that appear in the overwhelming majority of
 * correct workups. Shown always at scaffolded difficulties; the long tail
 * lives behind search only.
 */
export const COMMON_CORE_TESTS: string[] = [
  'Complete Blood Count (CBC)',
  'Basic Metabolic Panel (BMP)',
  'Comprehensive Metabolic Panel (CMP)',
  'Liver Function Tests (LFTs)',
  'Urinalysis with Microscopy',
  'C-Reactive Protein (CRP)',
  'Troponin I or T (high sensitivity)',
  'BNP / NT-proBNP',
  'Lactate (Serum)',
  'Prothrombin Time (PT) / INR',
  'Thyroid Stimulating Hormone (TSH)',
  'Blood Culture x2',
  'Point-of-Care Glucose (Fingerstick)',
  'Urine Pregnancy Test (hCG)',
  'Electrocardiogram (ECG/EKG)',
  'Chest X-Ray (PA and Lateral)',
]

export const ORDER_SETS: OrderSet[] = [
  {
    id: 'chest-pain',
    label: 'Chest pain workup',
    triggers: ['chest pain', 'chest pressure', 'chest tightness', 'chest discomfort', 'substernal'],
    tests: [
      'Electrocardiogram (ECG/EKG)',
      'Troponin I or T (high sensitivity)',
      'Chest X-Ray (PA and Lateral)',
      'Complete Blood Count (CBC)',
      'Basic Metabolic Panel (BMP)',
      'D-Dimer',
      'BNP / NT-proBNP',
    ],
  },
  {
    id: 'dyspnea',
    label: 'Shortness of breath workup',
    triggers: ['shortness of breath', 'dyspnea', 'difficulty breathing', 'breathless', 'trouble breathing', 'short of breath'],
    tests: [
      'Chest X-Ray (PA and Lateral)',
      'Electrocardiogram (ECG/EKG)',
      'BNP / NT-proBNP',
      'Troponin I or T (high sensitivity)',
      'Complete Blood Count (CBC)',
      'Basic Metabolic Panel (BMP)',
      'Venous Blood Gas (VBG)',
      'D-Dimer',
    ],
  },
  {
    id: 'abdominal-pain',
    label: 'Abdominal pain workup',
    triggers: ['abdominal pain', 'belly pain', 'stomach pain', 'abdominal discomfort', 'epigastric', 'flank pain'],
    tests: [
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Lipase / Amylase',
      'Urinalysis with Microscopy',
      'Urine Pregnancy Test (hCG)',
      'CT Abdomen and Pelvis with Contrast',
      'Abdominal Ultrasound',
    ],
  },
  {
    id: 'ams',
    label: 'Altered mental status workup',
    triggers: ['altered mental status', 'confusion', 'confused', 'altered', 'unresponsive', 'lethargy', 'disoriented'],
    tests: [
      'Point-of-Care Glucose (Fingerstick)',
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Urinalysis with Microscopy',
      'Urine Drug Screen (UDS)',
      'Blood Alcohol Level (BAL)',
      'CT Head without Contrast',
      'Serum Ammonia',
      'Thyroid Stimulating Hormone (TSH)',
    ],
  },
  {
    id: 'fever',
    label: 'Fever / sepsis workup',
    triggers: ['fever', 'febrile', 'chills', 'rigors', 'sepsis', 'infection'],
    tests: [
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Blood Culture x2',
      'Urinalysis with Microscopy',
      'Urine Culture and Sensitivity',
      'Lactate (Serum)',
      'Chest X-Ray (PA and Lateral)',
      'Procalcitonin',
    ],
  },
  {
    id: 'headache',
    label: 'Headache workup',
    triggers: ['headache', 'head pain', 'worst headache'],
    tests: [
      'CT Head without Contrast',
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Erythrocyte Sedimentation Rate (ESR)',
      'Lumbar Puncture (CSF Analysis)',
    ],
  },
  {
    id: 'syncope',
    label: 'Syncope workup',
    triggers: ['syncope', 'fainting', 'passed out', 'loss of consciousness', 'blacked out', 'collapse'],
    tests: [
      'Electrocardiogram (ECG/EKG)',
      'Troponin I or T (high sensitivity)',
      'Complete Blood Count (CBC)',
      'Basic Metabolic Panel (BMP)',
      'Echocardiogram (Transthoracic)',
    ],
  },
  {
    id: 'focal-neuro',
    label: 'Focal neuro deficit workup',
    triggers: ['weakness', 'numbness', 'slurred speech', 'facial droop', 'stroke', 'trouble speaking', 'vision loss', 'one side'],
    tests: [
      'CT Head without Contrast',
      'Point-of-Care Glucose (Fingerstick)',
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Electrocardiogram (ECG/EKG)',
      'MRI Brain with and without Contrast',
    ],
  },
  {
    id: 'gi-bleed',
    label: 'GI bleeding workup',
    triggers: ['blood in stool', 'melena', 'hematemesis', 'vomiting blood', 'rectal bleeding', 'gi bleed', 'black stool'],
    tests: [
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Prothrombin Time (PT) / INR',
      'Partial Thromboplastin Time (PTT)',
      'Upper Endoscopy (EGD)',
    ],
  },
  {
    id: 'fatigue',
    label: 'Fatigue workup',
    triggers: ['fatigue', 'tired', 'tiredness', 'malaise', 'lethargic', 'exhaustion', 'weakness and fatigue'],
    tests: [
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Thyroid Stimulating Hormone (TSH)',
      'Serum Iron / TIBC / Ferritin',
      'Hemoglobin A1c (HbA1c)',
      'Vitamin B12 / Folate',
    ],
  },
  {
    id: 'palpitations',
    label: 'Palpitations workup',
    triggers: ['palpitations', 'heart racing', 'racing heart', 'irregular heartbeat', 'skipped beats'],
    tests: [
      'Electrocardiogram (ECG/EKG)',
      'Thyroid Stimulating Hormone (TSH)',
      'Complete Blood Count (CBC)',
      'Basic Metabolic Panel (BMP)',
      'Troponin I or T (high sensitivity)',
      'Holter Monitor (24-hour)',
    ],
  },
  {
    id: 'cough',
    label: 'Cough workup',
    triggers: ['cough', 'coughing', 'productive cough', 'hemoptysis', 'coughing up blood'],
    tests: [
      'Chest X-Ray (PA and Lateral)',
      'Complete Blood Count (CBC)',
      'Sputum Culture and Sensitivity',
      'Influenza A/B PCR',
      'COVID-19 PCR',
      'Procalcitonin',
    ],
  },
  {
    id: 'leg-swelling',
    label: 'Leg swelling / edema workup',
    triggers: ['leg swelling', 'swollen leg', 'calf pain', 'leg pain and swelling', 'edema', 'unilateral swelling'],
    tests: [
      'Venous Doppler Ultrasound Bilateral Lower Extremities',
      'D-Dimer',
      'BNP / NT-proBNP',
      'Comprehensive Metabolic Panel (CMP)',
      'Urinalysis with Microscopy',
    ],
  },
  {
    id: 'weight-loss',
    label: 'Weight loss workup',
    triggers: ['weight loss', 'losing weight', 'unintentional weight loss', 'cachexia'],
    tests: [
      'Complete Blood Count (CBC)',
      'Comprehensive Metabolic Panel (CMP)',
      'Thyroid Stimulating Hormone (TSH)',
      'Hemoglobin A1c (HbA1c)',
      'HIV Antibody / Antigen (4th Gen)',
      'CT Chest with Contrast',
      'Erythrocyte Sedimentation Rate (ESR)',
    ],
  },
]

function normalize(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Match order sets against the presenting complaint (and HPI as fallback).
 * Returns the matched sets in trigger-specificity order, capped at `limit`,
 * so the UI never buries the student in every possible set.
 */
export function matchOrderSets(chiefComplaint: string, hpi = '', limit = 3): OrderSet[] {
  const ccText = normalize(chiefComplaint)
  const hpiText = normalize(hpi)

  const scored = ORDER_SETS
    .map(set => {
      // Prefer chief-complaint hits (weight 2) over HPI-only hits (weight 1).
      let score = 0
      for (const t of set.triggers) {
        const nt = normalize(t)
        if (ccText.includes(nt)) score = Math.max(score, 2)
        else if (hpiText.includes(nt)) score = Math.max(score, 1)
      }
      return { set, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, limit).map(x => x.set)
}

/** Dev/test guard: every set + core name must exist in MASTER_TEST_LIST. */
export function findUnknownOrderSetTests(): string[] {
  const known = new Set(MASTER_TEST_LIST.map(t => t.name))
  const all = new Set<string>([...COMMON_CORE_TESTS, ...ORDER_SETS.flatMap(s => s.tests)])
  return Array.from(all).filter(name => !known.has(name))
}

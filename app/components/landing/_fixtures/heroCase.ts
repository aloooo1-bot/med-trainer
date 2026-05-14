// Real case sourced from scripts/backups/audit-fixes-2026-05-06T03-34-28-929Z/
// cardiovascular-clinical-hypertensive-emergency-0.json
// Values are unchanged from the seed — only the field selection is curated.

export const HERO_CASE = {
  id: 'cardiovascular-clinical-hypertensive-emergency-0',
  system: 'Cardiovascular',
  systemShort: 'Cardio',
  difficulty: 'Clinical',
  diagnosis: 'Hypertensive Emergency',
  patient: {
    name: 'John Smith',
    age: 58,
    sex: 'M',
    height: `5'10"`,
  },
  chiefComplaint: 'Severe headache and blurry vision for the past 3 hours',
  hpi: '58-year-old male presenting with severe occipital headache and blurry vision for 3 hours. He has a history of hypertension.',
  vitals: [
    { label: 'BP',   val: '226/138', unit: 'mmHg', crit: true  },
    { label: 'HR',   val: '94',      unit: 'bpm',  crit: false },
    { label: 'RR',   val: '18',      unit: '/min', crit: false },
    { label: 'Temp', val: '98.4',    unit: '°F',   crit: false },
    { label: 'SpO2', val: '97',      unit: '%',    crit: false },
    { label: 'Wt',   val: '214',     unit: 'lb',   crit: false },
  ],
  ecg: {
    src: '/ecg/lvh/00030.svg',
    findings: 'LVH by voltage criteria (Sokolow-Lyon 38 mm). No acute ST changes.',
    alt: 'Real 12-lead ECG from PTB-XL dataset showing left ventricular hypertrophy by voltage criteria',
  },
  triage: 'Urgent · ESI 2',
  timerLabel: '22:00 on clock',
} as const

// 12 canonical organ systems — pulled from app/lib/caseManifest.ts MANIFEST keys
// and app/trainer/page.tsx SYSTEMS list. Scores are illustrative only.
export const SYSTEM_HEATMAP: { full: string; short: string; score: number; v: 'ok' | 'warn' | 'bad' }[] = [
  { full: 'Cardiovascular',          short: 'Cardio', score: 82, v: 'ok'   },
  { full: 'Respiratory',             short: 'Resp',   score: 74, v: 'warn' },
  { full: 'Neurologic',              short: 'Neuro',  score: 55, v: 'bad'  },
  { full: 'Gastrointestinal',        short: 'GI',     score: 61, v: 'bad'  },
  { full: 'Renal',                   short: 'Renal',  score: 68, v: 'warn' },
  { full: 'Endocrine / Metabolic',   short: 'Endo',   score: 77, v: 'warn' },
  { full: 'Infectious',              short: 'ID',     score: 65, v: 'warn' },
  { full: 'Hematologic / Oncologic', short: 'Heme',   score: 71, v: 'warn' },
  { full: 'Musculoskeletal',         short: 'MSK',    score: 88, v: 'ok'   },
  { full: 'Psychiatric',             short: 'Psych',  score: 79, v: 'warn' },
  { full: 'Toxicologic',             short: 'Tox',    score: 83, v: 'ok'   },
  { full: 'Trauma',                  short: 'Trauma', score: 72, v: 'warn' },
]

// Real case titles from app/lib/caseManifest.ts — each is backed by an authored
// case JSON in scripts/backups/audit-fixes-2026-05-06T03-34-28-929Z/
export const STUDY_QUEUE = [
  { short: 'Neuro', title: 'Bacterial Meningitis',         diff: 'Foundations' },
  { short: 'Resp',  title: 'Community-Acquired Pneumonia', diff: 'Clinical'    },
  { short: 'GI',    title: 'Small Bowel Obstruction',      diff: 'Advanced'    },
] as const

// All four "How it works" animations share one case so the row reads as one continuous encounter.
// Source: scripts/backups/audit-fixes-2026-05-06T03-34-28-929Z/
// respiratory-clinical-community-acquired-pneumonia-0.json
export const ANIMATION_DIAGNOSIS = 'Community-Acquired Pneumonia'

// physicalExam{} verbatim from the CAP case (9 systems).
// Pulmonary first so the RLL consolidation story anchors at the top of the scroll.
export const EXAM_FINDINGS = [
  { system: 'Pulmonary',      finding: 'Dullness to percussion RLL. Bronchial breath sounds and egophony at right base. Coarse crackles RLL.' },
  { system: 'General',        finding: 'Ill-appearing, flushed male in moderate respiratory distress. Alert and oriented x3 but fatigued.' },
  { system: 'Cardiovascular', finding: 'Tachycardic at 108 bpm, regular rhythm. Normal S1/S2. No murmurs, rubs, or gallops.' },
  { system: 'HEENT',          finding: 'Mucous membranes mildly dry. Oropharynx mildly erythematous without exudate.' },
  { system: 'Neck',           finding: 'Supple. No lymphadenopathy. No JVD. Trachea midline.' },
  { system: 'Abdomen',        finding: 'Soft, non-tender, non-distended. Normal bowel sounds. No hepatosplenomegaly.' },
  { system: 'Extremities',    finding: 'Warm, well-perfused. No cyanosis, clubbing, or edema. Cap refill 2 s.' },
  { system: 'Neurological',   finding: 'Alert and oriented x3. CN II–XII intact. No focal deficits. No nuchal rigidity.' },
  { system: 'Skin',           finding: 'Warm and flushed. No rash, petechiae, or cyanosis.' },
] as const

// Real labResults from the CAP case — 5 rows that tell the bacterial-pneumonia story.
export const LAB_ROWS: readonly { test: string; value: string; unit: string; status: 'critical' | 'abnormal' | 'normal' }[] = [
  { test: 'WBC',           value: '18.4',     unit: 'x10³/µL', status: 'critical' },
  { test: 'Procalcitonin', value: '3.8',      unit: 'ng/mL',   status: 'critical' },
  { test: 'CRP',           value: '182',      unit: 'mg/L',    status: 'critical' },
  { test: 'PaO2',          value: '58',       unit: 'mmHg',    status: 'critical' },
  { test: 'Strep pneumo',  value: 'Positive', unit: '',        status: 'abnormal' },
]

// imagingResults["Chest X-Ray (PA and Lateral)"] — verbatim interpretation from the CAP case.
export const IMAGING_RESULT = {
  src: '/imaging/00000001_000.png',
  alt: 'Chest X-ray returned for the Community-Acquired Pneumonia case',
  test: 'Chest X-Ray (PA and Lateral)',
  interpretation: 'RLL consolidation with air bronchograms — lobar pneumonia. Small right parapneumonic effusion.',
} as const

// Three-line clinical reasoning from the CAP case teachingPoints + labs/exam.
export const CLINICAL_REASONING: readonly [string, string, string] = [
  'Fever 102.9, RR 24, SpO2 92%, RLL bronchial breath sounds + egophony',
  '→ lobar consolidation on CXR + WBC 18.4, procalcitonin 3.8 = bacterial CAP',
  'CURB-65 = 2 (confusion + tachypnea); admit. S. pneumoniae urinary antigen positive.',
]

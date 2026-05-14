export interface ScorecardData {
  history: string; testing: string; diagnosis: string
  completeness: string; reasoning: string; efficiency: string
}

export interface CaseEntry {
  date: string; system: string; level: string; score: number; correct: boolean
  yourDx: string; correctDx: string
  scorecard: ScorecardData
  strengths: string[]; missed: string[]; teaching: string
  time: string; questions: number
}

export interface SystemEntry { name: string; score: number; count: number }

export const MOCK_CASES: CaseEntry[] = [
  {
    date: 'May 2, 2026', system: 'Hematologic / Oncologic', level: 'Clinical',
    score: 50, correct: false, yourDx: 'Chronic kidney disease', correctDx: 'Multiple Myeloma',
    scorecard: { history: '10/18', testing: '14/18', diagnosis: '8/27', completeness: '4/13', reasoning: '4/14', efficiency: '10/10' },
    strengths: ['Identified renal involvement and heavy proteinuria', 'Recognized confusion as clinically important', 'Ordered serum free light chains'],
    missed: ['Pain in ribs, hips, other bones?', 'Bone fractures with minimal trauma?', 'Susceptible to infections requiring antibiotics?', 'Increased thirst or urination?'],
    teaching: 'Multiple myeloma classically presents with CRAB criteria: hyperCalcemia, Renal insufficiency, Anemia, Bone lesions.',
    time: '12m 24s', questions: 11,
  },
  {
    date: 'May 1, 2026', system: 'Respiratory', level: 'Foundations',
    score: 56, correct: false, yourDx: 'Viral pneumonia', correctDx: 'Pulmonary Embolism',
    scorecard: { history: '8/18', testing: '12/18', diagnosis: '6/27', completeness: '5/13', reasoning: '5/14', efficiency: '10/10' },
    strengths: ['Asked about travel history', 'Noted tachycardia', 'Ordered D-dimer'],
    missed: ['Sudden onset pleuritic chest pain?', 'Leg swelling or calf tenderness?', 'Recent prolonged immobility?'],
    teaching: 'Wells Score should be applied for any unexplained tachycardia + dyspnea. PE is the great masquerader.',
    time: '10m 02s', questions: 9,
  },
  {
    date: 'May 1, 2026', system: 'Toxicologic', level: 'Advanced',
    score: 89, correct: true, yourDx: 'Acetaminophen overdose', correctDx: 'Acetaminophen overdose',
    scorecard: { history: '16/18', testing: '17/18', diagnosis: '27/27', completeness: '11/13', reasoning: '12/14', efficiency: '10/10' },
    strengths: ['Immediately ordered Rumack-Matthew nomogram', 'Asked time of ingestion accurately', 'Correctly initiated NAC protocol'],
    missed: ['Baseline LFTs documentation?'],
    teaching: 'NAC is protective even after 24h in severe cases. Fulminant hepatic failure criteria guide transplant evaluation.',
    time: '8m 15s', questions: 14,
  },
  {
    date: 'Apr 30, 2026', system: 'Psychiatric', level: 'Foundations',
    score: 73, correct: true, yourDx: 'Major depressive disorder', correctDx: 'Major depressive disorder',
    scorecard: { history: '14/18', testing: '10/18', diagnosis: '20/27', completeness: '9/13', reasoning: '10/14', efficiency: '10/10' },
    strengths: ['Used PHQ-9 criteria', 'Asked about suicidal ideation', 'Assessed functional impairment'],
    missed: ['Prior manic episodes?', 'Family psychiatric history?'],
    teaching: 'Always rule out bipolar disorder before initiating antidepressants — an antidepressant alone in bipolar can precipitate mania.',
    time: '11m 40s', questions: 12,
  },
  {
    date: 'Apr 30, 2026', system: 'Cardiovascular', level: 'Clinical',
    score: 81, correct: true, yourDx: 'NSTEMI', correctDx: 'NSTEMI',
    scorecard: { history: '15/18', testing: '16/18', diagnosis: '22/27', completeness: '10/13', reasoning: '11/14', efficiency: '10/10' },
    strengths: ['Ordered troponin trend appropriately', 'Assessed TIMI score', 'Recognized high-risk features'],
    missed: ['Prior PCI or CABG history?', 'GRACE score calculation?'],
    teaching: 'NSTEMI management: dual antiplatelet + anticoagulation within 24h for high-risk; catheterization timing per risk stratification.',
    time: '9m 55s', questions: 13,
  },
  {
    date: 'Apr 29, 2026', system: 'Endocrine / Metabolic', level: 'Foundations',
    score: 84, correct: true, yourDx: 'Type 2 Diabetes', correctDx: 'Type 2 Diabetes',
    scorecard: { history: '15/18', testing: '15/18', diagnosis: '23/27', completeness: '10/13', reasoning: '11/14', efficiency: '10/10' },
    strengths: ['Correctly identified metabolic syndrome features', 'Ordered HbA1c', 'Asked about family history'],
    missed: ['MODY considerations in younger patients?', 'Screening for complications at diagnosis?'],
    teaching: 'At T2DM diagnosis, screen for retinopathy, nephropathy, neuropathy, and cardiovascular disease.',
    time: '10m 30s', questions: 11,
  },
]

export const MOCK_SYSTEMS: SystemEntry[] = [
  { name: 'Neurologic', score: 41, count: 1 },
  { name: 'Musculoskeletal', score: 48, count: 1 },
  { name: 'Infectious', score: 55, count: 1 },
  { name: 'Hematologic / Oncologic', score: 68, count: 2 },
  { name: 'Respiratory', score: 68, count: 2 },
  { name: 'Psychiatric', score: 73, count: 1 },
  { name: 'Renal', score: 76, count: 1 },
  { name: 'Endocrine / Metabolic', score: 84, count: 1 },
  { name: 'Cardiovascular', score: 85, count: 2 },
  { name: 'Toxicologic', score: 89, count: 1 },
  { name: 'Gastrointestinal', score: 92, count: 1 },
]

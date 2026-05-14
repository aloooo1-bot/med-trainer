export const PENDING_TESTS = new Set([
  'Blood Culture', 'Blood Cultures', 'Urine Culture', 'ANA', 'Anti-dsDNA', 'Complement Levels',
  'C3', 'C4', 'ANCA', 'SPEP', 'UPEP', 'Bone Marrow Biopsy', 'Flow Cytometry',
  'Hepatitis B Surface Antigen', 'Hepatitis C Antibody', 'HIV Antigen/Antibody',
  'RPR', 'Lyme Disease Antibody', 'Lyme Serology', 'EBV Antibody', 'CMV IgG/IgM',
  'QuantiFERON-TB Gold', 'QFT-TB', 'CSF Culture', 'Anti-CCP', 'Anti-PLA2R Antibody',
  '24-Hour Urine Protein', '24-Hour Urine Cortisol', 'ACTH Stimulation Test',
  'Genetic Panel', 'Chromosomal Microarray', 'Factor V Leiden', 'Prothrombin Gene Mutation',
  'Biopsy Pathology', 'Surgical Pathology', 'Tissue Pathology',
])

export const PENDING_HOURS: Record<string, string> = {
  'Blood Culture': '48-72h', 'Blood Cultures': '48-72h', 'Urine Culture': '24-48h',
  'ANA': '24-48h', 'Anti-dsDNA': '24-48h', 'Complement Levels': '24h', 'C3': '24h', 'C4': '24h',
  'ANCA': '48-72h', 'SPEP': '24-48h', 'UPEP': '24-48h', 'Bone Marrow Biopsy': '5-7 days',
  'Flow Cytometry': '2-3 days', 'Hepatitis B Surface Antigen': '24h', 'Hepatitis C Antibody': '24h',
  'HIV Antigen/Antibody': '24h', 'RPR': '24h', 'Lyme Disease Antibody': '48-72h',
  'Lyme Serology': '48-72h', 'EBV Antibody': '48h', 'CMV IgG/IgM': '48h',
  'QuantiFERON-TB Gold': '48-72h', 'QFT-TB': '48-72h', 'CSF Culture': '48-72h',
  'Anti-CCP': '24-48h', 'Anti-PLA2R Antibody': '48-72h', '24-Hour Urine Protein': '24h',
  '24-Hour Urine Cortisol': '24-48h', 'ACTH Stimulation Test': '24h',
  'Biopsy Pathology': '3-5 days', 'Surgical Pathology': '2-4 days', 'Tissue Pathology': '3-5 days',
}

export function isPendingTest(name: string): boolean {
  return PENDING_TESTS.has(name) ||
    [...PENDING_TESTS].some(p => name.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(name.toLowerCase()))
}

export function pendingHours(name: string): string {
  return PENDING_HOURS[name] ?? [...Object.entries(PENDING_HOURS)].find(([k]) => name.toLowerCase().includes(k.toLowerCase()))?.[1] ?? '24-72h'
}

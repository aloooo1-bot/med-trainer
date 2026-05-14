export function normalizeTestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[/\-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const TEST_ALIASES: Array<[string[], string]> = [
  // ── Procedures ──
  [['ecg', 'ekg', 'electrocardiogram', '12 lead ecg', '12 lead ekg'], 'ECG'],
  [['upper endoscopy', 'egd', 'esophagogastroduodenoscopy', 'upper gi endoscopy', 'gastroscopy'], 'upper endoscopy'],
  [['colonoscopy', 'lower endoscopy', 'coloscopy'], 'colonoscopy'],
  [['bronchoscopy', 'flexible bronchoscopy'], 'bronchoscopy'],
  [['lumbar puncture', 'lp', 'spinal tap', 'csf analysis'], 'lumbar puncture'],
  [['bone marrow biopsy', 'bmb', 'bone marrow aspirate', 'bone marrow'], 'bone marrow biopsy'],
  [['renal biopsy', 'kidney biopsy'], 'renal biopsy'],
  [['liver biopsy', 'hepatic biopsy'], 'liver biopsy'],
  [['paracentesis', 'abdominal tap', 'ascites tap'], 'paracentesis'],
  [['thoracentesis', 'pleural tap', 'pleural fluid analysis'], 'thoracentesis'],
  [['arthrocentesis', 'joint aspiration', 'synovial fluid analysis', 'synovial fluid'], 'arthrocentesis'],
  // ── Cardiac biomarkers ──
  [['troponin', 'troponin i', 'troponin t', 'troponin i or t', 'high sensitivity troponin', 'hs troponin', 'hstroponin', 'cardiac troponin'], 'Troponin'],
  [['bnp', 'nt probnp', 'ntprobnp', 'brain natriuretic peptide', 'nt pro bnp'], 'BNP'],
  [['ck mb', 'ckmb', 'creatine kinase mb', 'creatine kinase myocardial band'], 'CK-MB'],
  // ── CBC / panels ──
  [['cbc', 'complete blood count', 'full blood count', 'hemogram', 'cbc with differential', 'cbc with diff'], 'CBC'],
  [['cmp', 'comprehensive metabolic panel', 'comprehensive metabolic'], 'CMP'],
  [['bmp', 'basic metabolic panel', 'basic metabolic', 'renal panel', 'electrolytes panel'], 'BMP'],
  [['hba1c', 'hemoglobin a1c', 'a1c', 'glycated hemoglobin', 'glycosylated hemoglobin'], 'HbA1c'],
  // ── Liver / metabolic ──
  [['lfts', 'lft', 'liver function tests', 'liver function', 'liver panel', 'hepatic panel', 'alt ast bilirubin'], 'LFTs'],
  [['ldh', 'lactate dehydrogenase', 'lactic dehydrogenase'], 'LDH'],
  [['lipase', 'amylase', 'lipase amylase', 'pancreatic enzymes', 'pancreatic panel'], 'Lipase/Amylase'],
  [['tsh', 'thyroid stimulating hormone', 'thyroid function test', 'thyroid screen'], 'TSH'],
  [['crp', 'c reactive protein', 'creactive protein', 'c-reactive protein'], 'CRP'],
  [['esr', 'erythrocyte sedimentation rate', 'sed rate', 'sedimentation rate', 'westergren'], 'ESR'],
  // ── Coagulation ──
  [['pt inr', 'pt', 'inr', 'prothrombin time', 'prothrombin time inr', 'coagulation pt', 'coags pt'], 'PT/INR'],
  [['ptt', 'aptt', 'partial thromboplastin time', 'activated partial thromboplastin time', 'coagulation ptt', 'coags ptt'], 'PTT'],
  [['d dimer', 'ddimer', 'fibrin degradation products', 'fibrin split products', 'fdp'], 'D-Dimer'],
]

export function findResultKey(orderedName: string, results: Record<string, unknown>): string | null {
  if (orderedName in results) return orderedName
  const normOrdered = normalizeTestName(orderedName)
  for (const key of Object.keys(results)) {
    if (normalizeTestName(key) === normOrdered) return key
  }
  for (const [aliases] of TEST_ALIASES) {
    if (aliases.includes(normOrdered)) {
      for (const key of Object.keys(results)) {
        if (aliases.includes(normalizeTestName(key))) return key
      }
    }
  }
  if (normOrdered.length >= 4) {
    for (const key of Object.keys(results)) {
      const normKey = normalizeTestName(key)
      if (normKey.length >= 4 && (normOrdered.includes(normKey) || normKey.includes(normOrdered))) return key
    }
  }
  return null
}

export function getPanelSummary(components: Array<{ name: string; value: string; unit: string; referenceRange: string; status: string }>): string {
  const abnormal = components.filter(c => c.status === 'abnormal' || c.status === 'critical')
  if (abnormal.length === 0) return 'All values within normal limits'
  return abnormal
    .slice(0, 3)
    .map(c => `${c.name} ${c.value}${c.unit ? ' ' + c.unit : ''} (${c.status === 'critical' ? 'CRIT' : 'A'})`)
    .join(', ')
}

export function parseDirection(valueStr: string, refRange: string): 'high' | 'low' | null {
  const val = parseFloat(valueStr)
  if (isNaN(val)) return null
  const r = refRange.trim()
  const rangeMatch = r.match(/^([\d.]+)\s*[-–]\s*([\d.]+)$/)
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1]), hi = parseFloat(rangeMatch[2])
    if (!isNaN(lo) && !isNaN(hi)) return val > hi ? 'high' : val < lo ? 'low' : null
  }
  const upperMatch = r.match(/^[<≤]\s*([\d.]+)$/)
  if (upperMatch) { const hi = parseFloat(upperMatch[1]); return (!isNaN(hi) && val > hi) ? 'high' : null }
  const lowerMatch = r.match(/^[>≥]\s*([\d.]+)$/)
  if (lowerMatch) { const lo = parseFloat(lowerMatch[1]); return (!isNaN(lo) && val < lo) ? 'low' : null }
  return null
}

export function getVitalStatus(label: string, value: string): { abnormal: boolean; direction: 'high' | 'low' | null } {
  const n = Number(value)
  if (label === 'HR')   return n > 100 ? { abnormal: true, direction: 'high' } : n < 60  ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'RR')   return n > 20  ? { abnormal: true, direction: 'high' } : n < 12  ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'Temp') return n > 99.5 ? { abnormal: true, direction: 'high' } : n < 97 ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'SpO₂') return n < 95 ? { abnormal: true, direction: 'low' } : { abnormal: false, direction: null }
  if (label === 'BP') {
    const parts = value.replace(/[^\d/]/g, '').split('/')
    const sys = parseInt(parts[0] ?? ''), dia = parseInt(parts[1] ?? '')
    if (!isNaN(sys) && !isNaN(dia)) {
      if (sys > 139 || dia > 89) return { abnormal: true, direction: 'high' }
      if (sys < 90  || dia < 60) return { abnormal: true, direction: 'low' }
    }
  }
  return { abnormal: false, direction: null }
}

export function isECGTest(name: string): boolean {
  const n = normalizeTestName(name)
  return n.includes('ecg') || n.includes('ekg') || n.includes('electrocardiogram')
}

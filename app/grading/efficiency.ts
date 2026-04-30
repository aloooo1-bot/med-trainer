export function calcEfficiency(
  difficulty: string,
  remainingSeconds: number,
  timedOut: boolean
): { score: number; feedback: string } {
  if (difficulty === 'Foundations') return { score: 0, feedback: '' }
  if (timedOut) return { score: 2, feedback: 'Case timed out. With practice, clinical efficiency improves.' }
  const rem = remainingSeconds
  if (difficulty === 'Clinical') {
    if (rem > 540) return { score: 10, feedback: 'Excellent time management — completed well within the allotted time.' }
    if (rem >= 300) return { score: 8,  feedback: 'Good pace — completed comfortably within the time limit.' }
    if (rem >= 120) return { score: 6,  feedback: 'Adequate — completed within time but room to improve efficiency.' }
    return            { score: 4,  feedback: 'Cutting it close — consider working more efficiently through the case.' }
  }
  // Advanced
  if (rem > 360) return { score: 10, feedback: 'Excellent time management — completed well within the allotted time.' }
  if (rem >= 180) return { score: 8,  feedback: 'Good pace — completed comfortably within the time limit.' }
  if (rem >= 60)  return { score: 6,  feedback: 'Adequate — completed within time but room to improve efficiency.' }
  return              { score: 4,  feedback: 'Cutting it close — consider working more efficiently through the case.' }
}

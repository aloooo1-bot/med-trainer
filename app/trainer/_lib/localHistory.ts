export interface CaseHistoryEntry {
  id: string
  date: string
  difficulty: string
  system: string
  diagnosis: string
  userDiagnosis: string
  correct: boolean
  score: number
}

const HISTORY_KEY = 'medtrainer_history'

export function getHistory(): CaseHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as CaseHistoryEntry[] } catch { return [] }
}

export function addHistoryEntry(entry: CaseHistoryEntry) {
  try {
    const h = getHistory(); h.unshift(entry); if (h.length > 50) h.splice(50)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
  } catch {}
}

const ROS_HINT_KEY = 'medtrainer_has_used_ros'

export function hasUsedROSBefore(): boolean {
  try { return localStorage.getItem(ROS_HINT_KEY) === 'true' } catch { return false }
}

export function markROSUsed(): void {
  try { localStorage.setItem(ROS_HINT_KEY, 'true') } catch {}
}

const USED_NAMES_KEY = 'medtrainer_used_names'

export function getUsedNames(): string[] {
  try { return JSON.parse(localStorage.getItem(USED_NAMES_KEY) ?? '[]') as string[] } catch { return [] }
}

export function recordUsedName(name: string) {
  try {
    const names = getUsedNames()
    if (!names.includes(name)) {
      names.push(name)
      if (names.length > 30) names.splice(0, names.length - 30)
      localStorage.setItem(USED_NAMES_KEY, JSON.stringify(names))
    }
  } catch {}
}

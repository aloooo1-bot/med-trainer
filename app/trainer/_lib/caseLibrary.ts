import type { CaseData } from './types'

type LibraryEntry = { id: string; system: string; difficulty: string; diagnosis: string; variantIndex: number; patientName: string }

const SEEN_CASES_KEY = 'medtrainer_seen_cases'

function getSeenCases(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_CASES_KEY) ?? '[]') as string[] } catch { return [] }
}

export function markCaseSeen(id: string) {
  try {
    const seen = getSeenCases()
    if (!seen.includes(id)) {
      seen.push(id)
      if (seen.length > 200) seen.splice(0, seen.length - 200)
      localStorage.setItem(SEEN_CASES_KEY, JSON.stringify(seen))
    }
  } catch {}
}

let _libraryIndex: LibraryEntry[] | null = null
let _libraryFetchPromise: Promise<LibraryEntry[]> | null = null

async function fetchLibraryIndex(): Promise<LibraryEntry[]> {
  if (_libraryIndex !== null) return _libraryIndex
  if (_libraryFetchPromise) return _libraryFetchPromise
  _libraryFetchPromise = fetch('/cases/index.json')
    .then(r => r.ok ? r.json() as Promise<LibraryEntry[]> : Promise.resolve([]))
    .then(data => { _libraryIndex = data; return data })
    .catch(() => { _libraryIndex = []; return [] })
  return _libraryFetchPromise
}

export async function loadFromLibrary(system: string, difficulty: string): Promise<CaseData | null> {
  try {
    const index = await fetchLibraryIndex()
    if (!index || index.length === 0) return null
    const seen = new Set(getSeenCases())
    const candidates = index.filter(e =>
      e.difficulty === difficulty &&
      (system === 'Any' || e.system === system) &&
      !seen.has(e.id)
    )
    if (candidates.length === 0) return null
    const entry = candidates[Math.floor(Math.random() * candidates.length)]
    const res = await fetch(`/cases/${entry.id}.json`)
    if (!res.ok) return null
    const caseData = await res.json() as CaseData
    markCaseSeen(entry.id)
    return caseData
  } catch {
    return null
  }
}

export interface FocusSettings {
  weeklyVolume: number
}

export interface FocusSkip {
  skippedAt: string
  durationDays: number
}

export type FocusSkips = Record<string, FocusSkip>

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  weeklyVolume: 5,
}

const SETTINGS_KEY = 'medtrainer_focus_settings'
const SKIPS_KEY = 'medtrainer_focus_skips'

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function loadFocusSettings(): FocusSettings {
  if (!isBrowser()) return DEFAULT_FOCUS_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_FOCUS_SETTINGS
    // Stored blobs may carry retired keys (restDays, difficultyMix — the old
    // week-plan generator's knobs); only weeklyVolume survives.
    const parsed = JSON.parse(raw) as Partial<FocusSettings>
    return {
      weeklyVolume: typeof parsed.weeklyVolume === 'number' ? parsed.weeklyVolume : DEFAULT_FOCUS_SETTINGS.weeklyVolume,
    }
  } catch {
    return DEFAULT_FOCUS_SETTINGS
  }
}

export function saveFocusSettings(settings: FocusSettings): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore quota / privacy-mode failures
  }
}

export function loadFocusSkips(): FocusSkips {
  if (!isBrowser()) return {}
  try {
    const raw = localStorage.getItem(SKIPS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' ? parsed : {}) as FocusSkips
  } catch {
    return {}
  }
}

export function saveFocusSkip(system: string, durationDays = 14): void {
  if (!isBrowser()) return
  try {
    const skips = loadFocusSkips()
    skips[system] = { skippedAt: new Date().toISOString(), durationDays }
    localStorage.setItem(SKIPS_KEY, JSON.stringify(skips))
  } catch {
    // ignore
  }
}

export function isSkipped(system: string, skips: FocusSkips = loadFocusSkips()): boolean {
  const entry = skips[system]
  if (!entry) return false
  const expiresAt = new Date(entry.skippedAt).getTime() + entry.durationDays * 86_400_000
  return Date.now() < expiresAt
}

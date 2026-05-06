import type { SystemEntry } from '@/app/lib/dashboardData'

export type DifficultyMix =
  | 'balanced'
  | 'foundations-heavy'
  | 'clinical-heavy'
  | 'advanced-heavy'

export interface FocusSettings {
  restDays: string[]
  weeklyVolume: number
  difficultyMix: DifficultyMix
}

export interface FocusSkip {
  skippedAt: string
  durationDays: number
}

export type FocusSkips = Record<string, FocusSkip>

export interface WeekPlanDay {
  day: string
  task: string
  level: string | null
  reason: string
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  restDays: ['Wed', 'Sun'],
  weeklyVolume: 5,
  difficultyMix: 'balanced',
}

export const MIN_PER_CASE_DEFAULT = 10

const SETTINGS_KEY = 'medtrainer_focus_settings'
const SKIPS_KEY = 'medtrainer_focus_skips'

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function loadFocusSettings(): FocusSettings {
  if (!isBrowser()) return DEFAULT_FOCUS_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_FOCUS_SETTINGS
    const parsed = JSON.parse(raw) as Partial<FocusSettings>
    return {
      restDays: Array.isArray(parsed.restDays) ? parsed.restDays : DEFAULT_FOCUS_SETTINGS.restDays,
      weeklyVolume: typeof parsed.weeklyVolume === 'number' ? parsed.weeklyVolume : DEFAULT_FOCUS_SETTINGS.weeklyVolume,
      difficultyMix: (parsed.difficultyMix as DifficultyMix) ?? DEFAULT_FOCUS_SETTINGS.difficultyMix,
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

function naturalLevel(score: number): string {
  if (score < 60) return 'Foundations'
  if (score < 80) return 'Clinical'
  return 'Advanced'
}

function biasedLevel(mix: DifficultyMix, score: number, dayIndex: number): string {
  if (mix === 'balanced') return naturalLevel(score)
  // 4-of-5 days lean toward the chosen tier; the 5th day uses natural recommendation.
  const leanDay = dayIndex % 5 !== 4
  if (!leanDay) return naturalLevel(score)
  if (mix === 'foundations-heavy') return 'Foundations'
  if (mix === 'clinical-heavy') return 'Clinical'
  return 'Advanced'
}

export function generateWeekPlan(
  weakSystems: SystemEntry[],
  settings: FocusSettings,
): WeekPlanDay[] {
  const restSet = new Set(settings.restDays)
  const activeDayCount = WEEK_DAYS.filter(d => !restSet.has(d)).length
  const targetActive = Math.max(0, Math.min(settings.weeklyVolume, activeDayCount))
  const queue = weakSystems.length > 0 ? weakSystems : []

  let activeIndex = 0
  let assignedActive = 0
  const result: WeekPlanDay[] = []

  WEEK_DAYS.forEach(day => {
    if (restSet.has(day)) {
      result.push({ day, task: 'Rest day', level: null, reason: 'Recovery' })
      return
    }
    if (assignedActive >= targetActive) {
      result.push({ day, task: 'Rest day', level: null, reason: 'Recovery' })
      return
    }
    if (queue.length === 0) {
      result.push({ day, task: 'Free choice', level: null, reason: 'Your call' })
      assignedActive += 1
      return
    }
    const sys = queue[activeIndex % queue.length]
    const reason = activeIndex === 0 ? 'Weakest system'
      : activeIndex === 1 ? '2nd weakest'
      : activeIndex === 2 ? '3rd weakest'
      : activeIndex < queue.length ? `${activeIndex + 1}th weakest`
      : 'Reinforce'
    result.push({
      day,
      task: sys.name,
      level: biasedLevel(settings.difficultyMix, sys.score, assignedActive),
      reason,
    })
    activeIndex += 1
    assignedActive += 1
  })

  return result
}

export function estimateMinutes(
  systemName: string,
  caseCount: number,
  sessions?: Array<{ system?: string; durationMinutes?: number }>,
): number {
  if (sessions && sessions.length > 0) {
    const matched = sessions.filter(s => s.system === systemName && typeof s.durationMinutes === 'number')
    if (matched.length > 0) {
      const avg = matched.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0) / matched.length
      return Math.round(avg * caseCount)
    }
  }
  return MIN_PER_CASE_DEFAULT * caseCount
}

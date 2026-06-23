/**
 * Spaced-repetition scheduler (SM-2, the algorithm Anki is based on).
 *
 * Pure functions only — persistence (localStorage / Supabase) lives in the
 * calling layer so this stays trivially testable.
 */
import type { ReviewGrade, ReviewItem, ReviewTag } from './types'

const GRADE_Q: Record<ReviewGrade, number> = { again: 1, hard: 3, good: 4, easy: 5 }
const DAY_MS = 86_400_000
const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3

/** Create a fresh review item, due immediately. */
export function makeReviewItem(
  input: {
    id: string
    prompt: string
    answer: string
    diagnosis: string
    system: string
    tag: ReviewTag
  },
  now: number,
): ReviewItem {
  return {
    ...input,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now,
    createdAt: now,
  }
}

/** Apply an SM-2 review grade and return the rescheduled item. */
export function scheduleNext(item: ReviewItem, grade: ReviewGrade, now: number): ReviewItem {
  const q = GRADE_Q[grade]
  let { ease, intervalDays, repetitions } = item

  if (q < 3) {
    // Lapse — reset the learning steps but keep ease changes below.
    repetitions = 0
    intervalDays = 1
  } else {
    repetitions += 1
    if (repetitions === 1) intervalDays = 1
    else if (repetitions === 2) intervalDays = 6
    else intervalDays = Math.max(1, Math.round(intervalDays * ease))
  }

  // SM-2 ease adjustment, floored at 1.3.
  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))

  return {
    ...item,
    ease: Math.round(ease * 1000) / 1000,
    intervalDays,
    repetitions,
    lastReviewedAt: now,
    dueAt: now + intervalDays * DAY_MS,
  }
}

/** Items due for review now, soonest-due first. */
export function dueItems(items: ReviewItem[], now: number): ReviewItem[] {
  return items.filter(i => i.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt)
}

/** Count of due items (cheap, for a badge). */
export function dueCount(items: ReviewItem[], now: number): number {
  let n = 0
  for (const i of items) if (i.dueAt <= now) n++
  return n
}

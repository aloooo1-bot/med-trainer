/**
 * Client-side persistence + extraction for the retention features.
 *
 * Mirrors the localStorage conventions in app/lib/analytics.ts. All reads are
 * SSR-safe (try/catch) so callers may invoke them only after mount.
 *
 * `buildReviewItems` is kept pure (no storage) and depends only on a structural
 * subset of a case, so app/lib/reasoning stays self-contained (no import from
 * the trainer layer).
 */
import type { MasteryRecord, ReviewItem, TestImpacts } from './types'
import { makeReviewItem, scheduleNext } from './spacedRepetition'
import { updateMastery, masteryKey } from './mastery'
import type { ReviewGrade } from './types'

const REVIEW_KEY = 'medtrainer_review_items'
const MASTERY_KEY = 'medtrainer_mastery'
const STREAK_KEY = 'medtrainer_recall_streak'
const CALIBRATION_KEY = 'medtrainer_calibration'
const MAX_REVIEW = 2000
const MAX_CALIBRATION = 500
const DAY_MS = 86_400_000

// ── Review-item extraction (pure) ───────────────────────────────────────────

/** Minimal structural shape this module needs from a case. */
export interface CaseLike {
  diagnosis: string
  teachingPoints?: string[]
  mechanism?: string
  testImpacts?: TestImpacts
}

const MGMT_RE = /\b\d+\s?(mg|mcg|g|units?|mL|mEq)\b|first[-\s]?line|initiate|administer|loading dose|≤|≥|target/i

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

/**
 * Distill a graded case into 1-3 high-yield spaced-repetition prompts:
 * the mechanism (Why), the first-line management pearl, and the confirmatory
 * discriminator. IDs are stable per (diagnosis, tag) so repeating the same
 * diagnosis updates the existing card rather than piling up duplicates.
 */
export function buildReviewItems(c: CaseLike, system: string, now: number): ReviewItem[] {
  const items: ReviewItem[] = []
  const dx = c.diagnosis
  if (!dx) return items

  if (c.mechanism) {
    items.push(
      makeReviewItem(
        { id: `${slug(dx)}::mechanism`, prompt: `What is the underlying mechanism of ${dx}?`, answer: c.mechanism, diagnosis: dx, system, tag: 'mechanism' },
        now,
      ),
    )
  }

  const mgmt = (c.teachingPoints ?? []).find(t => MGMT_RE.test(t))
  if (mgmt) {
    items.push(
      makeReviewItem(
        { id: `${slug(dx)}::management`, prompt: `What is the first-line management of ${dx}?`, answer: mgmt, diagnosis: dx, system, tag: 'management' },
        now,
      ),
    )
  }

  if (c.testImpacts) {
    for (const [test, impacts] of Object.entries(c.testImpacts)) {
      if (impacts[dx]?.effect === 'confirms') {
        items.push(
          makeReviewItem(
            { id: `${slug(dx)}::discriminator`, prompt: `Which test confirms ${dx}, and what does it show?`, answer: `${test} — ${impacts[dx].why}`, diagnosis: dx, system, tag: 'discriminator' },
            now,
          ),
        )
        break
      }
    }
  }

  return items
}

// ── Review-item persistence ─────────────────────────────────────────────────

export function loadReviewItems(): ReviewItem[] {
  try { return JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '[]') as ReviewItem[] } catch { return [] }
}

function saveReviewItems(items: ReviewItem[]): void {
  try { localStorage.setItem(REVIEW_KEY, JSON.stringify(items.slice(-MAX_REVIEW))) } catch {}
}

/** Merge freshly-extracted items, skipping ids that already exist. */
export function addReviewItems(newItems: ReviewItem[]): ReviewItem[] {
  const existing = loadReviewItems()
  const ids = new Set(existing.map(i => i.id))
  const merged = [...existing, ...newItems.filter(i => !ids.has(i.id))]
  saveReviewItems(merged)
  return merged
}

/** Apply an SM-2 grade to one review item and persist. */
export function gradeReviewItem(id: string, grade: ReviewGrade, now: number): ReviewItem[] {
  const items = loadReviewItems()
  const idx = items.findIndex(i => i.id === id)
  if (idx >= 0) items[idx] = scheduleNext(items[idx], grade, now)
  saveReviewItems(items)
  return items
}

export function clearReviewItems(): void {
  try { localStorage.removeItem(REVIEW_KEY) } catch {}
}

// ── Mastery persistence ─────────────────────────────────────────────────────

export function loadMastery(): MasteryRecord[] {
  try { return JSON.parse(localStorage.getItem(MASTERY_KEY) ?? '[]') as MasteryRecord[] } catch { return [] }
}

function saveMastery(records: MasteryRecord[]): void {
  try { localStorage.setItem(MASTERY_KEY, JSON.stringify(records)) } catch {}
}

export function recordMastery(system: string, difficulty: string, score: number, correct: boolean, now: number): MasteryRecord[] {
  const records = loadMastery()
  const key = masteryKey(system, difficulty)
  const idx = records.findIndex(r => r.key === key)
  const updated = updateMastery(idx >= 0 ? records[idx] : undefined, system, difficulty, score, correct, now)
  if (idx >= 0) records[idx] = updated
  else records.push(updated)
  saveMastery(records)
  return records
}

export function clearMastery(): void {
  try { localStorage.removeItem(MASTERY_KEY) } catch {}
}

// ── Daily review streak ─────────────────────────────────────────────────────

export interface RecallStreak { lastDay: string; streak: number }

function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

export function loadStreak(): RecallStreak {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY) ?? '{"lastDay":"","streak":0}') as RecallStreak } catch { return { lastDay: '', streak: 0 } }
}

/** Mark a review as done today; extends the streak if yesterday was reviewed, else resets to 1. Idempotent within a day. */
export function recordReviewDay(now: number): RecallStreak {
  const day = dayString(now)
  const cur = loadStreak()
  if (cur.lastDay === day) return cur
  const yesterday = dayString(now - DAY_MS)
  const next: RecallStreak = { lastDay: day, streak: cur.lastDay === yesterday ? cur.streak + 1 : 1 }
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(next)) } catch {}
  return next
}

// ── Predict-then-compare calibration history ────────────────────────────────

export interface CalibrationEntry { ts: number; score: number; topHit: boolean }

export function loadCalibration(): CalibrationEntry[] {
  try { return JSON.parse(localStorage.getItem(CALIBRATION_KEY) ?? '[]') as CalibrationEntry[] } catch { return [] }
}

/** Append one case's pre-test calibration result (how the student's ranking matched the evidence). */
export function recordCalibration(score: number, topHit: boolean, now: number): CalibrationEntry[] {
  const entries = loadCalibration()
  entries.push({ ts: now, score, topHit })
  const capped = entries.slice(-MAX_CALIBRATION)
  try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify(capped)) } catch {}
  return capped
}

export function clearCalibration(): void {
  try { localStorage.removeItem(CALIBRATION_KEY) } catch {}
}

// ── Combined entry point ────────────────────────────────────────────────────

/**
 * Single call for the trainer to make when a case is graded: updates the
 * mastery record and adds spaced-repetition cards for the case's key concepts.
 */
export function recordCaseOutcome(
  c: CaseLike,
  system: string,
  difficulty: string,
  score: number,
  correct: boolean,
  now: number,
): void {
  recordMastery(system, difficulty, score, correct, now)
  addReviewItems(buildReviewItems(c, system, now))
}

/**
 * Cloud sync for the reasoning/retention data (review deck, mastery,
 * calibration, recall streak) via /api/reasoning/sync.
 *
 * Strategy: union-merge. Pull the account blob, merge with the local copy
 * (union by id/key; per-item, the most recently touched side wins), write the
 * merge locally, and push it back. Two devices with divergent state therefore
 * converge instead of one silently clobbering the other. Signed-out or
 * offline, every call is a quiet no-op — localStorage remains the source.
 */
import type { MasteryRecord, ReviewItem } from './types'
import {
  loadReviewItems, replaceReviewItems,
  loadMastery, replaceMastery,
  loadCalibration, replaceCalibration, type CalibrationEntry,
  loadStreak, replaceStreak, type RecallStreak,
} from './store'

type SyncStates = {
  review_items?: unknown
  mastery?: unknown
  calibration?: unknown
  streak?: unknown
}

// ── Merge rules ──────────────────────────────────────────────────────────────

/** The most recently reviewed copy of a card carries the current SM-2 truth. */
function itemRecency(i: ReviewItem): number {
  return i.lastReviewedAt ?? i.createdAt
}

export function mergeReviewItems(local: ReviewItem[], remote: ReviewItem[]): ReviewItem[] {
  const byId = new Map<string, ReviewItem>()
  for (const item of [...remote, ...local]) {
    const prev = byId.get(item.id)
    if (!prev) { byId.set(item.id, item); continue }
    const keepNew =
      itemRecency(item) > itemRecency(prev) ||
      (itemRecency(item) === itemRecency(prev) && (
        item.repetitions > prev.repetitions ||
        (item.repetitions === prev.repetitions && item.dueAt > prev.dueAt)
      ))
    if (keepNew) byId.set(item.id, item)
  }
  return [...byId.values()]
}

export function mergeMastery(local: MasteryRecord[], remote: MasteryRecord[]): MasteryRecord[] {
  const byKey = new Map<string, MasteryRecord>()
  for (const rec of [...remote, ...local]) {
    const prev = byKey.get(rec.key)
    if (!prev) { byKey.set(rec.key, rec); continue }
    const keepNew =
      rec.lastAttemptAt > prev.lastAttemptAt ||
      (rec.lastAttemptAt === prev.lastAttemptAt && rec.attempts > prev.attempts)
    if (keepNew) byKey.set(rec.key, rec)
  }
  return [...byKey.values()]
}

export function mergeCalibration(local: CalibrationEntry[], remote: CalibrationEntry[]): CalibrationEntry[] {
  const byTs = new Map<number, CalibrationEntry>()
  for (const entry of [...remote, ...local]) byTs.set(entry.ts, entry)
  return [...byTs.values()].sort((a, b) => a.ts - b.ts)
}

export function mergeStreak(local: RecallStreak, remote: RecallStreak): RecallStreak {
  if (local.lastDay === remote.lastDay) {
    return local.streak >= remote.streak ? local : remote
  }
  return local.lastDay > remote.lastDay ? local : remote
}

// ── Shape guards for remote payloads ─────────────────────────────────────────

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function asStreak(v: unknown): RecallStreak {
  const s = v as Partial<RecallStreak> | null
  return s && typeof s.lastDay === 'string' && typeof s.streak === 'number'
    ? { lastDay: s.lastDay, streak: s.streak }
    : { lastDay: '', streak: 0 }
}

// ── Sync entry points ────────────────────────────────────────────────────────

let syncInFlight: Promise<boolean> | null = null

/**
 * Pull → union-merge → persist locally → push. Resolves false (without
 * throwing) when signed out, offline, or the server errors. Concurrent calls
 * share one round-trip.
 */
export function syncReasoning(): Promise<boolean> {
  if (syncInFlight) return syncInFlight
  syncInFlight = doSync().finally(() => { syncInFlight = null })
  return syncInFlight
}

async function doSync(): Promise<boolean> {
  try {
    const res = await fetch('/api/reasoning/sync')
    if (!res.ok) return false
    const { states } = await res.json() as { states: SyncStates }

    const items = mergeReviewItems(loadReviewItems(), asArray<ReviewItem>(states.review_items))
    const mastery = mergeMastery(loadMastery(), asArray<MasteryRecord>(states.mastery))
    const calibration = mergeCalibration(loadCalibration(), asArray<CalibrationEntry>(states.calibration))
    const streak = mergeStreak(loadStreak(), asStreak(states.streak))

    replaceReviewItems(items)
    replaceMastery(mastery)
    replaceCalibration(calibration)
    replaceStreak(streak)

    return pushReasoning()
  } catch {
    return false
  }
}

/** Push the current local state to the account without pulling first. */
export async function pushReasoning(): Promise<boolean> {
  try {
    const res = await fetch('/api/reasoning/sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        states: {
          review_items: loadReviewItems(),
          mastery: loadMastery(),
          calibration: loadCalibration(),
          streak: loadStreak(),
        },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

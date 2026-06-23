/**
 * Per-topic mastery tracking + next-case recommendation.
 *
 * Mastery is an exponentially-weighted moving average of recent case scores per
 * (system × difficulty), so the recommender can steer a student toward their
 * weakest unmastered area and promote difficulty once a topic is solid.
 * Pure functions; persistence lives in the calling layer.
 */
import type { MasteryRecord } from './types'

const EWMA_ALPHA = 0.4 // weight on the most recent attempt
export const MASTERY_THRESHOLD = 80
const MASTERY_MIN_ATTEMPTS = 3
const MASTERY_MIN_STREAK = 2

export const DIFFICULTY_ORDER = ['Foundations', 'Clinical', 'Advanced'] as const

export function masteryKey(system: string, difficulty: string): string {
  return `${system}::${difficulty}`
}

/** Fold one graded case into the mastery record for its (system × difficulty). */
export function updateMastery(
  prev: MasteryRecord | undefined,
  system: string,
  difficulty: string,
  score: number,
  correct: boolean,
  now: number,
): MasteryRecord {
  const clamped = Math.max(0, Math.min(100, score))
  const newScore = prev ? Math.round(EWMA_ALPHA * clamped + (1 - EWMA_ALPHA) * prev.score) : clamped
  return {
    key: masteryKey(system, difficulty),
    system,
    difficulty,
    score: newScore,
    attempts: (prev?.attempts ?? 0) + 1,
    lastAttemptAt: now,
    correctStreak: correct ? (prev?.correctStreak ?? 0) + 1 : 0,
  }
}

/** A topic is "mastered" once it is consistently high-scoring AND recently correct. */
export function isMastered(rec: MasteryRecord | undefined): boolean {
  if (!rec) return false
  return (
    rec.score >= MASTERY_THRESHOLD &&
    rec.attempts >= MASTERY_MIN_ATTEMPTS &&
    rec.correctStreak >= MASTERY_MIN_STREAK
  )
}

export interface NextRecommendation {
  system: string
  difficulty: string
  reason: string
}

/**
 * Recommend the next case to practice.
 * Strategy: among all candidate (system × difficulty) slots, prefer
 *  1. never-attempted slots at the lowest unmastered difficulty,
 *  2. then the weakest-scoring attempted-but-unmastered slot,
 * so the student shores up weak areas before climbing difficulty.
 */
export function recommendNext(
  records: MasteryRecord[],
  candidates: Array<{ system: string; difficulty: string }>,
): NextRecommendation | null {
  if (candidates.length === 0) return null
  const byKey = new Map(records.map(r => [r.key, r]))
  const diffRank = (d: string) => {
    const i = DIFFICULTY_ORDER.indexOf(d as (typeof DIFFICULTY_ORDER)[number])
    return i === -1 ? DIFFICULTY_ORDER.length : i
  }

  // 1. Never-attempted, lowest difficulty first.
  const untried = candidates
    .filter(c => !byKey.has(masteryKey(c.system, c.difficulty)))
    .sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty))
  if (untried.length > 0) {
    const c = untried[0]
    return { system: c.system, difficulty: c.difficulty, reason: 'New area you haven’t practiced yet' }
  }

  // 2. Weakest attempted-but-unmastered slot.
  const weak = candidates
    .map(c => byKey.get(masteryKey(c.system, c.difficulty)))
    .filter((r): r is MasteryRecord => !!r && !isMastered(r))
    .sort((a, b) => a.score - b.score)
  if (weak.length > 0) {
    const r = weak[0]
    return {
      system: r.system,
      difficulty: r.difficulty,
      reason: `Weakest area so far (avg ${r.score}/100)`,
    }
  }

  // 3. Everything mastered at this set — suggest the hardest tier to keep sharp.
  const hardest = [...candidates].sort((a, b) => diffRank(b.difficulty) - diffRank(a.difficulty))[0]
  return { system: hardest.system, difficulty: hardest.difficulty, reason: 'All topics mastered — keep your skills sharp' }
}

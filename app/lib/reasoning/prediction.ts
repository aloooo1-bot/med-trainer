/**
 * Predict-then-compare: before ordering any tests the student commits a ranked
 * differential. After the workup, we score how well their pre-test ranking
 * matched the evidence-based ranking the engine arrives at. This trains
 * calibration — the core skill of forming and updating a differential.
 *
 * Pure functions only, so they are unit-testable and UI-agnostic.
 */
import type { BeliefState } from './types'

export interface PredictionScore {
  /** Did the student's #1 match the evidence-based #1? */
  topHit: boolean
  /** 0-100 rank-agreement between the student's order and the engine's order. */
  score: number
  studentTop: string
  engineTop: string
  /** Names the student ranked that the engine also tracks (the comparable set). */
  comparedCount: number
}

/** Maximum possible total rank displacement for a permutation of n items. */
function maxDisplacement(n: number): number {
  return Math.floor((n * n) / 2) || 1
}

/**
 * Compare a student's pre-test ranking (most-likely first) against the engine's
 * post-workup belief order. Only diagnoses present in both are scored.
 */
export function scorePrediction(studentRanking: string[], engineBeliefs: BeliefState[]): PredictionScore {
  const engineOrder = [...engineBeliefs].sort((a, b) => b.probability - a.probability).map(b => b.name)
  const studentClean = studentRanking.filter(Boolean)
  const common = engineOrder.filter(n => studentClean.includes(n))
  const n = common.length

  const engineTop = engineOrder[0] ?? ''
  const studentTop = studentClean.find(x => common.includes(x)) ?? studentClean[0] ?? ''

  if (n === 0) {
    return { topHit: false, score: 0, studentTop, engineTop, comparedCount: 0 }
  }

  const sRank = new Map<string, number>()
  studentClean.filter(x => common.includes(x)).forEach((x, i) => sRank.set(x, i))
  const eRank = new Map<string, number>()
  engineOrder.filter(x => common.includes(x)).forEach((x, i) => eRank.set(x, i))

  let dist = 0
  for (const name of common) dist += Math.abs(sRank.get(name)! - eRank.get(name)!)

  const score = Math.round(100 * (1 - dist / maxDisplacement(n)))
  return {
    topHit: studentTop === engineTop,
    score: Math.max(0, Math.min(100, score)),
    studentTop,
    engineTop,
    comparedCount: n,
  }
}

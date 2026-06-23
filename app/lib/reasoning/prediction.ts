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

// ── Confidence calibration (Brier) ──────────────────────────────────────────

/**
 * Brier score for a single binary forecast: (confidence − outcome)².
 * confidence in [0,1]; outcome 1 if the prediction was correct, else 0.
 * 0 = perfect, 1 = maximally wrong. Lower is better.
 */
export function brierScore(confidence: number, correct: boolean): number {
  const c = Math.max(0, Math.min(1, confidence))
  const o = correct ? 1 : 0
  return (c - o) * (c - o)
}

export interface CalibrationSummary {
  n: number
  /** Mean stated confidence (0-100). */
  avgConfidence: number
  /** Mean actual hit rate of the top pick (0-100). */
  actualAccuracy: number
  /** Mean Brier score (0-1, lower is better). */
  brier: number
  verdict: 'overconfident' | 'underconfident' | 'well-calibrated'
}

export interface ReliabilityBucket {
  /** Confidence band, percent. */
  lo: number
  hi: number
  mid: number
  /** Predictions that fell in this band. */
  n: number
  /** Actual accuracy in this band, percent. */
  accuracy: number
}

/**
 * Group confidence-vs-outcome pairs into confidence bands for a reliability
 * diagram. A well-calibrated learner's accuracy tracks the diagonal (band
 * midpoint ≈ accuracy). Only populated bands are returned.
 */
export function reliabilityBuckets(
  pairs: Array<{ confidence: number; correct: boolean }>,
  bandWidth = 0.1,
): ReliabilityBucket[] {
  const bands = new Map<number, { correct: number; n: number }>()
  for (const p of pairs) {
    const c = Math.max(0, Math.min(0.999, p.confidence))
    const idx = Math.floor(c / bandWidth)
    const b = bands.get(idx) ?? { correct: 0, n: 0 }
    b.n++
    if (p.correct) b.correct++
    bands.set(idx, b)
  }
  return [...bands.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, b]) => ({
      lo: Math.round(idx * bandWidth * 100),
      hi: Math.round((idx + 1) * bandWidth * 100),
      mid: Math.round((idx + 0.5) * bandWidth * 100),
      n: b.n,
      accuracy: Math.round((b.correct / b.n) * 100),
    }))
}

/**
 * Aggregate confidence-vs-outcome pairs into a calibration verdict. A gap of
 * >10 points between stated confidence and actual accuracy flags over/under-confidence.
 */
export function calibrationSummary(
  pairs: Array<{ confidence: number; correct: boolean }>,
): CalibrationSummary | null {
  if (!pairs.length) return null
  const n = pairs.length
  const avgConfidence = pairs.reduce((a, p) => a + Math.max(0, Math.min(1, p.confidence)), 0) / n
  const actualAccuracy = pairs.filter(p => p.correct).length / n
  const brier = pairs.reduce((a, p) => a + brierScore(p.confidence, p.correct), 0) / n
  const gap = avgConfidence - actualAccuracy
  const verdict = gap > 0.1 ? 'overconfident' : gap < -0.1 ? 'underconfident' : 'well-calibrated'
  return {
    n,
    avgConfidence: Math.round(avgConfidence * 100),
    actualAccuracy: Math.round(actualAccuracy * 100),
    brier: Math.round(brier * 1000) / 1000,
    verdict,
  }
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

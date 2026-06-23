/**
 * Shared data model for the clinical-reasoning platform.
 *
 * Three concerns live here:
 *  1. The "knowledge spine" — a DiagnosisProfile is authored/verified ONCE per
 *     diagnosis and reused across every generated case variant. It is the single
 *     source of truth for case generation, grading, the differential engine, and
 *     the "Why" (mechanism) layer.
 *  2. The differential-reasoning engine — priors + per-test impact on each
 *     differential, used to drive the live "differential board".
 *  3. Retention — spaced-repetition items (SM-2) and per-topic mastery records.
 */

// ── Knowledge spine ─────────────────────────────────────────────────────────

export type DifferentialCategory = 'leading' | 'alternative' | 'cant-miss'

export interface ProfileDifferential {
  name: string
  category: DifferentialCategory
  /** The single finding/test that distinguishes this differential from the answer. */
  howToDistinguish: string
}

export interface ProfileWorkupItem {
  test: string
  typicalResult: string
  cutoff?: string
  rationale: string
}

export interface ProfileManagementStep {
  step: string
  drug?: string
  dose?: string
  threshold?: string
}

/** Authored/verified once per diagnosis; reused across all case variants. */
export interface DiagnosisProfile {
  diagnosis: string
  system: string
  /** Features that pin THIS diagnosis (used for grading + spaced-repetition items). */
  discriminators: string[]
  expectedWorkup: ProfileWorkupItem[]
  differentials: ProfileDifferential[]
  firstLineManagement: ProfileManagementStep[]
  /** 2-3 sentence pathophysiology — powers the "Why" layer. */
  mechanism: string
  sources: string[]
  schemaVersion: number
  /** Provenance for the trust layer. unverified = AI-drafted, not yet reviewed. */
  review?: { status: 'unverified' | 'ai-verified' | 'human-verified'; by?: string; at?: string }
}

// ── Differential-reasoning engine ───────────────────────────────────────────

export type TestEffect = 'confirms' | 'supports' | 'neutral' | 'argues-against' | 'excludes'

export interface TestImpactEntry {
  effect: TestEffect
  /** One-line reason this case's result moves this differential. */
  why: string
}

/**
 * For each available test, how THIS case's (fixed) result affects each
 * differential: testImpacts[testName][differentialName] -> impact.
 */
export type TestImpacts = Record<string, Record<string, TestImpactEntry>>

export interface DifferentialPrior {
  name: string
  /** Pre-test weight (0..1). Normalized at runtime; need not sum to 1. */
  prior: number
  category?: DifferentialCategory
}

export interface BeliefState {
  name: string
  /** Normalized probability (0..1) under the teaching model. */
  probability: number
  category?: DifferentialCategory
}

// ── Spaced repetition (SM-2) ────────────────────────────────────────────────

export type ReviewTag = 'discriminator' | 'management' | 'cutoff' | 'mechanism'
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

export interface ReviewItem {
  id: string
  prompt: string
  answer: string
  diagnosis: string
  system: string
  tag: ReviewTag
  // SM-2 scheduling state
  ease: number
  intervalDays: number
  repetitions: number
  dueAt: number // epoch ms
  createdAt: number
  lastReviewedAt?: number
}

// ── Mastery ─────────────────────────────────────────────────────────────────

export interface MasteryRecord {
  /** `${system}::${difficulty}` */
  key: string
  system: string
  difficulty: string
  /** EWMA of recent performance, 0..100. */
  score: number
  attempts: number
  lastAttemptAt: number
  correctStreak: number
}

import type { CaseData } from './types'
import type { HPIField, ROSCategory } from '../../lib/rosDetector'
import type { GradingResult } from '../../grading/types'
import type { RawUsage } from '../../lib/analytics'
import type { SpecialModality } from '../../lib/specialImageLookup'

/**
 * Client-safe contracts for the /api/session/* routes. The server builders
 * live in app/lib/server/caseTiers.ts (which imports these types); the client
 * consumes them without pulling any server-only code.
 */

/**
 * Data-model future-proofing (5.3): "difficulty" currently welds together two
 * independent axes — how hard the CASE is, and how much interface scaffolding
 * the student gets (gating, ordering mode, answer format). They are stored as
 * two fields that today always move together, so they can later be set
 * independently (e.g. a Foundations-complexity case with Advanced scaffolding)
 * without a data migration.
 */
export type CaseComplexity = 'Foundations' | 'Clinical' | 'Advanced'
export type ScaffoldingLevel = 'Foundations' | 'Clinical' | 'Advanced'

/** The client-visible slice of a case, shaped per difficulty by the server. */
export interface CasePresentation {
  patientInfo: CaseData['patientInfo']
  hpi: string
  vitals: CaseData['vitals']
  /** Region names only at gated difficulties; full findings at Foundations. */
  examRegions: string[]
  /** True when the exam is click-to-reveal (Clinical/Advanced with relevant regions). */
  examGated: boolean
  /** True when this case carries a differential reasoning model (priors + impacts). */
  hasReasoningModel: boolean
  /**
   * Interface scaffolding tier (5.3). Drives ordering UI density independently
   * of case complexity; today it equals difficulty. Foundations → curated
   * checklist; Clinical → order sets + common core + search; Advanced → search.
   */
  scaffoldingLevel: ScaffoldingLevel
  /** Foundations only. */
  pastMedicalHistory?: CaseData['pastMedicalHistory']
  currentMedications?: CaseData['currentMedications']
  socialHistory?: CaseData['socialHistory']
  reviewOfSystems?: Record<string, string>
  physicalExam?: Record<string, string>
  availableLabs?: string[]
  availableImaging?: string[]
  labGroups?: Array<{ name: string; tests: string[] }>
  differentialPriors?: CaseData['differentialPriors']
  testImpacts?: CaseData['testImpacts']
  /** Foundations ranked-prediction candidates (prior names, correct dx included). */
  predictionCandidates?: string[]
  /** Advanced: case-specific orderable test names merged into the search list. */
  caseSearchTests?: Array<{ name: string; category: string }>
}

/** What the client may see after grading (teaching reveal). */
export interface CaseReveal {
  diagnosis: string
  differentials: string[]
  differentialExplanations?: string[]
  teachingPoints: string[]
  keyQuestions: string[]
  mechanism?: string
  differentialPriors?: CaseData['differentialPriors']
  testImpacts?: CaseData['testImpacts']
  /** Canonical ROS findings, for the post-grading "Full:" reveal rows. */
  reviewOfSystems: Record<string, string>
  expectedLabs?: string[]
  expectedImaging?: string[]
}

export interface UsageEntry { type: string; usage: RawUsage }

export interface StartResponse {
  sessionId: string
  system: string
  difficulty: string
  phase: 'active' | 'presentation' | 'graded'
  gate: { tier: string; casesLeft?: number; firstCaseDone: boolean }
  presentation: CasePresentation
  usage: RawUsage | null
}

export interface AskResponse {
  reply: string
  rosUnlocks: Array<{ category: ROSCategory; derivedFinding: string; status: 'positive' | 'negative' }>
  hpiUnlocks: Partial<Record<HPIField, string>>
  usages: UsageEntry[]
}

export interface OrderedTestResult {
  test: string
  kind: 'lab' | 'imaging' | 'procedure' | 'pending' | 'ambiguous' | 'none'
  labResult?: CaseData['labResults'][string]
  report?: string
  pendingHours?: string
  isECG?: boolean
  ecgFindings?: string
  specialModality?: SpecialModality
  specialFindings?: string
  generatedOnDemand?: boolean
  /** kind 'ambiguous': canonical names the student should confirm (4.3). */
  suggestions?: string[]
  /** Set when the result was fuzzy-resolved from a differently-phrased order. */
  resolvedFrom?: string
}

export interface OrderResponse {
  results: OrderedTestResult[]
  usages: UsageEntry[]
}

export interface GradeResponse {
  result: GradingResult
  reveal: CaseReveal
  prediction: { ranking: string[]; confidence: number | null } | null
  orderedTests: string[]
  usages: UsageEntry[]
}

export interface ResumeResponse {
  session: {
    sessionId: string
    system: string
    difficulty: string
    phase: 'active' | 'presentation' | 'graded'
    createdAt: string
  } | null
  presentation?: CasePresentation
  chat?: Array<{ role: 'user' | 'assistant'; content: string }>
  ros?: Array<{ category: ROSCategory; derivedFinding: string; status: 'positive' | 'negative' }>
  hpi?: Partial<Record<HPIField, string>>
  exams?: Array<{ region: string; finding: string }>
  orderedTests?: string[]
  results?: OrderedTestResult[]
  prediction?: { ranking: string[]; confidence: number | null } | null
  gradingResult?: GradingResult
  reveal?: CaseReveal
  submittedDiagnosis?: string
}

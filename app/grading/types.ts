export interface ScoreDimension {
  score: number
  feedback: string
}

export interface PresentationScores {
  accuracy: number
  completeness: number
  conciseness: number
  safety: number
}

/**
 * Patient communication — REPORTED, NEVER SCORED.
 *
 * Patients in these cases ask things like "Is there something wrong with my
 * heart?" and voice fear about losing their independence. Responding to that is
 * a clinical skill, and one a simulation makes unusually easy to skip, but the
 * rubric assessed nothing of the kind — a student could ignore every worry and
 * lose no points.
 *
 * Deliberately outside `dimensions` and worth zero points: the five scored
 * dimensions still sum to exactly 100, so every previously recorded score stays
 * comparable and Progress trends have no discontinuity. This is feedback that
 * names a skill, not a new thing to optimise.
 */
export interface CommunicationMoment {
  /** What the patient raised, in their words or a close paraphrase. */
  concern: string
  /** Whether the student responded to it before moving on. */
  acknowledged: boolean
  /** One sentence on how it was handled, or what a response could have been. */
  note: string
}

export interface CommunicationFeedback {
  moments: CommunicationMoment[]
  /** One or two sentences; empty when the patient raised nothing. */
  summary: string
}

export interface GradingResult {
  score: number
  correct: boolean
  feedback: string
  strengths: string[]
  /** Not scored — see CommunicationFeedback. */
  communication?: CommunicationFeedback
  dimensions?: {
    historyInterview: ScoreDimension
    testOrdering: ScoreDimension
    diagnosisAccuracy: ScoreDimension
    diagnosisCompleteness: ScoreDimension
    clinicalReasoning?: ScoreDimension  // omitted at Foundations (no reasoning input)
    examinationFocus?: ScoreDimension   // omitted at Foundations; omitted for legacy cases lacking relevantExamRegions
  }
  missedQuestions: string[]
  teachingPoints: string[]
  differentials: string[]
  presentation?: {
    scores?: PresentationScores
    presentationTotal?: number
    presentationFeedback?: string
    criticalMisses?: string[]
  }
}

// Strips a full GradingResult down to what the free tier sees:
// overall score, per-dimension numbers (no feedback text), and overall feedback paragraph.
// Teaching points, strengths, missed questions, and differentials are removed.
export function stripToBasic(result: GradingResult): GradingResult {
  return {
    score: result.score,
    correct: result.correct,
    feedback: result.feedback,
    strengths: [],
    // Detailed feedback is Pro, and communication is feedback like any other.
    communication: undefined,
    missedQuestions: [],
    teachingPoints: [],
    differentials: [],
    dimensions: result.dimensions
      ? {
          historyInterview:      { score: result.dimensions.historyInterview.score,      feedback: '' },
          testOrdering:          { score: result.dimensions.testOrdering.score,          feedback: '' },
          diagnosisAccuracy:     { score: result.dimensions.diagnosisAccuracy.score,     feedback: '' },
          diagnosisCompleteness: { score: result.dimensions.diagnosisCompleteness.score, feedback: '' },
          ...(result.dimensions.clinicalReasoning !== undefined
            ? { clinicalReasoning: { score: result.dimensions.clinicalReasoning.score, feedback: '' } }
            : {}),
          ...(result.dimensions.examinationFocus !== undefined
            ? { examinationFocus: { score: result.dimensions.examinationFocus.score, feedback: '' } }
            : {}),
        }
      : undefined,
  }
}

export interface GradingInput {
  patientInfo: string
  hpi: string
  backgroundHistory: string
  difficulty: string
  orderedLabResults: string
  orderedImagingResults: string
  chatSummary: string
  /**
   * Structured, server-logged record of what the student elicited (unlocked ROS
   * categories + derived findings, unlocked HPI fields, exam regions performed,
   * tests ordered). AUTHORITATIVE over the free-prose transcript for grading.
   */
  elicitedRecord?: string
  reasoningText: string
  submittedDiagnosis: string
  correctDiagnosis: string
  keyQuestions: string[]
  teachingPoints: string[]
  differentials: string[]
  expectedLabs?: string[]
  expectedImaging?: string[]
  supplementaryTests?: string[]
  prePresentedInfo?: string
  timedOut: boolean
  revealedExamRegions?: string[]
  relevantExamRegions?: string[]
  /** Authoritative evidence-based differential ranking the grader's discussion must stay consistent with. */
  differentialAnalysis?: string
  /** The student's pre-test leading-diagnosis commitment + confidence, for clinical-reasoning grading. */
  studentPrediction?: string
}

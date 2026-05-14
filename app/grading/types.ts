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

export interface GradingResult {
  score: number
  correct: boolean
  feedback: string
  strengths: string[]
  dimensions?: {
    historyInterview: ScoreDimension
    testOrdering: ScoreDimension
    diagnosisAccuracy: ScoreDimension
    diagnosisCompleteness: ScoreDimension
    clinicalReasoning?: ScoreDimension  // omitted at Foundations (no reasoning input)
  }
  efficiency?: {
    score: number
    feedback: string
    elapsedSeconds: number
    pausedSeconds: number
    timedOut: boolean
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
        }
      : undefined,
    efficiency: result.efficiency
      ? { score: result.efficiency.score, feedback: '', elapsedSeconds: result.efficiency.elapsedSeconds, pausedSeconds: result.efficiency.pausedSeconds, timedOut: result.efficiency.timedOut }
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
}

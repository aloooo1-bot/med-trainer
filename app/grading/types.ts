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
    clinicalReasoning: ScoreDimension
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
  timedOut: boolean
}

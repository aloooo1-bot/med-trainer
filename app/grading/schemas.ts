import { z } from 'zod'

const ScoreDimensionSchema = z.object({
  score: z.number(),
  feedback: z.string(),
})

// Validates the raw JSON Claude returns for a grading result.
// .passthrough() preserves fields we don't explicitly define (e.g. presentation, efficiency).
export const GradingResultSchema = z.object({
  score: z.number(),
  correct: z.boolean(),
  feedback: z.string(),
  strengths: z.array(z.string()).default([]),
  missedQuestions: z.array(z.string()).default([]),
  teachingPoints: z.array(z.string()).default([]),
  differentials: z.array(z.string()).default([]),
  dimensions: z.object({
    historyInterview:      ScoreDimensionSchema,
    testOrdering:          ScoreDimensionSchema,
    diagnosisAccuracy:     ScoreDimensionSchema,
    diagnosisCompleteness: ScoreDimensionSchema,
    clinicalReasoning:     ScoreDimensionSchema.optional(),
  }).optional(),
}).passthrough()

export type GradingResultRaw = z.infer<typeof GradingResultSchema>

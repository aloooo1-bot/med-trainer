import { z } from 'zod'

const ScoreDimensionSchema = z.object({
  score: z.number(),
  feedback: z.string(),
})

// Validates the raw JSON Claude returns for a grading result.
// .passthrough() preserves fields we don't explicitly define (e.g. presentation).
export const GradingResultSchema = z.object({
  score: z.number(),
  correct: z.boolean(),
  feedback: z.string(),
  strengths: z.array(z.string()).default([]),
  missedQuestions: z.array(z.string()).default([]),
  teachingPoints: z.array(z.string()).default([]),
  differentials: z.array(z.string()).default([]),
  // Report-only, so every field is defaulted: a malformed communication block
  // must degrade to "not reported" rather than reject the whole grading result.
  // A rejection here would throw in gradeService and 500 a COMPLETED case,
  // destroying the student's work over an unscored extra.
  communication: z.object({
    summary: z.string().default(''),
    moments: z.array(z.object({
      concern: z.string().default(''),
      acknowledged: z.boolean().default(false),
      note: z.string().default(''),
    })).default([]),
  }).optional(),
  dimensions: z.object({
    historyInterview:      ScoreDimensionSchema,
    testOrdering:          ScoreDimensionSchema,
    diagnosisAccuracy:     ScoreDimensionSchema,
    diagnosisCompleteness: ScoreDimensionSchema,
    clinicalReasoning:     ScoreDimensionSchema.optional(),
    examinationFocus:      ScoreDimensionSchema.optional(),
  }).optional(),
}).passthrough()

export type GradingResultRaw = z.infer<typeof GradingResultSchema>

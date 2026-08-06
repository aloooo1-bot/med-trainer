import { z } from 'zod'

// NOTE: this is a plain z.object, so zod STRIPS keys it does not declare. A
// field the model emits but this schema omits is silently deleted before any
// consumer sees it — which is why `deductions` has to be declared here and not
// only asked for in the prompt.
const ScoreDimensionSchema = z.object({
  score: z.number(),
  feedback: z.string(),
  deductions: z.array(z.object({
    points: z.number(),
    reason: z.string(),
  })).default([]),
})

// Legacy grades stored bare strings; new ones carry the nearest thing the
// student actually asked. Both must validate.
const MissedQuestionSchema = z.union([
  z.string(),
  z.object({
    question: z.string(),
    youAsked: z.string().nullable().optional(),
  }),
])

// Validates the raw JSON Claude returns for a grading result.
// .passthrough() preserves fields we don't explicitly define (e.g. presentation).
export const GradingResultSchema = z.object({
  score: z.number(),
  correct: z.boolean(),
  feedback: z.string(),
  strengths: z.array(z.string()).default([]),
  missedQuestions: z.array(MissedQuestionSchema).default([]),
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

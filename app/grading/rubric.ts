import type { GradingInput } from './types'
import {
  RUBRIC_TOTAL as _RUBRIC_TOTAL,
  GRADING_SYSTEM_PROMPT as _GRADING_SYSTEM_PROMPT,
  getRubric as _getRubric,
  buildRubricPrompt as _buildRubricPrompt,
} from './rubric.mjs'

// ── Types (TS-only — erased at runtime) ──────────────────────────────────────

export type DimensionKey =
  | 'historyInterview'
  | 'testOrdering'
  | 'diagnosisAccuracy'
  | 'diagnosisCompleteness'
  | 'clinicalReasoning'
  | 'examinationFocus'

export interface RubricDimension {
  key: DimensionKey
  label: string
  max: number
}

// ── Re-exports from shared ESM module ────────────────────────────────────────

export const RUBRIC_TOTAL: number = _RUBRIC_TOTAL
export const GRADING_SYSTEM_PROMPT: string = _GRADING_SYSTEM_PROMPT

export function getRubric(difficulty: string): RubricDimension[] {
  return _getRubric(difficulty) as RubricDimension[]
}

export function buildRubricPrompt(input: GradingInput): string {
  return _buildRubricPrompt(input)
}

// ── Oral presentation prompt (audit-unrelated, stays here) ───────────────────

export function buildOralPrompt(
  patientInfo: string,
  correctDiagnosis: string,
  keyQuestions: string[],
  presentationText: string
): string {
  return `You are an attending physician evaluating a trainee's oral case presentation.

Case: ${patientInfo}
Correct diagnosis: "${correctDiagnosis}"
Key clinical information: ${keyQuestions.join(' | ')}

Trainee's oral presentation:
"""
${presentationText}
"""

Grade on four axes (each 0-25 points, total /100):
1. Accuracy (0-25): Are clinical facts, findings, and the diagnosis correct and free of errors?
2. Completeness (0-25): Are all key positive and pertinent negative findings included? Is the assessment and plan addressed?
3. Conciseness (0-25): Is the presentation appropriately brief — signal over noise, no unnecessary repetition?
4. Safety (0-25): Would this presentation prompt safe, appropriate management? Are critical findings flagged? Are dangerous diagnoses appropriately excluded?

Return ONLY valid JSON:
{
  "scores": {
    "accuracy": <integer 0-25>,
    "completeness": <integer 0-25>,
    "conciseness": <integer 0-25>,
    "safety": <integer 0-25>
  },
  "presentationTotal": <sum of the four scores>,
  "presentationFeedback": "<3-4 sentences of direct narrative feedback on the overall presentation quality>",
  "criticalMisses": ["<critical finding or safety issue that was omitted or misrepresented>", ...or empty array if none]
}`
}

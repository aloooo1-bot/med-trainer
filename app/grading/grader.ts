import type { GradingInput, GradingResult } from './types'
import { GRADING_SYSTEM_PROMPT, buildRubricPrompt, buildOralPrompt } from './rubric'
import type { RawUsage } from '../lib/analytics'

async function callClaudeGrading(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  onUsage?: (usage: RawUsage) => void
): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`)
  if (onUsage && data.usage) onUsage(data.usage as RawUsage)
  return data.content[0].text as string
}

export type GradingUsageCallback = (type: 'grading_main' | 'grading_oral', usage: RawUsage) => void

export async function gradeCase(
  input: GradingInput,
  onUsage?: GradingUsageCallback
): Promise<GradingResult> {
  console.log('[GRADING INPUT]', JSON.stringify({
    patientInfo: input.patientInfo,
    difficulty: input.difficulty,
    submittedDiagnosis: input.submittedDiagnosis,
    correctDiagnosis: input.correctDiagnosis,
  }))

  const prompt = buildRubricPrompt(input)
  const text = await callClaudeGrading(
    GRADING_SYSTEM_PROMPT,
    [{ role: 'user', content: prompt }],
    2000,
    onUsage ? (u) => onUsage('grading_main', u) : undefined
  )
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in grading response')
  const result = JSON.parse(match[0]) as GradingResult

  // Always derive total from dimension sum — never trust Claude's independent calculation
  if (result.dimensions) {
    result.score = Object.values(result.dimensions).reduce(
      (sum, dim) => sum + (dim?.score ?? 0), 0
    )
  }

  // Advanced difficulty: additional oral presentation grading
  if (input.difficulty === 'Advanced' && input.reasoningText) {
    try {
      const oralPrompt = buildOralPrompt(
        input.patientInfo,
        input.correctDiagnosis,
        input.keyQuestions,
        input.reasoningText
      )
      const oText = await callClaudeGrading(
        GRADING_SYSTEM_PROMPT,
        [{ role: 'user', content: oralPrompt }],
        600,
        onUsage ? (u) => onUsage('grading_oral', u) : undefined
      )
      const oMatch = oText.match(/\{[\s\S]*\}/)
      if (oMatch) {
        const oData = JSON.parse(oMatch[0])
        result.presentation = {
          scores: oData.scores,
          presentationTotal: oData.presentationTotal,
          presentationFeedback: oData.presentationFeedback,
          criticalMisses: oData.criticalMisses,
        }
      }
    } catch {
      // oral grading failure is non-fatal
    }
  }

  return result
}

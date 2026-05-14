import Anthropic from '@anthropic-ai/sdk'
import {
  CASE_SYSTEM_PROMPT, DIFFICULTY_RULES, CRITICAL_RULES, JSON_SCHEMA_TEMPLATE,
  repairJson, reconcileHistoryConsistency, sanitizePmhLeak,
} from './shared'

export async function generateManifest(params: {
  system: string
  difficulty: string
  diagnosis: string
  variantIndex: number
}): Promise<Record<string, unknown>> {
  const { system, difficulty, diagnosis } = params
  const diffRules = DIFFICULTY_RULES[difficulty] ?? DIFFICULTY_RULES.Foundations
  const diffCount = difficulty === 'Foundations' ? '2-3' : difficulty === 'Clinical' ? '3-4' : '4-5'
  const schema = JSON_SCHEMA_TEMPLATE.replace('DIFF_COUNT', diffCount)

  const prompt = `Generate a realistic ${system} clinical case. The diagnosis for this case MUST be "${diagnosis}". Do not substitute a different diagnosis. Strictly follow the difficulty rules below.

${diffRules}

${CRITICAL_RULES}
${schema}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: CASE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (message.content.find(c => c.type === 'text') as { text: string } | undefined)?.text ?? ''
  let parsed: Record<string, unknown>
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    parsed = JSON.parse(match[0])
  } catch {
    parsed = JSON.parse(repairJson(text))
  }

  parsed.nativeDifficulty = difficulty

  // Merge relevantTests into available lists (mirrors fill-library.mjs logic)
  if (Array.isArray(parsed.relevantTests)) {
    for (const rt of parsed.relevantTests as Array<Record<string, unknown>>) {
      if (!rt.name) continue
      if (rt.isImaging && rt.imagingResult) {
        if (!parsed.imagingResults) parsed.imagingResults = {}
        ;(parsed.imagingResults as Record<string, unknown>)[rt.name as string] = rt.imagingResult
        if (!parsed.availableImaging) parsed.availableImaging = []
        if (!(parsed.availableImaging as string[]).includes(rt.name as string)) {
          (parsed.availableImaging as string[]).push(rt.name as string)
        }
      } else if (!rt.isImaging && rt.labResult) {
        if (!parsed.labResults) parsed.labResults = {}
        ;(parsed.labResults as Record<string, unknown>)[rt.name as string] = rt.labResult
        if (!parsed.availableLabs) parsed.availableLabs = []
        if (!(parsed.availableLabs as string[]).includes(rt.name as string)) {
          (parsed.availableLabs as string[]).push(rt.name as string)
        }
      }
    }
  }

  return sanitizePmhLeak(reconcileHistoryConsistency(parsed))
}

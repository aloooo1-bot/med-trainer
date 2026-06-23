import Anthropic from '@anthropic-ai/sdk'
import {
  CASE_SYSTEM_PROMPT, DIFFICULTY_RULES, CRITICAL_RULES, JSON_SCHEMA_TEMPLATE,
  repairJson, reconcileHistoryConsistency, sanitizePmhLeak,
  buildExcludedNamesBlock, nameCollides,
} from './shared'
import { formatProfileForPrompt } from '../knowledge/format'
import type { DiagnosisProfile } from '../reasoning/types'

export async function generateManifest(params: {
  system: string
  difficulty: string
  diagnosis: string
  variantIndex: number
  usedNames?: string[]
  /** Optional verified knowledge-spine profile; if provided, the case is generated to conform to it (Tier-0 accuracy). */
  profile?: DiagnosisProfile
}): Promise<Record<string, unknown>> {
  const { system, difficulty, diagnosis, usedNames = [], profile } = params
  const diffRules = DIFFICULTY_RULES[difficulty] ?? DIFFICULTY_RULES.Foundations
  const diffCount = difficulty === 'Foundations' ? '2-3' : difficulty === 'Clinical' ? '3-4' : '4-5'
  const schema = JSON_SCHEMA_TEMPLATE.replace('DIFF_COUNT', diffCount)
  const profileBlock = profile ? `\n${formatProfileForPrompt(profile)}\n` : ''
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const buildPrompt = (excluded: string[]) =>
    `Generate a realistic ${system} clinical case. The diagnosis for this case MUST be "${diagnosis}". Do not substitute a different diagnosis. Strictly follow the difficulty rules below.\n\n${diffRules}\n${profileBlock}${buildExcludedNamesBlock(excluded)}\n${CRITICAL_RULES}\n${schema}`

  const postProcess = (parsed: Record<string, unknown>): Record<string, unknown> => {
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

  const callAndParse = async (excluded: string[]): Promise<Record<string, unknown>> => {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: CASE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(excluded) }],
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
    return postProcess(parsed)
  }

  const result = await callAndParse(usedNames)
  const generatedName = ((result.patientInfo as Record<string, unknown> | undefined)?.name as string | undefined) ?? ''

  if (generatedName && nameCollides(generatedName, usedNames)) {
    console.warn(`[generateManifest] Name collision: "${generatedName}" — retrying with exclusion`)
    return callAndParse([...usedNames, generatedName])
  }

  return result
}

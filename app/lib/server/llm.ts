import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { RawUsage } from '../analytics'

/**
 * Server-side LLM dispatch. ALL prompt construction and model selection happens
 * here or in the services that call this — model names must never appear in
 * client code, and the client can never supply its own system prompt.
 */

export type LLMTask =
  | 'case_generation'
  | 'patient_chat'
  | 'ros_classifier'
  | 'derived_summary'
  | 'on_demand_result'
  | 'grading'
  | 'grading_oral'

/**
 * Task → model map. Phase 3 tiers small classification/summarization jobs down
 * to Haiku; grading and case generation stay on the smart model.
 */
const TASK_MODELS: Record<LLMTask, string> = {
  case_generation: 'claude-sonnet-4-6',
  patient_chat: 'claude-sonnet-4-6',
  ros_classifier: 'claude-sonnet-4-6',
  derived_summary: 'claude-sonnet-4-6',
  on_demand_result: 'claude-sonnet-4-6',
  grading: 'claude-sonnet-4-6',
  grading_oral: 'claude-sonnet-4-6',
}

const TASK_TIMEOUTS_MS: Partial<Record<LLMTask, number>> = {
  case_generation: 120_000,
  grading: 90_000,
}

let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000 })
  }
  return _client
}

export interface LLMResult {
  text: string
  usage: RawUsage
}

export async function callModel(
  task: LLMTask,
  opts: {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens: number
  },
): Promise<LLMResult> {
  const timeout = TASK_TIMEOUTS_MS[task] ?? 75_000
  const response = await client().messages.create(
    {
      model: TASK_MODELS[task],
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
    },
    { signal: AbortSignal.timeout(timeout) },
  )
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
  return { text, usage: response.usage as RawUsage }
}

/** Extract the first JSON object from a model reply, or throw. */
export function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object in model response')
  return JSON.parse(match[0]) as T
}

/** Extract the first JSON array from a model reply, or throw. */
export function extractJsonArray<T>(text: string): T[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array in model response')
  return JSON.parse(match[0]) as T[]
}

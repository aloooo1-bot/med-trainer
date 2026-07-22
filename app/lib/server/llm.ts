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
 * Task → model map (server-side only — model names must never reach client code).
 *
 * Patient roleplay, ROS classification, and derived summaries are short,
 * well-scoped jobs — Haiku handles them at a fraction of the cost. Grading
 * and case generation carry the clinical-accuracy burden and stay on Sonnet,
 * as do on-demand test results (fabricating clinically consistent values is
 * the failure mode we least want to cheap out on).
 */
const TASK_MODELS: Record<LLMTask, string> = {
  case_generation: 'claude-sonnet-4-6',
  patient_chat: 'claude-haiku-4-5-20251001',
  ros_classifier: 'claude-haiku-4-5-20251001',
  derived_summary: 'claude-haiku-4-5-20251001',
  on_demand_result: 'claude-sonnet-4-6',
  grading: 'claude-sonnet-4-6',
  grading_oral: 'claude-sonnet-4-6',
}

// Keep these under the client's postSession wait (180s) but generous enough for
// a full 12k-token generation under load — the server must not abort a
// still-valid generation before the client would give up.
const TASK_TIMEOUTS_MS: Partial<Record<LLMTask, number>> = {
  case_generation: 175_000,
  grading: 120_000,
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
  // Ops log: verifies the task→model tiering (e.g. chat on Haiku, grading on Sonnet).
  console.log(`[llm] task=${task} model=${TASK_MODELS[task]}`)
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

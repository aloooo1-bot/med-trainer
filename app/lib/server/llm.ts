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
  | 'case_audit'
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
  // Judges whether displayed prose is a fact or a stage direction, and a wrong
  // call deletes clinical text from a case. Same accuracy burden as generation.
  case_audit: 'claude-sonnet-4-6',
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
  // Sits between generation and the student. It fails open, so a short leash
  // costs a missed audit; a long one would stall a case that is otherwise ready.
  case_audit: 30_000,
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

/**
 * Extract the first BALANCED JSON object from a model reply. Scans brace depth
 * (respecting strings/escapes) rather than greedily matching to the last `}`,
 * so trailing prose is tolerated and a response truncated mid-array (after the
 * object's own braces balanced) still parses. Throws only on genuine
 * truncation (object never closes) or no object at all.
 */
export function extractJson<T>(text: string): T {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object in model response')
  let depth = 0, inString = false, escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1)) as T
  }
  throw new Error('Model JSON truncated before the object closed')
}

/** True when an error is an aborted/timed-out model request (retriable). */
export function isAbortError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? ''
  const msg = (err as { message?: string })?.message ?? ''
  return name === 'AbortError' || name === 'TimeoutError' ||
    /abort|timed? ?out/i.test(msg)
}

/** Extract the first JSON array from a model reply, or throw. */
export function extractJsonArray<T>(text: string): T[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array in model response')
  return JSON.parse(match[0]) as T[]
}

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { SERVER_BUDGET_MS } from '../requestBudget'
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

/**
 * Per-attempt budgets. Derived from SERVER_BUDGET_MS rather than hand-picked,
 * so a task can never be given longer than the request it runs inside — which
 * is the bug that made every generation slower than 120s impossible.
 *
 * These bound ONE attempt. A caller making several calls in sequence must also
 * respect the request budget itself; gradeService does that by passing what is
 * left of its deadline down as `timeoutMs`.
 */
const TASK_TIMEOUTS_MS: Partial<Record<LLMTask, number>> = {
  // Generation is a single call and may legitimately use the whole request.
  case_generation: SERVER_BUDGET_MS,
  // Grading runs up to twice and may be followed by the oral call, so no single
  // attempt may claim the whole budget. gradeService shortens this further as
  // its deadline approaches.
  grading: 120_000,
  // Sits between generation and the student. It fails open, so a short leash
  // costs a missed audit; a long one would stall a case that is otherwise ready.
  case_audit: 30_000,
}

/** The per-attempt budget for a task, for callers that must plan around it. */
export function taskTimeoutMs(task: LLMTask): number {
  return TASK_TIMEOUTS_MS[task] ?? 75_000
}

/** Longest budget any task asks for — nothing client-level may undercut it. */
const MAX_TASK_TIMEOUT_MS = Math.max(75_000, ...Object.values(TASK_TIMEOUTS_MS))

let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) {
    // Derived, never a hand-written constant. A client timeout of 120s sat
    // under case_generation's 175s budget and quietly made every slow
    // generation impossible: the SDK aborted at 120s, retried from scratch
    // (maxRetries defaults to 2, and connection timeouts ARE retried), and the
    // per-request signal then killed the retry. A Goodpasture case died at
    // 174s having generated — and paid for — two minutes of tokens it threw
    // away. Every request below sets its own timeout, so this is only a
    // backstop; it is derived so the trap cannot come back.
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: MAX_TASK_TIMEOUT_MS })
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
    /**
     * Shorten this attempt to what the caller has left. For a sequence of
     * calls inside one request, the task budget bounds each attempt but only
     * the caller knows how much of the request budget is already spent.
     */
    timeoutMs?: number
  },
): Promise<LLMResult> {
  const timeout = Math.min(taskTimeoutMs(task), opts.timeoutMs ?? Infinity)
  // A retry restarts generation from zero, so it is only worth having when
  // there is time left to run one. On a long task a timeout has already spent
  // the budget, and retrying just bills a second full generation that the
  // caller's own deadline will kill mid-flight. Short tasks keep the SDK's
  // retries, where they still buy something against a 429 or a 5xx.
  const maxRetries = timeout > 90_000 ? 0 : 2
  // Ops log: verifies the task→model tiering (e.g. chat on Haiku, grading on Sonnet).
  console.log(`[llm] task=${task} model=${TASK_MODELS[task]}`)
  const response = await client().messages.create(
    {
      model: TASK_MODELS[task],
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
    },
    // The SDK's timeout and the abort signal must agree. Passing only the
    // signal left the client-level default in charge of when to give up.
    { timeout, maxRetries, signal: AbortSignal.timeout(timeout) },
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

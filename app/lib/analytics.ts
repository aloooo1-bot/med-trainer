import type { GradingResult } from '../grading/types'

// Anthropic claude-sonnet-4-6 pricing (per million tokens, as of 2026)
const PRICING = {
  inputPerMTok: 3.00,
  outputPerMTok: 15.00,
  cacheWritePerMTok: 3.75,
  cacheReadPerMTok: 0.30,
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type APICallType =
  | 'generation'
  | 'chat'
  | 'grading_main'
  | 'grading_oral'
  | 'ros_derived'
  | 'ros_classifier'
  | 'on_demand'

export interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface APICallRecord {
  type: APICallType
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  costUSD: number
  ts: number
}

export interface CaseSessionRecord {
  id: string
  startedAt: number
  completedAt: number
  system: string
  difficulty: string
  diagnosis: string
  userDiagnosis: string
  correct: boolean
  score: number
  questionCount: number
  apiCalls: APICallRecord[]
  totalCostUSD: number
  totalInputTokens: number
  totalOutputTokens: number
  elapsedSeconds: number
  gradingResult?: GradingResult
}

// Held in a React ref during a live case; never persisted until submitDiagnosis
export interface ActiveSession {
  id: string
  startedAt: number
  system: string
  difficulty: string
  questionCount: number
  apiCalls: APICallRecord[]
  totalCostUSD: number
  totalInputTokens: number
  totalOutputTokens: number
}

export interface AbandonedSessionRecord {
  id: string
  startedAt: number
  abandonedAt: number
  system: string
  difficulty: string
  tabAtAbandon: string
  questionCount: number
  elapsedSeconds: number
}

// ── Cost helpers ──────────────────────────────────────────────────────────────

export function calcCallCost(usage: RawUsage): number {
  const inp = (usage.input_tokens ?? 0) / 1_000_000 * PRICING.inputPerMTok
  const out = (usage.output_tokens ?? 0) / 1_000_000 * PRICING.outputPerMTok
  const cw  = (usage.cache_creation_input_tokens ?? 0) / 1_000_000 * PRICING.cacheWritePerMTok
  const cr  = (usage.cache_read_input_tokens ?? 0) / 1_000_000 * PRICING.cacheReadPerMTok
  return inp + out + cw + cr
}

export function makeCallRecord(type: APICallType, usage: RawUsage): APICallRecord {
  return {
    type,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    costUSD: calcCallCost(usage),
    ts: Date.now(),
  }
}

// ── Session management ────────────────────────────────────────────────────────

export function createActiveSession(system: string, difficulty: string): ActiveSession {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    startedAt: Date.now(),
    system,
    difficulty,
    questionCount: 0,
    apiCalls: [],
    totalCostUSD: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  }
}

export function recordToSession(session: ActiveSession, record: APICallRecord): void {
  session.apiCalls.push(record)
  session.totalCostUSD += record.costUSD
  session.totalInputTokens += record.inputTokens + record.cacheWriteTokens + record.cacheReadTokens
  session.totalOutputTokens += record.outputTokens
}

// ── localStorage ──────────────────────────────────────────────────────────────

const ANALYTICS_KEY = 'medtrainer_analytics'
const MAX_SESSIONS = 1000
const ABANDONED_KEY = 'medtrainer_abandoned'
const MAX_ABANDONED = 500

export function loadSessionRecords(): CaseSessionRecord[] {
  try { return JSON.parse(localStorage.getItem(ANALYTICS_KEY) ?? '[]') as CaseSessionRecord[] } catch { return [] }
}

export function clearAnalytics(): void {
  try { localStorage.removeItem(ANALYTICS_KEY) } catch {}
}

export function loadAbandonedSessions(): AbandonedSessionRecord[] {
  try { return JSON.parse(localStorage.getItem(ABANDONED_KEY) ?? '[]') as AbandonedSessionRecord[] } catch { return [] }
}

export function clearAbandonedAnalytics(): void {
  try { localStorage.removeItem(ABANDONED_KEY) } catch {}
}

export function recordAbandonedSession(active: ActiveSession, tabAtAbandon: string): void {
  try {
    const abandonedAt = Date.now()
    const record: AbandonedSessionRecord = {
      id: active.id,
      startedAt: active.startedAt,
      abandonedAt,
      system: active.system,
      difficulty: active.difficulty,
      tabAtAbandon,
      questionCount: active.questionCount,
      elapsedSeconds: Math.round((abandonedAt - active.startedAt) / 1000),
    }
    const existing = loadAbandonedSessions()
    existing.push(record)
    localStorage.setItem(ABANDONED_KEY, JSON.stringify(existing.slice(-MAX_ABANDONED)))
  } catch {}
}

export function finalizeSession(
  active: ActiveSession,
  outcome: Pick<CaseSessionRecord, 'diagnosis' | 'userDiagnosis' | 'correct' | 'score'> & { gradingResult?: GradingResult }
): void {
  try {
    const completedAt = Date.now()
    const record: CaseSessionRecord = {
      ...active,
      completedAt,
      elapsedSeconds: Math.round((completedAt - active.startedAt) / 1000),
      ...outcome,
    }
    const existing = loadSessionRecords()
    existing.push(record)
    const trimmed = existing.slice(-MAX_SESSIONS)
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(trimmed))
  } catch {}
}

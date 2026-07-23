import { revalidateTag } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import type { CaseSessionRecord } from '@/app/lib/analytics'
import type { Json } from '@/app/lib/supabase/types'

const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']
const MAX_TEXT = 200
const MAX_NOTES = 20_000
const DAY_SECONDS = 86_400

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Bounds/type validation of the client-supplied session record. The grade
 * itself is produced server-side by /api/session/grade, but this route can't
 * yet prove the posted numbers came from there — so at minimum nothing
 * out-of-range or shape-invalid is persisted.
 */
function validate(s: Partial<CaseSessionRecord>): string | null {
  if (typeof s.id !== 'string' || !s.id) return 'id must be a non-empty string'
  if (!isFiniteNumber(s.startedAt) || !isFiniteNumber(s.completedAt)) return 'startedAt/completedAt must be numbers'
  if (s.completedAt < s.startedAt) return 'completedAt precedes startedAt'
  if (typeof s.system !== 'string' || !s.system || s.system.length > MAX_TEXT) return 'invalid system'
  if (typeof s.difficulty !== 'string' || !DIFFICULTIES.includes(s.difficulty)) return 'invalid difficulty'
  if (typeof s.diagnosis !== 'string' || !s.diagnosis || s.diagnosis.length > MAX_TEXT) return 'invalid diagnosis'
  if (typeof s.userDiagnosis !== 'string' || s.userDiagnosis.length > MAX_TEXT) return 'invalid userDiagnosis'
  if (typeof s.correct !== 'boolean') return 'correct must be a boolean'
  if (!isFiniteNumber(s.score) || s.score < 0 || s.score > 100) return 'score must be 0-100'
  if (!isFiniteNumber(s.questionCount) || s.questionCount < 0 || s.questionCount > 500) return 'invalid questionCount'
  if (!isFiniteNumber(s.elapsedSeconds) || s.elapsedSeconds < 0 || s.elapsedSeconds > DAY_SECONDS) return 'invalid elapsedSeconds'
  if (s.notes !== undefined && (typeof s.notes !== 'string' || s.notes.length > MAX_NOTES)) return 'invalid notes'
  if (s.gradingResult !== undefined && s.gradingResult !== null && typeof s.gradingResult !== 'object') return 'invalid gradingResult'
  return null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let session: CaseSessionRecord
  try {
    session = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const invalid = validate(session)
  if (invalid) return Response.json({ error: invalid }, { status: 400 })

  const { error } = await supabase.from('case_sessions').insert({
    id: session.id,
    user_id: user.id,
    started_at: new Date(session.startedAt).toISOString(),
    completed_at: new Date(session.completedAt).toISOString(),
    system: session.system,
    difficulty: session.difficulty,
    diagnosis: session.diagnosis,
    user_diagnosis: session.userDiagnosis,
    correct: session.correct,
    score: Math.round(session.score),
    question_count: Math.round(session.questionCount),
    elapsed_seconds: Math.round(session.elapsedSeconds),
    total_cost_usd: session.totalCostUSD,
    total_input_tokens: session.totalInputTokens,
    total_output_tokens: session.totalOutputTokens,
    api_calls: session.apiCalls as unknown as Json,
    grading_result: (session.gradingResult ?? null) as unknown as Json,
    bookmarked: session.bookmarked === true,
    parent_session_id: session.parentSessionId ?? null,
    notes: session.notes ?? '',
  })

  if (error) {
    // Duplicate key = already saved; treat as success
    if (error.code === '23505') return Response.json({ ok: true })
    return Response.json({ error: error.message }, { status: 500 })
  }

  revalidateTag(`session:${user.id}`, 'max')
  return Response.json({ ok: true })
}

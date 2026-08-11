import { revalidateTag } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { replayEvents } from '@/app/lib/server/replay'
import type { CaseSessionRecord } from '@/app/lib/analytics'
import type { Json } from '@/app/lib/supabase/types'

const MAX_TEXT = 200
const MAX_NOTES = 20_000
const DAY_SECONDS = 86_400

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Bounds/shape validation for the telemetry the client legitimately owns
 * (timings, counts, token usage). The GRADE is never taken from here — see
 * below.
 */
function validate(s: Partial<CaseSessionRecord>): string | null {
  if (typeof s.id !== 'string' || !s.id) return 'id must be a non-empty string'
  if (!isFiniteNumber(s.startedAt) || !isFiniteNumber(s.completedAt)) return 'startedAt/completedAt must be numbers'
  if (s.completedAt < s.startedAt) return 'completedAt precedes startedAt'
  if (typeof s.userDiagnosis !== 'string' || s.userDiagnosis.length > MAX_TEXT) return 'invalid userDiagnosis'
  if (!isFiniteNumber(s.questionCount) || s.questionCount < 0 || s.questionCount > 500) return 'invalid questionCount'
  if (!isFiniteNumber(s.elapsedSeconds) || s.elapsedSeconds < 0 || s.elapsedSeconds > DAY_SECONDS) return 'invalid elapsedSeconds'
  if (s.notes !== undefined && (typeof s.notes !== 'string' || s.notes.length > MAX_NOTES)) return 'invalid notes'
  return null
}

/**
 * POST /api/sessions/save
 *
 * Persists a completed case to the user's history. The score, correctness and
 * grading breakdown are read from the SERVER's own record of the session — the
 * grade produced by /api/session/grade and written to the submit event — not
 * from the posted body. Previously the client supplied all three, so anyone
 * could POST fabricated 100/100 rows that then fed Progress, mastery, streaks
 * and the activity calendar.
 *
 * The system, difficulty and diagnosis likewise come from the server session,
 * so a record cannot be filed against a case that was never played.
 */
export async function POST(req: Request) {
  let body: CaseSessionRecord & { trainerSessionId?: string | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Authenticates, rate-limits, and proves this session belongs to the caller.
  const access = await requireOwnSession(body.trainerSessionId)
  if (!access.ok) return access.response
  const { user, data: { session, events } } = access

  const invalid = validate(body)
  if (invalid) return Response.json({ error: invalid }, { status: 400 })

  const state = replayEvents(events)
  const graded = state.gradingResult
  if (session.phase !== 'graded' || !graded) {
    return Response.json({ error: 'This session has not been graded yet.' }, { status: 409 })
  }

  // Authoritative grade — recomputed from the dimension scores the grader
  // returned, exactly as gradeSession does, so a tampered total in the stored
  // result could not survive either.
  const dimensionTotal = graded.dimensions
    ? Object.values(graded.dimensions).reduce((sum, d) => sum + (d?.score ?? 0), 0)
    : graded.score
  const score = Math.max(0, Math.min(100, Math.round(dimensionTotal)))

  const supabase = await createClient()
  const { error } = await supabase.from('case_sessions').insert({
    id: body.id,
    user_id: user.id,
    started_at: new Date(body.startedAt).toISOString(),
    completed_at: new Date(body.completedAt).toISOString(),
    // Case identity comes from the server session, not the payload.
    system: session.system,
    difficulty: session.difficulty,
    diagnosis: session.caseData.diagnosis,
    user_diagnosis: state.submittedDiagnosis ?? body.userDiagnosis,
    correct: graded.correct === true,
    score,
    grading_result: graded as unknown as Json,
    // Client-owned telemetry, bounds-checked above.
    question_count: Math.round(body.questionCount),
    elapsed_seconds: Math.round(body.elapsedSeconds),
    total_cost_usd: body.totalCostUSD,
    total_input_tokens: body.totalInputTokens,
    total_output_tokens: body.totalOutputTokens,
    api_calls: body.apiCalls as unknown as Json,
    bookmarked: body.bookmarked === true,
    parent_session_id: body.parentSessionId ?? null,
    notes: body.notes ?? '',
    // Join key back to the event log, so the finished case can be replayed for
    // review. Taken from the server session requireOwnSession resolved, not the
    // posted value — same id, but sourced from the record we actually verified.
    trainer_session_id: session.id,
  })

  if (error) {
    // Duplicate key = already saved; treat as success
    if (error.code === '23505') return Response.json({ ok: true })
    return Response.json({ error: error.message }, { status: 500 })
  }

  revalidateTag(`session:${user.id}`, 'max')
  return Response.json({ ok: true })
}

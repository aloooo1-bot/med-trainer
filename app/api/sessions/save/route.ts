import { createClient } from '@/app/lib/supabase/server'
import type { CaseSessionRecord } from '@/app/lib/analytics'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const session: CaseSessionRecord = await req.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('case_sessions').insert({
    id: session.id,
    user_id: user.id,
    started_at: new Date(session.startedAt).toISOString(),
    completed_at: new Date(session.completedAt).toISOString(),
    system: session.system,
    difficulty: session.difficulty,
    diagnosis: session.diagnosis,
    user_diagnosis: session.userDiagnosis,
    correct: session.correct,
    score: session.score,
    question_count: session.questionCount,
    elapsed_seconds: session.elapsedSeconds,
    total_cost_usd: session.totalCostUSD,
    total_input_tokens: session.totalInputTokens,
    total_output_tokens: session.totalOutputTokens,
    api_calls: session.apiCalls,
    grading_result: session.gradingResult ?? null,
    bookmarked: session.bookmarked ?? false,
    parent_session_id: session.parentSessionId ?? null,
  })

  if (error) {
    // Duplicate key = already saved; treat as success
    if (error.code === '23505') return Response.json({ ok: true })
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}

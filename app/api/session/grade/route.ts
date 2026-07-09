import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'
import { replayEvents } from '@/app/lib/server/replay'
import { assembleGradingInput, gradeSession } from '@/app/lib/server/gradeService'
import { buildReveal } from '@/app/lib/server/caseTiers'
import type { RawUsage } from '@/app/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/grade
 * Body: { sessionId, diagnosis, reasoningText?, timedOut? }
 *
 * The grading input is assembled entirely server-side from the session event
 * log + ground truth. The client contributes ONLY its diagnosis text and
 * written reasoning/presentation. Returns the grading result plus the
 * post-submission teaching reveal.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      sessionId?: string; diagnosis?: string; reasoningText?: string; timedOut?: boolean
    }
    const access = await requireOwnSession(body.sessionId)
    if (!access.ok) return access.response
    const { session, events } = access.data

    const diagnosis = (body.diagnosis ?? '').trim()
    if (!diagnosis) return Response.json({ error: 'diagnosis is required.' }, { status: 400 })
    if (session.phase === 'graded') {
      return Response.json({ error: 'This session was already graded.' }, { status: 409 })
    }

    const state = replayEvents(events)
    const reasoningText = (body.reasoningText ?? '').trim().slice(0, 20_000)
    const input = assembleGradingInput(session, state, diagnosis, reasoningText, !!body.timedOut)

    const usages: Array<{ type: string; usage: RawUsage }> = []
    const result = await gradeSession(input, (type, usage) => usages.push({ type, usage }))

    const store = await getSessionStore()
    await store.appendEvent(session.id, makeEvent('submit', {
      diagnosis, reasoningText, timedOut: !!body.timedOut, result, usages,
    }))
    await store.setPhase(session.id, 'graded')

    return Response.json({
      result,
      reveal: buildReveal(session.caseData),
      prediction: state.prediction,
      orderedTests: state.orderedTests,
      usages,
    })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/grade' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/grade] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

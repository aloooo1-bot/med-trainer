import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'
import { replayEvents } from '@/app/lib/server/replay'
import { assembleGradingInput, gradeSession } from '@/app/lib/server/gradeService'
import { isAbortError } from '@/app/lib/server/llm'
import { buildReveal } from '@/app/lib/server/caseTiers'
import type { RawUsage } from '@/app/lib/analytics'

export const dynamic = 'force-dynamic'

// The platform kills the function at maxDuration regardless of any budget the
// code sets, so it must sit ABOVE SERVER_BUDGET_MS in app/lib/requestBudget.ts
// (165s) plus response overhead. Must be a static literal, so it cannot import
// that constant — if you raise the budget, raise this too.
export const maxDuration = 240

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
      workingDifferential?: unknown
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
    // Optional student-authored differential — context for the grader only.
    // Same caps as /api/session/predict; absent field = pre-existing behavior.
    const workingDifferential = Array.isArray(body.workingDifferential)
      ? body.workingDifferential
          .filter((x): x is string => typeof x === 'string')
          .map(x => x.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 10)
      : []
    const input = assembleGradingInput(session, state, diagnosis, reasoningText, !!body.timedOut, workingDifferential)

    const usages: Array<{ type: string; usage: RawUsage }> = []
    const result = await gradeSession(input, (type, usage) => usages.push({ type, usage }))

    // Presentation time = gap between entering the write-up phase and submitting
    // (diagnostic time was logged on the enter_presentation event itself).
    const presentationSeconds = state.enteredPresentationAt
      ? Math.round((Date.now() - new Date(state.enteredPresentationAt).getTime()) / 1000)
      : null

    const store = await getSessionStore()
    await store.appendEvent(session.id, makeEvent('submit', {
      diagnosis, reasoningText, timedOut: !!body.timedOut, presentationSeconds, result, usages,
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
    if (isAbortError(err)) {
      return Response.json(
        { error: 'Grading is taking longer than usual. Please try again.', retriable: true },
        { status: 503 },
      )
    }
    return Response.json({ error: message }, { status: 500 })
  }
}

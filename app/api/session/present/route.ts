import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'
import { replayEvents } from '@/app/lib/server/replay'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/present
 * Body: { sessionId, diagnosticSeconds? }
 *
 * Marks the transition into the diagnosis/presentation phase (4.1): the case
 * timer stops here, and from this moment ask/exam/order/predict are locked
 * server-side (they require phase === 'active') so stopping the clock cannot
 * be exploited to keep working the case for free. Diagnostic time (client
 * timer elapsed) is logged now; presentation time is derivable as the gap
 * between this event and the submit event.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: string; diagnosticSeconds?: number }
    const access = await requireOwnSession(body.sessionId)
    if (!access.ok) return access.response
    const { session, events } = access.data

    if (session.phase === 'graded') {
      return Response.json({ error: 'This session was already graded.' }, { status: 409 })
    }
    if (session.phase === 'presentation') {
      return Response.json({ ok: true, phase: 'presentation' }) // idempotent
    }

    const state = replayEvents(events)
    const store = await getSessionStore()
    await store.appendEvent(session.id, makeEvent('enter_presentation', {
      diagnosticSeconds: typeof body.diagnosticSeconds === 'number' && body.diagnosticSeconds >= 0
        ? Math.round(body.diagnosticSeconds)
        : null,
      questionsAsked: state.chat.length / 2,
      testsOrdered: state.orderedTests.length,
    }))
    await store.setPhase(session.id, 'presentation')

    return Response.json({ ok: true, phase: 'presentation' })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/present' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/present] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

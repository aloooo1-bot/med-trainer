import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'
import { replayEvents } from '@/app/lib/server/replay'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/predict
 * Body: { sessionId, ranking: string[], confidence: number | null }
 * Logs the pre-test differential commitment (immutable once set).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      sessionId?: string; ranking?: string[]; confidence?: number | null
    }
    const access = await requireOwnSession(body.sessionId)
    if (!access.ok) return access.response
    const { session, events } = access.data

    if (session.phase !== 'active') {
      return Response.json({ error: 'This session is closed.' }, { status: 409 })
    }
    const ranking = (body.ranking ?? []).filter((r): r is string => typeof r === 'string' && !!r.trim()).slice(0, 10)
    if (!ranking.length) return Response.json({ error: 'ranking[] is required.' }, { status: 400 })
    const confidence = typeof body.confidence === 'number'
      ? Math.max(0, Math.min(1, body.confidence))
      : null

    const state = replayEvents(events)
    if (state.prediction) {
      return Response.json({ error: 'Prediction already locked for this session.' }, { status: 409 })
    }

    const store = await getSessionStore()
    await store.appendEvent(session.id, makeEvent('prediction', { ranking, confidence }))
    return Response.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/predict' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/predict] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

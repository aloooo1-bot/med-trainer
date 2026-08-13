import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireUser, sessionIdRequired, sessionNotFound } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/exam
 * Body: { sessionId, region }
 * Returns that region's findings from the server-side snapshot and logs the exam.
 *
 * Uses the narrow `examRegion` read rather than the full session guard: this is
 * the most-clicked route in the encounter and it needs one sentence, not the
 * case snapshot and every event so far. Ownership is checked here, against the
 * userId that read returns.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: string; region?: string }
    const access = await requireUser()
    if (!access.ok) return access.response
    const sessionId = body.sessionId
    if (typeof sessionId !== 'string' || !sessionId) return sessionIdRequired()

    const store = await getSessionStore()
    const region = body.region ?? ''
    const read = await store.examRegion(sessionId, region)
    if (!read || read.userId !== access.user.id) return sessionNotFound()

    if (read.phase !== 'active') {
      return Response.json({ error: 'This session is no longer accepting exams.' }, { status: 409 })
    }
    const finding = read.finding
    if (finding === undefined) {
      return Response.json({ error: 'Unknown exam region.' }, { status: 400 })
    }

    await store.appendEvent(sessionId, makeEvent('exam', { region, finding }))

    return Response.json({ region, finding })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/exam' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/exam] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

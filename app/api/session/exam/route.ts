import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/exam
 * Body: { sessionId, region }
 * Returns that region's findings from the server-side snapshot and logs the exam.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: string; region?: string }
    const access = await requireOwnSession(body.sessionId)
    if (!access.ok) return access.response
    const { session } = access.data

    if (session.phase !== 'active') {
      return Response.json({ error: 'This session is no longer accepting exams.' }, { status: 409 })
    }
    const region = body.region ?? ''
    const finding = session.caseData.physicalExam[region]
    if (finding === undefined) {
      return Response.json({ error: 'Unknown exam region.' }, { status: 400 })
    }

    const store = await getSessionStore()
    await store.appendEvent(session.id, makeEvent('exam', { region, finding }))

    return Response.json({ region, finding })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/exam' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/exam] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

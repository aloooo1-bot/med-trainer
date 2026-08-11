import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { replayEvents } from '@/app/lib/server/replay'
import { resolveResult } from '@/app/lib/server/orderService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sessions/replay?sessionId=<trainer session id>
 *
 * The encounter behind a finished history row: what the student asked, what
 * they examined, and what every test they ordered came back as. Rebuilt from
 * the event log on demand rather than copied into case_sessions — the log is
 * already the authoritative record, and duplicating a full transcript per row
 * would weigh down every history list fetch for something read on expand.
 *
 * GRADED SESSIONS ONLY. Results are resolved against the case snapshot, which
 * is ground truth; serving that for a live case would hand a student the
 * answers mid-encounter. requireOwnSession covers auth, ownership and rate
 * limiting; the phase check is the anti-peek guard on top.
 */
export async function GET(req: NextRequest) {
  try {
    const access = await requireOwnSession(req.nextUrl.searchParams.get('sessionId'))
    if (!access.ok) return access.response
    const { data: { session, events } } = access

    if (session.phase !== 'graded') {
      return Response.json(
        { error: 'This case is still in progress — review is available once it is graded.' },
        { status: 409 },
      )
    }

    const state = replayEvents(events)

    return Response.json({
      transcript: state.chat,
      exams: state.exams,
      // Same resolver the live order route uses, so a fuzzy-matched order
      // reviews as the result the student actually saw.
      results: state.orderedTests.map(t => resolveResult(t, session.caseData)),
      prediction: state.prediction,
      patientName: session.caseData.patientInfo?.name ?? null,
    })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/sessions/replay' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/sessions/replay] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

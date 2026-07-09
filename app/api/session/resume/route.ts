import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getSessionUser, unauthorized } from '@/app/lib/server/auth'
import { getSessionStore } from '@/app/lib/server/sessionStore'
import { replayEvents } from '@/app/lib/server/replay'
import { buildPresentation, buildReveal } from '@/app/lib/server/caseTiers'
import { resolveResult } from '@/app/lib/server/orderService'
import { classifyFinding } from '@/app/lib/rosDetector'

export const dynamic = 'force-dynamic'

/**
 * GET /api/session/resume[?sessionId=...]
 * Rehydrates the client after a refresh from the server-side event log —
 * the log, not React state, is the source of truth for an in-flight case.
 * Without sessionId, returns the user's most recent non-graded session.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const store = await getSessionStore()
    const sessionId = req.nextUrl.searchParams.get('sessionId')
    const data = sessionId ? await store.get(sessionId) : await store.latestActiveFor(user.id)
    if (!data || data.session.userId !== user.id) {
      return Response.json({ session: null })
    }

    const { session, events } = data
    const state = replayEvents(events)
    const graded = session.phase === 'graded' && state.gradingResult

    return Response.json({
      session: {
        sessionId: session.id,
        system: session.system,
        difficulty: session.difficulty,
        phase: session.phase,
        createdAt: session.createdAt,
      },
      presentation: buildPresentation(session.caseData, session.difficulty),
      chat: state.chat,
      ros: Object.entries(state.ros).map(([category, v]) => ({
        category,
        derivedFinding: v?.derivedFinding ?? '',
        // ANTI-CUEING: while the case is live, status reflects only what the
        // patient actually reported; the canonical finding drives it only
        // after grading (when the full ROS is revealed anyway).
        status: classifyFinding(
          graded
            ? (session.caseData.reviewOfSystems[category] ?? '')
            : (v?.derivedFinding ?? ''),
        ),
      })),
      hpi: state.hpi,
      exams: state.exams,
      orderedTests: state.orderedTests,
      results: state.orderedTests.map(t => resolveResult(t, session.caseData)),
      prediction: state.prediction,
      ...(graded
        ? { gradingResult: state.gradingResult, reveal: buildReveal(session.caseData), submittedDiagnosis: state.submittedDiagnosis }
        : {}),
    })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/resume' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/resume] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

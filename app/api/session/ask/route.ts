import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'
import { replayEvents } from '@/app/lib/server/replay'
import { buildPatientSystemPrompt } from '@/app/lib/server/patientPrompt'
import { classifyRosCategories, deriveRosSummary, resolveHpiUnlocks } from '@/app/lib/server/rosService'
import { callModel } from '@/app/lib/server/llm'
import { classifyFinding, type ROSCategory } from '@/app/lib/rosDetector'
import type { RawUsage } from '@/app/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/ask
 * Body: { sessionId, message }
 *
 * The patient-agent prompt is built server-side from the session's case
 * snapshot; ROS/HPI unlock classification and derived summaries also run here.
 * Returns the patient reply plus newly derived findings — never canonical
 * case content.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: string; message?: string }
    const access = await requireOwnSession(body.sessionId)
    if (!access.ok) return access.response
    const { session, events } = access.data

    const message = (body.message ?? '').trim()
    if (!message) return Response.json({ error: 'message is required.' }, { status: 400 })
    if (message.length > 2000) return Response.json({ error: 'Message too long.' }, { status: 400 })
    if (session.phase !== 'active') {
      return Response.json({ error: 'This session is no longer accepting patient questions.' }, { status: 409 })
    }

    const state = replayEvents(events)
    const usages: Array<{ type: string; usage: RawUsage }> = []

    const system = buildPatientSystemPrompt(
      session.caseData,
      session.difficulty,
      new Set(state.exams.map(e => e.region)),
    )
    const history = [...state.chat, { role: 'user' as const, content: message }]
    const { text: reply, usage } = await callModel('patient_chat', {
      system,
      messages: history,
      maxTokens: 300,
    })
    usages.push({ type: 'chat', usage })

    // ROS classification. First hits unlock the category; repeat hits on an
    // already-unlocked category UPDATE its cumulative derived record so a
    // better follow-up question is never dropped from what the grader sees.
    const matched = await classifyRosCategories(message, (t, u) => usages.push({ type: t, usage: u }))

    const rosUnlocks: Array<{ category: ROSCategory; derivedFinding: string; status: 'positive' | 'negative' }> = []
    await Promise.all(matched.map(async cat => {
      const previous = state.ros[cat]?.derivedFinding
      const derivedFinding = await deriveRosSummary(cat, message, reply, (t, u) => usages.push({ type: t, usage: u }), previous)
      // ANTI-CUEING: status (row color) is classified from what the patient
      // ACTUALLY reported in this conversation — never from the canonical case
      // finding. A lazy one-line question about a system with a hidden positive
      // must not light up the row; the canonical finding is revealed only after
      // grading.
      rosUnlocks.push({ category: cat, derivedFinding, status: classifyFinding(derivedFinding) })
    }))

    const hpiUnlocks = resolveHpiUnlocks(message, session.caseData)

    const store = await getSessionStore()
    await store.appendEvent(session.id, makeEvent('ask', {
      message,
      reply,
      rosUnlocks: rosUnlocks.map(u => ({ category: u.category, derivedFinding: u.derivedFinding })),
      hpiUnlocks,
      usages,
    }))

    return Response.json({ reply, rosUnlocks, hpiUnlocks, usages })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/ask' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/ask] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { getSessionStore, makeEvent } from '@/app/lib/server/sessionStore'
import { replayEvents } from '@/app/lib/server/replay'
import { resolveResult, generateOnDemand, type OrderedTestResult } from '@/app/lib/server/orderService'
import type { RawUsage } from '@/app/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/order
 * Body: { sessionId, tests: string[] }
 * Returns results for the newly ordered tests from the server-side snapshot,
 * generating missing results on demand, and logs the order.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: string; tests?: string[]; retry?: boolean }
    const access = await requireOwnSession(body.sessionId)
    if (!access.ok) return access.response
    const { session, events } = access.data

    if (session.phase !== 'active') {
      return Response.json({ error: 'This session is no longer accepting orders.' }, { status: 409 })
    }
    const requested = (body.tests ?? [])
      .filter((t): t is string => typeof t === 'string')
      .map(t => t.trim()).filter(Boolean).slice(0, 25)
    if (!requested.length) {
      return Response.json({ error: 'tests[] is required.' }, { status: 400 })
    }

    const state = replayEvents(events)
    const already = new Set(state.orderedTests)
    // retry: re-process already-ordered tests (e.g. failed on-demand generation)
    // without double-logging them.
    const toProcess = body.retry ? requested : requested.filter(t => !already.has(t))
    const newTests = toProcess.filter(t => !already.has(t))

    const usages: Array<{ type: string; usage: RawUsage }> = []
    let caseData = session.caseData
    let snapshotDirty = false
    const results: OrderedTestResult[] = []

    for (const test of toProcess) {
      let result = resolveResult(test, caseData)
      if (result.kind === 'none') {
        // No pre-generated result — synthesize one rather than dropping the order.
        const generated = await generateOnDemand(test, caseData, u => usages.push({ type: 'on_demand', usage: u }))
        if (generated) {
          caseData = generated.caseData
          snapshotDirty = true
          result = { ...resolveResult(test, caseData), generatedOnDemand: true }
        }
      }
      results.push(result)
    }

    const store = await getSessionStore()
    if (snapshotDirty) await store.updateCaseData(session.id, caseData)
    if (newTests.length) {
      await store.appendEvent(session.id, makeEvent('order', { tests: newTests, usages }))
    }

    return Response.json({ results, usages })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/order' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/order] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

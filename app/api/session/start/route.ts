import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getSessionUser, unauthorized } from '@/app/lib/server/auth'
import { consumeCaseQuota } from '@/app/lib/server/gate'
import { sessionStartRatelimit } from '@/app/lib/ratelimit'
import {
  lookupCachedCase, pickImageFirstCase, pickManifestDiagnosis,
  generateCaseLive, saveGeneratedCase, type AcquiredCase,
} from '@/app/lib/server/caseSource'
import { buildPresentation } from '@/app/lib/server/caseTiers'
import { getSessionStore, makeEvent, type TrainerSessionRecord } from '@/app/lib/server/sessionStore'
import { jitterCase } from '@/app/lib/caseJitter'
import { MANIFEST, makeCaseId } from '@/app/lib/caseManifest'

export const dynamic = 'force-dynamic'

const SYSTEMS = Object.keys(MANIFEST)
const DIFFICULTIES = ['Foundations', 'Clinical', 'Advanced']

/**
 * POST /api/session/start
 * Body: { system?, difficulty?, diagnosis? (redo), redo?, caseId? (deep link) }
 *
 * Creates a server-side session: resolves/generates the case entirely
 * server-side and returns ONLY the difficulty-stripped presentation slice.
 * The diagnosis is picked server-side so the client never learns which
 * manifest entry was chosen.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthorized()

    const { success } = await sessionStartRatelimit.limit(user.id)
    if (!success) {
      return Response.json({ error: 'Too many case starts — wait a moment.' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({})) as {
      system?: string; difficulty?: string; diagnosis?: string; redo?: boolean; caseId?: string
    }

    const gate = await consumeCaseQuota(user)
    if (!gate.allowed) {
      return Response.json({ error: 'gate_blocked', reason: gate.reason, gate }, { status: 403 })
    }

    let acquired: AcquiredCase | null = null
    let system = ''
    let difficulty = ''

    if (body.caseId) {
      // Deep link to an existing case — lookup only, no generation.
      acquired = await lookupCachedCase(body.caseId)
      if (!acquired) {
        return Response.json({ error: 'Case not found.' }, { status: 404 })
      }
      const native = (acquired.caseData as { nativeDifficulty?: string }).nativeDifficulty
      difficulty = native ?? 'Clinical'
      system = body.caseId.split('-')[0] ?? ''
      system = SYSTEMS.find(s => s.toLowerCase().startsWith(system.toLowerCase())) ?? system
    } else {
      const baseSystem = body.system && SYSTEMS.includes(body.system) ? body.system : 'Any'
      system = baseSystem === 'Any'
        ? SYSTEMS[Math.floor(Math.random() * SYSTEMS.length)]
        : baseSystem
      difficulty = DIFFICULTIES.includes(body.difficulty ?? '') ? body.difficulty! : 'Foundations'

      const overrideDx = body.diagnosis?.trim() || null

      // 40% image-anchored path (skipped when redoing a specific diagnosis).
      if (!overrideDx && Math.random() < 0.4) {
        acquired = await pickImageFirstCase(system, difficulty)
      }

      if (!acquired) {
        const diagnosis = overrideDx ?? pickManifestDiagnosis(system, difficulty)
        if (diagnosis && !overrideDx) {
          acquired = await lookupCachedCase(makeCaseId(system, difficulty, diagnosis, 0))
        }
        if (!acquired) {
          acquired = await generateCaseLive(system, difficulty, diagnosis, { redo: !!body.redo })
          if (acquired.caseId && diagnosis) {
            // Fire-and-forget persist so the next request for this slot is instant.
            void saveGeneratedCase(acquired.caseId, system, difficulty, diagnosis, acquired.caseData)
          }
        }
      }
    }

    const jittered = jitterCase(acquired.caseData)
    const sessionId = crypto.randomUUID()
    const now = new Date().toISOString()
    const session: TrainerSessionRecord = {
      id: sessionId,
      userId: user.id,
      caseId: acquired.caseId,
      system,
      difficulty,
      phase: 'active',
      createdAt: now,
      caseData: jittered,
      imagingCache: acquired.imagingCache,
    }

    const store = await getSessionStore()
    await store.create(session)
    await store.appendEvent(sessionId, makeEvent('start', {
      caseId: acquired.caseId, system, difficulty, generated: acquired.generated,
    }))

    return Response.json({
      sessionId,
      system,
      difficulty,
      phase: 'active',
      gate,
      presentation: buildPresentation(jittered, difficulty),
      usage: acquired.usage ?? null,
    })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/start' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/start] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

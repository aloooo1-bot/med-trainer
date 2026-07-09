import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { replayEvents } from '@/app/lib/server/replay'
import { pickECGImage, pickSpecialImage } from '@/app/lib/server/imageLookup'
import { fetchImagingResults, type OpenIResult } from '@/app/lib/imagingSearch'
import { getSpecialModality } from '@/app/lib/specialImageLookup'
import { isECGTest } from '@/app/trainer/_lib/testUtils'
import { createAdminClient } from '@/app/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/session/images
 * Body: { sessionId, test }
 *
 * Server-side image selection for an ORDERED test. The diagnosis-derived
 * search terms and category mapping stay off the client. Only tests the
 * student actually ordered can be resolved.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: string; test?: string }
    const access = await requireOwnSession(body.sessionId)
    if (!access.ok) return access.response
    const { session, events } = access.data

    const test = body.test ?? ''
    const state = replayEvents(events)
    if (!state.orderedTests.includes(test)) {
      return Response.json({ error: 'Test was not ordered in this session.' }, { status: 400 })
    }

    const caseData = session.caseData

    if (isECGTest(test)) {
      const image = await pickECGImage(caseData.diagnosis, caseData.ecgFindings)
      return Response.json({ kind: 'ecg', ecg: image })
    }

    const modality = getSpecialModality(test)
    if (modality) {
      const findingField = {
        smear: caseData.hematologyFindings,
        biopsy: caseData.biopsyFindings,
        fundus: caseData.fundusFindings,
        derm: caseData.skinFindings,
        urine: caseData.urineFindings,
      }[modality]
      const image = await pickSpecialImage(modality, caseData.diagnosis, findingField)
      return Response.json({ kind: 'special', modality, special: image })
    }

    // Radiology imaging — session-level pre-verified cache first, then Open-i.
    const cached = session.imagingCache?.[test]
    if (Array.isArray(cached) && cached.length > 0) {
      return Response.json({ kind: 'imaging', results: cached })
    }

    const results: OpenIResult[] = await fetchImagingResults({
      orderedTest: test,
      caseDiagnosis: caseData.diagnosis,
      imagingCategory: caseData.imagingCategory,
      baseUrl: req.nextUrl.origin,
    })

    // Write-back to the shared case cache (best-effort) so future sessions
    // of this case are served without an Open-i round trip.
    if (results.length > 0 && session.caseId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const db = createAdminClient()
        void db.rpc('cache_imaging_test', {
          p_case_id: session.caseId,
          p_test_name: test,
          p_results: results as unknown as import('@/app/lib/supabase/types').Json,
        })
      } catch { /* best-effort */ }
    }

    return Response.json({ kind: 'imaging', results })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/images' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/images] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

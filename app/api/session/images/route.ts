import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireOwnSession } from '@/app/lib/server/sessionAccess'
import { replayEvents } from '@/app/lib/server/replay'
import { pickECGImage, pickSpecialImage, boundChestImage } from '@/app/lib/server/imageLookup'
import { fetchImagingResults, type OpenIResult } from '@/app/lib/imagingSearch'
import { getSpecialModality } from '@/app/lib/specialImageLookup'
import { caseLaterality, filterByLaterality, type LateralityPolicy } from '@/app/lib/imageAttributes'
import { isECGTest } from '@/app/trainer/_lib/testUtils'
import { createAdminClient } from '@/app/lib/supabase/admin'

const LATERALITY_POLICY: LateralityPolicy =
  process.env.IMAGE_LATERALITY_POLICY === 'lenient' ? 'lenient' : 'strict'

const CHEST_RADIOGRAPH_RE = /\b(chest\s*x-?ray|cxr|chest\s*radiograph|chest\s*film|pa\s*(and|&|\/)?\s*lateral)\b/i
function isChestRadiograph(test: string): boolean {
  return CHEST_RADIOGRAPH_RE.test(test)
}

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
      const { ecg, match } = await pickECGImage(caseData.diagnosis, caseData.ecgFindings)
      return Response.json({ kind: 'ecg', ecg, match })
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
      const { special, match } = await pickSpecialImage(modality, caseData.diagnosis, findingField)
      return Response.json({ kind: 'special', modality, special, match })
    }

    // Image-first chest binding: if this case was authored from a specific local
    // film, serve that exact film for a chest-radiograph order. No laterality
    // filtering needed — the case IS the image (they can't disagree).
    if (caseData.localChestImage && isChestRadiograph(test)) {
      const bound = await boundChestImage(caseData.localChestImage)
      if (bound) {
        return Response.json({ kind: 'imaging', results: [bound], match: { required: 'unknown', status: 'confirmed' } })
      }
    }

    // Radiology imaging — session-level pre-verified cache first, then Open-i.
    // Either way, apply the laterality fail-safe against the case's required
    // side so a "right effusion" case never shows a left-sided film.
    const required = caseLaterality(caseData.imagingCategory, caseData.imagingResults?.[test])
    const captionOf = (r: OpenIResult) => `${r.caption} ${r.abstract ?? ''}`

    const cached = session.imagingCache?.[test] as OpenIResult[] | undefined
    if (Array.isArray(cached) && cached.length > 0) {
      const { items, match } = filterByLaterality(cached, captionOf, required, LATERALITY_POLICY)
      return Response.json({ kind: 'imaging', results: items, match })
    }

    const fetched: OpenIResult[] = await fetchImagingResults({
      orderedTest: test,
      caseDiagnosis: caseData.diagnosis,
      imagingCategory: caseData.imagingCategory,
      baseUrl: req.nextUrl.origin,
    })

    // Write-back the RAW fetch to the shared case cache (best-effort) so future
    // sessions skip the Open-i round trip; laterality filtering is applied per
    // request at serve time, not baked into the cache.
    if (fetched.length > 0 && session.caseId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const db = createAdminClient()
        void db.rpc('cache_imaging_test', {
          p_case_id: session.caseId,
          p_test_name: test,
          p_results: fetched as unknown as import('@/app/lib/supabase/types').Json,
        })
      } catch { /* best-effort */ }
    }

    const { items, match } = filterByLaterality(fetched, captionOf, required, LATERALITY_POLICY)
    return Response.json({ kind: 'imaging', results: items, match })
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/session/images' } })
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/session/images] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

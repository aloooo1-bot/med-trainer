import { useState, useEffect } from 'react'
import type { CaseData } from './types'
import { postSession } from './sessionApi'
import { findResultKey, isECGTest } from './testUtils'
import { withTimeout } from '../../lib/withTimeout'
import { getSpecialModality, type SpecialImage, type SpecialModality } from '../../lib/specialImageLookup'
import type { ECGImage } from '../../lib/ecgImageLookup'
import type { OpenIResult } from '../../lib/imagingSearch'

/**
 * One slot in the ECG cache.
 *
 * `'unavailable'` and `'failed'` are kept apart because they are different
 * facts and want different words on screen: the server can legitimately have no
 * tracing that matches a case without contradicting it (the picker suppresses
 * rather than showing a wrong strip), which is not the same as a request that
 * broke. Collapsing both into one value made the panel tell students their
 * rhythm was missing from the library when the fetch had simply failed.
 *
 * `null` means in flight — and ONLY in flight. It must always settle.
 */
export type EcgSlot = ECGImage | null | 'unavailable' | 'failed'

/**
 * How long a single image request may run before it is treated as failed.
 *
 * Generous, because these can involve an upstream image search. The point is
 * not speed, it is that "loading" must be a temporary claim: an unsettled
 * request left the panel pulsing forever with no machine read to fall back on.
 */
const IMAGE_REQUEST_TIMEOUT_MS = 15_000

/**
 * Image caches for ordered tests (5.1 extraction from trainer/page.tsx).
 * Selection runs SERVER-side (/api/session/images) because it depends on the
 * case diagnosis; the client only routes each returned image into the right
 * panel cache by test name.
 */
export function useSessionImages({
  activeSection,
  caseData,
  sessionId,
  orderedTests,
}: {
  activeSection: string
  caseData: CaseData | null
  sessionId: string | null
  orderedTests: Set<string>
}) {
  const [imagingCache, setImagingCache] = useState<Record<string, OpenIResult[] | null>>({})
  const [ecgCache, setEcgCache] = useState<Record<string, EcgSlot>>({})
  const [smearCache, setSmearCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [biopsyImgCache, setBiopsyImgCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [fundusCache, setFundusCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [dermCache, setDermCache] = useState<Record<string, SpecialImage | null | 'none'>>({})
  const [urineImgCache, setUrineImgCache] = useState<Record<string, SpecialImage | null | 'none'>>({})

  useEffect(() => {
    if (activeSection !== 'results' || !caseData || !sessionId) return
    const orderedArr = Array.from(orderedTests)
    const cacheMap: Record<SpecialModality, {
      cache: Record<string, SpecialImage | null | 'none'>
      setter: React.Dispatch<React.SetStateAction<Record<string, SpecialImage | null | 'none'>>>
    }> = {
      smear: { cache: smearCache, setter: setSmearCache },
      biopsy: { cache: biopsyImgCache, setter: setBiopsyImgCache },
      fundus: { cache: fundusCache, setter: setFundusCache },
      derm: { cache: dermCache, setter: setDermCache },
      urine: { cache: urineImgCache, setter: setUrineImgCache },
    }

    const imagingTests = orderedArr.filter(t => findResultKey(t, caseData.imagingResults) !== null)
    const toFetch = imagingTests.filter(t => {
      if (isECGTest(t)) {
        const slot = ecgCache[t]
        // Retry a previous failure when the student returns to this tab
        // (activeSection is an effect dependency). A deliberate 'unavailable'
        // is final — refetching it would only produce the same answer — and a
        // null is already in flight.
        return slot === undefined || slot === 'failed'
      }
      const m = getSpecialModality(t)
      if (m) return !(t in cacheMap[m].cache)
      return !(t in imagingCache)
    })
    if (toFetch.length === 0) return

    /* eslint-disable react-hooks/set-state-in-effect --
       mark newly-ordered tests as loading before the async fetch resolves */
    for (const t of toFetch) {
      if (isECGTest(t)) setEcgCache(prev => ({ ...prev, [t]: null }))
      else {
        const m = getSpecialModality(t)
        if (m) cacheMap[m].setter(prev => ({ ...prev, [t]: null }))
        else setImagingCache(prev => ({ ...prev, [t]: null }))
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    void Promise.all(
      toFetch.map(async t => {
        try {
          // Bounded: an unsettled request is indistinguishable from a permanent
          // one on screen, and the loading state has no fallback content.
          const data = await withTimeout(
            postSession<{
              kind: 'ecg' | 'special' | 'imaging'
              ecg?: ECGImage | null
              modality?: SpecialModality
              special?: SpecialImage | null
              results?: OpenIResult[]
            }>('/api/session/images', { sessionId, test: t }),
            IMAGE_REQUEST_TIMEOUT_MS,
            `image request for "${t}"`,
          )
          if (data.kind === 'ecg') {
            // The server answered. A null image here is a deliberate
            // suppression — no tracing matches this case without contradicting
            // it — not a failure, and the panel says so differently.
            setEcgCache(prev => ({ ...prev, [t]: data.ecg ?? 'unavailable' }))
          } else if (data.kind === 'special' && data.modality) {
            cacheMap[data.modality].setter(prev => ({ ...prev, [t]: data.special ?? 'none' }))
          } else {
            setImagingCache(prev => ({ ...prev, [t]: data.results ?? [] }))
          }
        } catch {
          // Errored or timed out. Distinct from 'unavailable' so the panel can
          // offer a retry rather than claiming the library lacks this rhythm.
          if (isECGTest(t)) setEcgCache(prev => ({ ...prev, [t]: 'failed' }))
          else {
            const m = getSpecialModality(t)
            if (m) cacheMap[m].setter(prev => ({ ...prev, [t]: 'none' }))
            else setImagingCache(prev => ({ ...prev, [t]: [] }))
          }
        }
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, caseData, sessionId])

  const resetImages = () => {
    setImagingCache({})
    setEcgCache({})
    setSmearCache({})
    setBiopsyImgCache({})
    setFundusCache({})
    setDermCache({})
    setUrineImgCache({})
  }

  return {
    imagingCache, ecgCache, smearCache, biopsyImgCache, fundusCache, dermCache, urineImgCache,
    resetImages,
  }
}

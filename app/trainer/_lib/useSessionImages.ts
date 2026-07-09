import { useState, useEffect } from 'react'
import type { CaseData } from './types'
import { postSession } from './sessionApi'
import { findResultKey, isECGTest } from './testUtils'
import { getSpecialModality, type SpecialImage, type SpecialModality } from '../../lib/specialImageLookup'
import type { ECGImage } from '../../lib/ecgImageLookup'
import type { OpenIResult } from '../../lib/imagingSearch'

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
  const [ecgCache, setEcgCache] = useState<Record<string, ECGImage | null | 'none'>>({})
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
      if (isECGTest(t)) return !(t in ecgCache)
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
          const data = await postSession<{
            kind: 'ecg' | 'special' | 'imaging'
            ecg?: ECGImage | null
            modality?: SpecialModality
            special?: SpecialImage | null
            results?: OpenIResult[]
          }>('/api/session/images', { sessionId, test: t })
          if (data.kind === 'ecg') {
            setEcgCache(prev => ({ ...prev, [t]: data.ecg ?? 'none' }))
          } else if (data.kind === 'special' && data.modality) {
            cacheMap[data.modality].setter(prev => ({ ...prev, [t]: data.special ?? 'none' }))
          } else {
            setImagingCache(prev => ({ ...prev, [t]: data.results ?? [] }))
          }
        } catch {
          if (isECGTest(t)) setEcgCache(prev => ({ ...prev, [t]: 'none' }))
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

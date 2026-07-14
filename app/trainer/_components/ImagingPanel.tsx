import { useState, useEffect } from 'react'
import type { OpenIResult } from '@/app/lib/imagingSearch'

export function ImagingPanel({ report, results, diagnosisSubmitted }: {
  report: string
  results: OpenIResult[] | null
  diagnosisSubmitted: boolean
}) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    // Reset image selection/error when a new imaging result set is shown.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIdx(0)
    setImgError(false)
  }, [results])

  if (results === null) {
    return (
      <div className="bg-surface-1 px-4 py-5">
        <div className="mb-4 flex h-48 items-center justify-center rounded bg-surface-2 text-xs text-ink-tertiary animate-pulse">
          Loading imaging…
        </div>
        {diagnosisSubmitted && <p className="text-sm leading-relaxed text-ink-secondary">{report}</p>}
      </div>
    )
  }

  const nextIdx = (selectedIdx + 1) % results.length
  const selected = results[selectedIdx]

  if (!selected || imgError) {
    const noImagesFound = results.length === 0
    const canTryNext = results.length > 1
    return (
      <div className="bg-surface-1 px-4 py-4">
        {noImagesFound ? (
          <>
            <p className="mb-3 text-xs italic text-ink-tertiary">No image confirmed to match this case&apos;s findings is available for this study — the report below is authoritative.</p>
            <p className="text-sm leading-relaxed text-ink-secondary">{report}</p>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-3">
              <p className="text-xs italic text-ink-tertiary">Image failed to load.</p>
              {canTryNext && (
                <button
                  onClick={() => { setSelectedIdx(nextIdx); setImgError(false) }}
                  className="text-xs text-primary-400 hover:text-primary-400 transition-colors"
                >
                  Try next image →
                </button>
              )}
            </div>
            <p className="text-sm leading-relaxed text-ink-secondary">{report}</p>
          </>
        )}
      </div>
    )
  }

  const others = results.filter((_, i) => i !== selectedIdx).slice(0, 4)

  return (
    <div className="bg-surface-1 px-4 py-4 space-y-3">
      <div className="overflow-hidden rounded bg-black">
        <img
          src={selected.imageUrl}
          alt={selected.caption}
          className="w-full max-h-96 object-contain"
          onError={() => setImgError(true)}
        />
      </div>
      {others.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-1">
          {others.map(img => (
            <button
              key={img.uid}
              onClick={() => { setSelectedIdx(results.indexOf(img)); setImgError(false) }}
              className="h-14 w-14 flex-shrink-0 overflow-hidden rounded border border-surface-4 bg-black transition-colors hover:border-primary-400"
            >
              <img src={img.thumbnailUrl} alt={img.caption} className="h-full w-full object-cover opacity-70 transition-opacity hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-ink-tertiary">
        <div className="flex items-center gap-3">
          {selected.agentVerified ? (
            <span className="flex items-center gap-1.5">
              <span className="rounded border border-confirmed-border bg-confirmed-bg px-1.5 py-0.5 text-confirmed">
                AI Verified
              </span>
              <span className="text-ink-tertiary">NIH Open-i / NLM — image verified for this case</span>
            </span>
          ) : (
            <span>NIH Open-i / NLM — representative image; findings may vary from this case</span>
          )}
          <a
            href={`https://openi.nlm.nih.gov/detailedresult?img=${selected.uid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 transition-colors hover:text-primary-400"
          >
            View source ↗
          </a>
        </div>
        {results.length > 1 && (
          <button
            onClick={() => { setSelectedIdx(nextIdx); setImgError(false) }}
            className="text-ink-tertiary hover:text-primary-400 transition-colors"
          >
            {selectedIdx + 1}/{results.length} — Try next →
          </button>
        )}
      </div>
      {diagnosisSubmitted ? (
        <p className="border-t border-surface-4 pt-3 text-sm leading-relaxed text-ink-secondary">{report}</p>
      ) : (
        <p className="border-t border-surface-4 pt-3 text-xs text-ink-tertiary italic">Radiology report available after you submit your diagnosis.</p>
      )}
    </div>
  )
}

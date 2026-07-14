import { useState } from 'react'
import type { SpecialImage, SpecialModality } from '@/app/lib/specialImageLookup'

export const SPECIAL_LABELS: Record<SpecialModality, string> = {
  smear:  'Peripheral Blood Smear',
  biopsy: 'H&E Biopsy',
  fundus: 'Fundoscopy',
  derm:   'Dermoscopy',
  urine:  'Urine Microscopy',
}

export function SpecialPanel({ modality, report, image, findings, onZoom }: {
  modality: SpecialModality
  report: string
  image: SpecialImage | null | 'none'
  findings?: string
  onZoom?: (src: string, alt: string) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const displayText = findings ?? report

  if (image === null) {
    return (
      <div className="bg-surface-1 px-4 py-5">
        <div className="mb-4 flex h-48 items-center justify-center rounded bg-surface-2 text-xs text-ink-tertiary animate-pulse">
          Loading {SPECIAL_LABELS[modality]} image…
        </div>
        <p className="text-sm leading-relaxed text-ink-secondary">{displayText}</p>
      </div>
    )
  }

  if (image === 'none') {
    return (
      <div className="bg-surface-1 px-4 py-4 space-y-2">
        <p className="text-sm leading-relaxed text-ink-secondary">{displayText}</p>
        <p className="text-xs italic text-ink-tertiary">
          No image confirmed to match this case is available — use the report above to guide your reasoning.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 px-4 py-4 space-y-3">
      <div
        className="overflow-hidden rounded border border-surface-4 bg-black cursor-zoom-in"
        onClick={() => onZoom?.(image.path, image.label || SPECIAL_LABELS[modality])}
        title="Click to enlarge"
      >
        <img
          src={image.path}
          alt={image.label || SPECIAL_LABELS[modality]}
          className="w-full max-h-[400px] object-contain"
        />
      </div>
      <div className="space-y-2">
        {image.source && (
          <button
            className="text-xs text-ink-tertiary hover:text-ink-secondary transition-colors underline underline-offset-2"
            onClick={() => setSourceOpen(v => !v)}
          >
            {sourceOpen ? 'Hide' : 'View'} source attribution ↕
          </button>
        )}
        {sourceOpen && image.source && (
          <p className="text-xs leading-relaxed text-ink-tertiary italic border-l-2 border-surface-4 pl-3">
            {image.source}
          </p>
        )}
      </div>
      <p className="border-t border-surface-4 pt-3 text-sm leading-relaxed text-ink-secondary">{displayText}</p>
    </div>
  )
}

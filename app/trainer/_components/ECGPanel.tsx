import { useState } from 'react'
import type { ECGImage } from '@/app/lib/ecgImageLookup'

export function ECGPanel({ ecgFindings, aiReport, image, diagnosisSubmitted, onZoom }: {
  ecgFindings?: string
  aiReport: string
  image: ECGImage | null | 'none'
  diagnosisSubmitted: boolean
  onZoom?: (src: string, alt: string) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const machineRead = ecgFindings ?? aiReport

  if (image === null) {
    return (
      <div className="bg-surface-1 px-4 py-5">
        <div className="mb-4 flex h-48 items-center justify-center rounded bg-surface-2 text-xs text-ink-tertiary animate-pulse">
          Loading ECG…
        </div>
        {diagnosisSubmitted && <p className="text-sm leading-relaxed text-ink-secondary">{machineRead}</p>}
      </div>
    )
  }

  if (image === 'none') {
    return (
      <div className="bg-surface-1 px-4 py-4 space-y-2">
        <p className="text-sm leading-relaxed text-ink-secondary">{machineRead}</p>
        <p className="text-xs italic text-ink-tertiary">
          Reference ECG image for this rhythm pattern is not yet in our library. Use the interpretation above to guide your reasoning.
        </p>
      </div>
    )
  }

  const isStemi = image.path.includes('/stemi/')
  return (
    <div className="bg-surface-1 px-4 py-4 space-y-3">
      <div
        className="overflow-hidden rounded border border-surface-4 cursor-zoom-in"
        onClick={() => onZoom?.(image.path, '12-lead ECG')}
        title="Click to enlarge"
      >
        <img
          src={image.path}
          alt="12-lead ECG"
          className="w-full max-h-[420px] object-contain bg-surface-2"
        />
      </div>
      {!diagnosisSubmitted ? (
        <p className="text-sm italic text-ink-tertiary">
          Interpret the ECG yourself. The machine read and clinical interpretation will appear after you submit your diagnosis.
        </p>
      ) : (
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Machine Read</p>
          <p className="text-sm leading-relaxed text-ink-secondary">{machineRead}</p>
        </div>
        <p className="text-xs text-caution italic">
          Note: this ECG is a representative tracing from the PTB-XL public dataset, selected by category. The specific leads, acuity, or morphology shown may not exactly match the findings described in this case&rsquo;s report. Trust the report above as the authoritative ground truth.
        </p>
        {isStemi && (
          <p className="text-xs text-caution italic">
            STEMI specifically: PTB-XL recordings vary in acuity — some represent chronic or old MI patterns rather than hyperacute changes.
          </p>
        )}
        {image.report && (
          <div>
            <button
              className="text-xs text-ink-tertiary hover:text-ink-secondary transition-colors underline underline-offset-2"
              onClick={() => setSourceOpen(v => !v)}
            >
              {sourceOpen ? 'Hide' : 'View'} original cardiologist report ↕
            </button>
            {sourceOpen && (
              <p className="mt-1 text-xs leading-relaxed text-ink-tertiary italic border-l-2 border-surface-4 pl-3">
                PTB-XL dataset report (original language preserved — may be German, Portuguese, or English): {image.report}
              </p>
            )}
          </div>
        )}
      </div>
      )}
      <div className="text-xs text-ink-tertiary border-t border-surface-4 pt-2">
        ECG image from{' '}
        <a
          href="https://physionet.org/content/ptb-xl/1.0.3/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-tertiary hover:text-ink-secondary transition-colors underline"
        >
          PTB-XL dataset (PhysioNet)
        </a>
        . Used for educational purposes.
      </div>
    </div>
  )
}

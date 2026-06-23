'use client'

import { useState } from 'react'

/**
 * The "Why" layer: a collapsible pathophysiology explanation shown in the
 * scorecard after a case. Renders nothing for cases generated before the
 * mechanism field existed.
 */
export function WhyPanel({ mechanism }: { mechanism?: string }) {
  const [open, setOpen] = useState(false)
  if (!mechanism) return null

  return (
    <div className="rounded-md border border-surface-4 bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary hover:text-ink-secondary transition-colors"
        aria-expanded={open}
      >
        <span>Why? — mechanism</span>
        <span className="text-ink-tertiary">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <p className="px-3 pb-3 text-[12px] leading-relaxed text-ink-secondary">{mechanism}</p>
      )}
    </div>
  )
}

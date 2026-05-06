'use client'

import { useEffect } from 'react'
import '@/app/dashboard.css'

export default function Modal({
  open,
  onClose,
  children,
  ariaLabel,
  maxWidth = 520,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  ariaLabel: string
  maxWidth?: number
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="dx-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dx-modal-panel" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  )
}

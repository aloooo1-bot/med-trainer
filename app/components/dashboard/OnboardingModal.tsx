'use client'

import { useState } from 'react'
import Modal from './Modal'
import '@/app/dashboard.css'

const ONBOARDING_DISMISSED_KEY = 'medtrainer_onboarding_dismissed'

const STEPS = [
  {
    icon: '🩺',
    title: 'Interview your patient',
    body: 'Start by taking a history. Ask about the chief complaint, relevant symptoms, past medical history, medications, and social history. Every question you ask is tracked.',
  },
  {
    icon: '🔬',
    title: 'Examine & order tests',
    body: 'Order labs and imaging to narrow your differential. Unnecessary or missing tests affect your score — think before you order.',
  },
  {
    icon: '📊',
    title: 'Submit your diagnosis & get graded',
    body: 'Submit your leading diagnosis. You\'re graded across 4–5 dimensions: History, Testing, Accuracy, Completeness, and Reasoning — out of 100 points.',
  },
]

const GUIDED_CASE_URL =
  '/trainer?system=Respiratory&difficulty=Foundations&diagnosis=Community-Acquired%20Pneumonia'

export default function OnboardingModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState(0)

  function dismiss() {
    try { localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1') } catch {}
    onClose()
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }

  function prev() {
    if (step > 0) setStep(s => s - 1)
  }

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <Modal open={open} onClose={dismiss} ariaLabel="Welcome to MedTrainer" maxWidth={460}>
      <div className="dx-modal-header">
        <span className="dx-modal-title">Welcome to MedTrainer</span>
        <button className="dx-modal-close" onClick={dismiss} aria-label="Close onboarding" title="Close">×</button>
      </div>

      <div className="dx-modal-body">
        {/* Step indicators */}
        <div className="dx-onboarding-steps">
          {STEPS.map((_, i) => (
            <div key={i} className={`dx-onboarding-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>

        {/* Step content */}
        <div className="dx-onboarding-icon">{current.icon}</div>
        <h2 className="dx-onboarding-step-title">{current.title}</h2>
        <p className="dx-onboarding-step-body">{current.body}</p>
      </div>

      <div className="dx-modal-footer" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button className="dx-btn-secondary" onClick={prev}>← Back</button>
          )}
          <button
            className="dx-chip"
            onClick={dismiss}
            style={{ fontSize: 12, color: 'var(--muted)' }}
          >
            Skip
          </button>
        </div>

        {isLast ? (
          <a
            href={GUIDED_CASE_URL}
            className="dx-btn-primary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={dismiss}
          >
            Start guided case →
          </a>
        ) : (
          <button className="dx-btn-primary" onClick={next}>
            Next →
          </button>
        )}
      </div>
    </Modal>
  )
}

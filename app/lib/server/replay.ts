import 'server-only'
import type { SessionEvent } from './sessionStore'
import type { ROSCategory } from '../rosDetector'
import type { HPIField } from '../rosDetector'
import type { GradingResult } from '../../grading/types'

/**
 * Rebuild the authoritative view of a session from its event log.
 * Used by grading (the log — not the client — decides what was elicited)
 * and by session resume after a page refresh.
 */

export interface AskEventPayload {
  message: string
  reply: string
  rosUnlocks?: Array<{ category: ROSCategory; derivedFinding: string }>
  hpiUnlocks?: Partial<Record<HPIField, string>>
}

export interface ReplayedState {
  chat: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Cumulative chat-derived finding per unlocked ROS category. */
  ros: Partial<Record<ROSCategory, { derivedFinding: string }>>
  /** Unlocked HPI background fields with their revealed values. */
  hpi: Partial<Record<HPIField, string>>
  /** Exam regions performed, in order, with findings. */
  exams: Array<{ region: string; finding: string }>
  orderedTests: string[]
  prediction: { ranking: string[]; confidence: number | null } | null
  enteredPresentationAt: string | null
  gradingResult: GradingResult | null
  submittedDiagnosis: string | null
}

export function replayEvents(events: SessionEvent[]): ReplayedState {
  const state: ReplayedState = {
    chat: [],
    ros: {},
    hpi: {},
    exams: [],
    orderedTests: [],
    prediction: null,
    enteredPresentationAt: null,
    gradingResult: null,
    submittedDiagnosis: null,
  }
  const orderedSet = new Set<string>()

  for (const ev of events) {
    switch (ev.type) {
      case 'ask': {
        const p = ev.payload as unknown as AskEventPayload
        state.chat.push({ role: 'user', content: p.message })
        state.chat.push({ role: 'assistant', content: p.reply })
        for (const u of p.rosUnlocks ?? []) {
          state.ros[u.category] = { derivedFinding: u.derivedFinding }
        }
        for (const [field, value] of Object.entries(p.hpiUnlocks ?? {})) {
          state.hpi[field as HPIField] = value
        }
        break
      }
      case 'exam': {
        const { region, finding } = ev.payload as { region: string; finding: string }
        if (!state.exams.some(e => e.region === region)) state.exams.push({ region, finding })
        break
      }
      case 'order': {
        const { tests } = ev.payload as { tests: string[] }
        for (const t of tests ?? []) {
          if (!orderedSet.has(t)) { orderedSet.add(t); state.orderedTests.push(t) }
        }
        break
      }
      case 'prediction': {
        const { ranking, confidence } = ev.payload as { ranking: string[]; confidence: number | null }
        state.prediction = { ranking, confidence: confidence ?? null }
        break
      }
      case 'enter_presentation': {
        state.enteredPresentationAt = ev.ts
        break
      }
      case 'submit': {
        const { result, diagnosis } = ev.payload as { result?: GradingResult; diagnosis?: string }
        if (result) state.gradingResult = result
        if (diagnosis) state.submittedDiagnosis = diagnosis
        break
      }
    }
  }
  return state
}

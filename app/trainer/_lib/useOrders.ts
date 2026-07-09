import { useState } from 'react'
import type { CaseData } from './types'
import type { OrderResponse, UsageEntry } from './sessionTypes'
import { postSession, mergeOrderResult } from './sessionApi'

/**
 * Test-ordering state + server sync (5.1 extraction from trainer/page.tsx).
 * Results come back from the server-side case snapshot; the client never
 * holds unordered results.
 */
export function useOrders({
  sessionId,
  recordUsages,
  setCaseData,
}: {
  sessionId: string | null
  recordUsages: (usages: UsageEntry[] | undefined) => void
  setCaseData: React.Dispatch<React.SetStateAction<CaseData | null>>
}) {
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set())
  const [orderedTests, setOrderedTests] = useState<Set<string>>(new Set())
  const [generatingOnDemand, setGeneratingOnDemand] = useState<Set<string>>(new Set())
  const [failedOnDemand, setFailedOnDemand] = useState<Set<string>>(new Set())
  // Free-typed orders whose fuzzy match was contested — the student confirms
  // the canonical name instead of being silently penalized (4.3).
  const [ambiguousOrders, setAmbiguousOrders] = useState<Record<string, string[]>>({})

  /**
   * Submit test orders to the server session. Missing results are generated
   * on demand server-side; contested fuzzy matches come back as suggestions.
   * `retry` re-processes an already-ordered test whose on-demand generation
   * failed (the server skips duplicate event logging).
   */
  const submitOrders = async (tests: string[], opts: { retry?: boolean } = {}) => {
    if (!sessionId) return
    const newTests = opts.retry
      ? tests.filter(t => t.trim())
      : tests.filter(t => t.trim() && !orderedTests.has(t))
    if (newTests.length === 0) return
    if (opts.retry) {
      setFailedOnDemand(prev => { const n = new Set(prev); newTests.forEach(t => n.delete(t)); return n })
    }
    setOrderedTests(prev => new Set([...prev, ...newTests]))
    setGeneratingOnDemand(prev => new Set([...prev, ...newTests]))
    try {
      const data = await postSession<OrderResponse>('/api/session/order', { sessionId, tests: newTests, retry: !!opts.retry })
      recordUsages(data.usages)
      setCaseData(prev => {
        if (!prev) return prev
        let next = prev
        for (const r of data.results) next = mergeOrderResult(next, r)
        return next
      })
      const failed = data.results.filter(r => r.kind === 'none').map(r => r.test)
      if (failed.length) setFailedOnDemand(prev => new Set([...prev, ...failed]))
      const ambiguous = data.results.filter(r => r.kind === 'ambiguous' && r.suggestions?.length)
      if (ambiguous.length) {
        setAmbiguousOrders(prev => ({
          ...prev,
          ...Object.fromEntries(ambiguous.map(r => [r.test, r.suggestions!])),
        }))
      }
    } catch (e) {
      console.error('[MedTrainer] order failed:', e)
      setFailedOnDemand(prev => new Set([...prev, ...newTests]))
    } finally {
      setGeneratingOnDemand(prev => {
        const n = new Set(prev)
        newTests.forEach(t => n.delete(t))
        return n
      })
    }
  }

  const toggleTest = (name: string) => {
    setSelectedTests(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const addOrderedTest = (name: string) => {
    void submitOrders([name])
  }

  const removeOrderedTest = (name: string) => {
    // Local view only — the server event log keeps the order on record, so
    // grading still counts it (you can't un-ring the bell).
    setOrderedTests(prev => { const next = new Set(prev); next.delete(name); return next })
  }

  const confirmAmbiguous = (typed: string, canonical: string) => {
    setAmbiguousOrders(prev => { const n = { ...prev }; delete n[typed]; return n })
    setOrderedTests(prev => { const n = new Set(prev); n.delete(typed); return n })
    void submitOrders([canonical])
  }

  const dismissAmbiguous = (typed: string) => {
    // Keep the typed order as-is; grading treats it as neutral.
    setAmbiguousOrders(prev => { const n = { ...prev }; delete n[typed]; return n })
    setFailedOnDemand(prev => new Set([...prev, typed]))
  }

  const resetOrders = () => {
    setSelectedTests(new Set())
    setOrderedTests(new Set())
    setGeneratingOnDemand(new Set())
    setFailedOnDemand(new Set())
    setAmbiguousOrders({})
  }

  const restoreOrders = (tests: string[], ambiguous: Record<string, string[]>) => {
    setOrderedTests(new Set(tests))
    setAmbiguousOrders(ambiguous)
  }

  return {
    selectedTests, setSelectedTests,
    orderedTests,
    generatingOnDemand, failedOnDemand, setFailedOnDemand,
    ambiguousOrders,
    submitOrders, toggleTest, addOrderedTest, removeOrderedTest,
    confirmAmbiguous, dismissAmbiguous,
    resetOrders, restoreOrders,
  }
}

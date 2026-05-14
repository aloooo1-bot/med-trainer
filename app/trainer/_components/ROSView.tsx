import { ROS_CATEGORIES, type ROSState } from '@/app/lib/rosDetector'
import { SectionCard } from './SectionCard'
import type { CaseData } from '../_lib/types'
import type { GradingResult } from '@/app/grading/types'

export function ROSView({ caseData, caseDifficulty, rosState, gradingResult }: {
  caseData: CaseData
  caseDifficulty: string
  rosState: ROSState
  gradingResult: GradingResult | null
}) {
  const isGatedDifficulty = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'

  if (isGatedDifficulty) {
    const unlockedCount = ROS_CATEGORIES.filter(c => rosState[c].status !== 'locked').length
    return (
      <SectionCard title="Review of Systems">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-ink-tertiary">
            {unlockedCount} / {ROS_CATEGORIES.length} systems reviewed
          </span>
          {unlockedCount === 0 && (
            <span className="text-xs text-ink-tertiary italic">Ask the patient about each system to reveal findings</span>
          )}
        </div>
        <div className="space-y-1.5">
          {ROS_CATEGORIES.map(cat => {
            const entry = rosState[cat]
            const isLocked = entry.status === 'locked'
            const isPositive = entry.status === 'positive'
            return (
              <div
                key={cat}
                className={`flex gap-3 rounded-md px-3 py-2.5 ${
                  isLocked
                    ? 'bg-surface-1/40'
                    : isPositive
                    ? 'bg-caution-bg border border-caution-border'
                    : 'bg-surface-1'
                }`}
              >
                <span className={`w-44 flex-shrink-0 text-xs font-semibold uppercase tracking-wide pt-0.5 ${
                  isLocked ? 'text-ink-tertiary' : isPositive ? 'text-caution' : 'text-primary-400'
                }`}>
                  {cat}
                </span>
                {isLocked ? (
                  <span className="text-ink-tertiary text-sm select-none">—</span>
                ) : entry.derivedFinding === undefined ? (
                  <span className="text-xs text-ink-tertiary italic">Recording…</span>
                ) : !gradingResult ? (
                  <span className={`text-sm leading-relaxed ${isPositive ? 'text-caution' : 'text-ink-secondary'}`}>
                    {entry.derivedFinding}
                  </span>
                ) : (
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className={`text-sm leading-relaxed ${isPositive ? 'text-caution' : 'text-ink-secondary'}`}>
                      {entry.derivedFinding}
                    </span>
                    <span className="text-xs text-ink-tertiary italic leading-relaxed">
                      <span className="not-italic text-ink-tertiary uppercase tracking-wide mr-1">Full:</span>
                      {entry.finding}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Review of Systems">
      <div className="space-y-1.5">
        {Object.entries(caseData.reviewOfSystems).map(([cat, findings]) => (
          <div key={cat} className="flex gap-3 rounded-md bg-surface-1 px-3 py-2.5">
            <span className="w-44 flex-shrink-0 text-xs font-semibold text-primary-400 uppercase tracking-wide pt-0.5">{cat}</span>
            <span className="text-sm text-ink-secondary">{findings}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

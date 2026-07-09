import { SectionCard } from './SectionCard'
import type { CaseData } from '../_lib/types'

export function ExamView({
  caseData,
  caseDifficulty,
  examGated,
  revealedExamRegions,
  revealExamRegion,
}: {
  caseData: CaseData
  caseDifficulty: string
  /** Server-decided: whether the exam is click-to-reveal for this case. */
  examGated: boolean
  revealedExamRegions?: Set<string>
  revealExamRegion?: (region: string) => void
}) {
  const isGated = examGated

  if (!isGated || !revealedExamRegions || !revealExamRegion) {
    return (
      <SectionCard title="Physical Examination">
        <div className="space-y-3">
          {Object.entries(caseData.physicalExam).map(([system, findings]) => (
            <div key={system} className="flex gap-3 rounded-md bg-surface-1 p-3">
              <span className="w-36 flex-shrink-0 text-xs font-semibold text-primary-400 uppercase tracking-wide pt-0.5">{system}</span>
              <span className="text-sm text-ink-secondary">{findings}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  const revealedCount = revealedExamRegions.size
  const totalRegions = Object.keys(caseData.physicalExam).length

  return (
    <SectionCard title="Physical Examination">
      <div className="mb-3 rounded-md border border-primary-200 bg-primary-50 px-4 py-2.5">
        <p className="text-xs text-primary-700">
          <span className="font-semibold">{caseDifficulty} difficulty:</span> click a region to examine it. You are graded on examining relevant areas and avoiding irrelevant ones.
          {revealedCount > 0 && <span className="ml-2 text-primary-500">{revealedCount}/{totalRegions} examined</span>}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.entries(caseData.physicalExam).map(([system, findings]) => {
          const isRevealed = revealedExamRegions.has(system)
          return (
            <div key={system}>
              {isRevealed ? (
                <div className="flex gap-3 rounded-md border border-confirmed-border bg-confirmed-bg p-3">
                  <div className="flex w-36 flex-shrink-0 flex-col gap-0.5 pt-0.5">
                    <span className="text-xs font-semibold text-primary-400 uppercase tracking-wide">{system}</span>
                    <span className="text-[10px] text-confirmed">examined ✓</span>
                  </div>
                  <span className="text-sm text-ink-secondary">{findings}</span>
                </div>
              ) : (
                <button
                  onClick={() => revealExamRegion(system)}
                  className="w-full flex items-center gap-3 rounded-md border border-surface-4 bg-surface-1 p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 cursor-pointer"
                >
                  <span className="w-36 flex-shrink-0 text-xs font-semibold text-primary-400 uppercase tracking-wide">{system}</span>
                  <span className="text-sm text-ink-tertiary italic">Click to examine</span>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

import { SectionCard } from './SectionCard'
import type { CaseData } from '../_lib/types'

export function ExamView({ caseData }: { caseData: CaseData }) {
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

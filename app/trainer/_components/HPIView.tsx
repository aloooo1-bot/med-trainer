import { type HPIField } from '@/app/lib/rosDetector'
import { SectionCard } from './SectionCard'
import { selectHpi, type CaseData } from '../_lib/types'

export function HPIView({ caseData, caseDifficulty, hpiUnlocked, caseStarted, startTimer, setCaseStarted, chatInputRef }: {
  caseData: CaseData
  caseDifficulty: string
  hpiUnlocked: Record<HPIField, boolean>
  caseStarted: boolean
  startTimer: (difficulty: string) => void
  setCaseStarted: React.Dispatch<React.SetStateAction<boolean>>
  chatInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const isGatedHPI = caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced'

  const bgGroups = [
    {
      key: 'pmh', label: 'Past Medical History',
      fields: [
        { field: 'pmh_conditions' as HPIField, label: 'Conditions', value: caseData.pastMedicalHistory?.conditions },
        { field: 'pmh_surgeries' as HPIField, label: 'Surgeries', value: caseData.pastMedicalHistory?.surgeries },
        { field: 'pmh_hospitalizations' as HPIField, label: 'Hospitalizations', value: caseData.pastMedicalHistory?.hospitalizations },
      ],
    },
    {
      key: 'med', label: 'Current Medications',
      fields: [
        { field: 'med_medications' as HPIField, label: 'Rx', value: caseData.currentMedications?.medications },
        { field: 'med_otc' as HPIField, label: 'OTC / Supplements', value: caseData.currentMedications?.otc },
      ],
    },
    {
      key: 'soc', label: 'Social History',
      fields: [
        { field: 'soc_smoking' as HPIField, label: 'Smoking', value: caseData.socialHistory?.smoking },
        { field: 'soc_alcohol' as HPIField, label: 'Alcohol', value: caseData.socialHistory?.alcohol },
        { field: 'soc_drugs' as HPIField, label: 'Drugs', value: caseData.socialHistory?.drugs },
        { field: 'soc_occupation' as HPIField, label: 'Occupation', value: caseData.socialHistory?.occupation },
        { field: 'soc_living' as HPIField, label: 'Living', value: caseData.socialHistory?.living },
        { field: 'soc_other' as HPIField, label: 'Other', value: caseData.socialHistory?.other },
      ],
    },
  ]
  const totalBgFields = bgGroups.reduce((s, g) => s + g.fields.length, 0)
  const unlockedHPICount = isGatedHPI
    ? Object.values(hpiUnlocked).filter(Boolean).length
    : totalBgFields

  return (
    <div className="space-y-4">
      {!caseStarted && (caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') && (
        <div className="rounded-lg border border-insight-border bg-insight-bg px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-insight">
              Timer not started — {caseDifficulty === 'Clinical' ? '22 minutes' : '15 minutes'} allotted
            </p>
            <p className="text-[11px] text-insight/70 mt-0.5">Read the case first. Start the timer when you are ready to begin the clinical encounter.</p>
          </div>
          <button
            onClick={() => { startTimer(caseDifficulty); setCaseStarted(true); setTimeout(() => chatInputRef.current?.focus(), 50) }}
            className="flex-shrink-0 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-primary-400 transition-colors"
          >
            Start Timer
          </button>
        </div>
      )}
      <SectionCard title="History of Present Illness">
        <p className="font-serif text-[15px] leading-relaxed text-ink-primary max-w-[70ch]">{selectHpi(caseData, caseDifficulty)}</p>
      </SectionCard>
      {(caseData.pastMedicalHistory || caseData.currentMedications || caseData.socialHistory) && (
        <SectionCard title="Background History">
          {isGatedHPI && (
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-ink-tertiary">{unlockedHPICount} / {totalBgFields} background fields reviewed</span>
              {unlockedHPICount === 0 && (
                <span className="text-xs text-ink-tertiary italic">Ask the patient about their history to reveal fields</span>
              )}
            </div>
          )}
          <div className="space-y-3">
            {bgGroups.map(({ key, label, fields }) => (
              <div key={key} className="rounded-md bg-surface-2 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-400 mb-2">{label}</div>
                <div className="space-y-1.5">
                  {fields.map(({ field, label: fLabel, value }) => {
                    const unlocked = !isGatedHPI || hpiUnlocked[field]
                    return (
                      <div key={field} className="flex gap-2">
                        <span className="text-[11px] text-ink-tertiary uppercase tracking-wide w-32 flex-shrink-0 pt-0.5">{fLabel}</span>
                        {unlocked ? (
                          <span className="text-[13px] text-ink-primary">{value ?? 'None documented.'}</span>
                        ) : (
                          <span className="text-ink-tertiary/40 text-sm select-none">—</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

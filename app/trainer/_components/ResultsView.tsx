import { getSpecialModality, type SpecialImage, type SpecialModality } from '@/app/lib/specialImageLookup'
import { type OpenIResult } from '@/app/lib/imagingSearch'
import { type ECGImage } from '@/app/lib/ecgImageLookup'
import { SectionCard } from './SectionCard'
import { DifferentialBoard } from './DifferentialBoard'
import { ECGPanel } from './ECGPanel'
import { ImagingPanel } from './ImagingPanel'
import { SpecialPanel, SPECIAL_LABELS } from './SpecialPanel'
import { isPendingTest, pendingHours } from '../_lib/pendingTests'
import { findResultKey, getPanelSummary, parseDirection, isECGTest } from '../_lib/testUtils'
import type { CaseData } from '../_lib/types'
import type { GradingResult } from '@/app/grading/types'

export function ResultsView({
  caseData, caseDifficulty, orderedTests, imagingCache, ecgCache,
  smearCache, biopsyImgCache, fundusCache, dermCache, urineImgCache,
  collapsedPanels, setCollapsedPanels,
  generatingOnDemand, failedOnDemand,
  ambiguousOrders, onConfirmAmbiguous, onDismissAmbiguous,
  gradingResult, setZoomedImage, setActiveSection, onRetryFailed,
}: {
  caseData: CaseData
  caseDifficulty: string
  orderedTests: Set<string>
  imagingCache: Record<string, OpenIResult[] | null>
  ecgCache: Record<string, ECGImage | null | 'none'>
  smearCache: Record<string, SpecialImage | null | 'none'>
  biopsyImgCache: Record<string, SpecialImage | null | 'none'>
  fundusCache: Record<string, SpecialImage | null | 'none'>
  dermCache: Record<string, SpecialImage | null | 'none'>
  urineImgCache: Record<string, SpecialImage | null | 'none'>
  collapsedPanels: Set<string>
  setCollapsedPanels: React.Dispatch<React.SetStateAction<Set<string>>>
  generatingOnDemand: Set<string>
  failedOnDemand: Set<string>
  setFailedOnDemand: React.Dispatch<React.SetStateAction<Set<string>>>
  /** Free-typed orders awaiting canonical-name confirmation (4.3). */
  ambiguousOrders: Record<string, string[]>
  onConfirmAmbiguous: (typed: string, canonical: string) => void
  onDismissAmbiguous: (typed: string) => void
  gradingResult: GradingResult | null
  setZoomedImage: React.Dispatch<React.SetStateAction<{ src: string; alt: string } | null>>
  setActiveSection: React.Dispatch<React.SetStateAction<string>>
  onRetryFailed: (t: string) => void
}) {
  const orderedArr = Array.from(orderedTests)
  const orderedLabs = orderedArr.filter(t => findResultKey(t, caseData.labResults) !== null)
  const orderedImaging = orderedArr.filter(t => findResultKey(t, caseData.imagingResults) !== null)
  const orderedProcedures = orderedArr.filter(t =>
    caseData.procedureResults != null && findResultKey(t, caseData.procedureResults) !== null
  )
  const pendingLabs = orderedArr.filter(t =>
    findResultKey(t, caseData.labResults) === null &&
    findResultKey(t, caseData.imagingResults) === null &&
    (caseData.procedureResults == null || findResultKey(t, caseData.procedureResults) === null) &&
    isPendingTest(t)
  )
  const loadingOnDemand = orderedArr.filter(t => generatingOnDemand.has(t))
  const diagnosisSubmitted = !!gradingResult

  orderedArr.forEach(t => {
    if (findResultKey(t, caseData.labResults) === null &&
        findResultKey(t, caseData.imagingResults) === null &&
        (caseData.procedureResults == null || findResultKey(t, caseData.procedureResults) === null) &&
        !isPendingTest(t) &&
        !generatingOnDemand.has(t) &&
        !failedOnDemand.has(t) &&
        !(t in ambiguousOrders)) {
      console.error(`[MedTrainer] No result found for ordered test: "${t}" (not in labResults, imagingResults, procedureResults, pendingTests, or generatingOnDemand)`)
    }
  })

  const allResultPanels = [...orderedLabs, ...orderedImaging, ...orderedProcedures]
  const allCollapsed = allResultPanels.length > 0 && allResultPanels.every(p => collapsedPanels.has(p))
  const toggleAllPanels = () => {
    setCollapsedPanels(allCollapsed ? new Set() : new Set(allResultPanels))
  }
  const togglePanel = (name: string) => {
    setCollapsedPanels(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  if (orderedTests.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-ink-tertiary">
        <svg className="mb-3 h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm">No tests ordered yet.</p>
        <button onClick={() => setActiveSection('order')} className="mt-2 text-sm text-primary-400 hover:text-primary-300">
          Go to Order Tests →
        </button>
      </div>
    )
  }

  const specialCacheMap: Record<SpecialModality, Record<string, SpecialImage | null | 'none'>> = {
    smear: smearCache, biopsy: biopsyImgCache,
    fundus: fundusCache, derm: dermCache, urine: urineImgCache,
  }
  const findingsMap = (modality: SpecialModality): string | undefined => ({
    smear:  caseData.hematologyFindings,
    biopsy: caseData.biopsyFindings,
    fundus: caseData.fundusFindings,
    derm:   caseData.skinFindings,
    urine:  caseData.urineFindings,
  }[modality])

  return (
    <div className="space-y-4">
      {/* Fuzzy-matched orders that need the student to confirm the canonical name */}
      {Object.entries(ambiguousOrders).length > 0 && (
        <SectionCard title="Confirm Test Orders">
          <div className="space-y-3">
            {Object.entries(ambiguousOrders).map(([typed, suggestions]) => (
              <div key={typed} className="rounded-md border border-caution-border bg-caution-bg px-4 py-3">
                <p className="text-xs text-ink-primary mb-2">
                  <span className="font-semibold">&ldquo;{typed}&rdquo;</span> didn&apos;t exactly match a test in this case. Did you mean:
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => onConfirmAmbiguous(typed, s)}
                      className="rounded-md border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => onDismissAmbiguous(typed)}
                    className="rounded-md border border-surface-4 px-3 py-1.5 text-xs text-ink-tertiary hover:text-ink-secondary transition-colors"
                  >
                    None of these — keep as ordered
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {/* Live board is a Foundations-only training aid. At Clinical/Advanced the
          candidate differential is hidden during the case (no cueing) and revealed
          in the scorecard afterward. */}
      {caseDifficulty === 'Foundations' && (
        <DifferentialBoard
          priors={caseData.differentialPriors}
          testImpacts={caseData.testImpacts}
          orderedTests={orderedArr}
          correctDiagnosis={caseData.diagnosis}
          caseDifficulty={caseDifficulty}
          reveal={diagnosisSubmitted}
        />
      )}
      {allResultPanels.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={toggleAllPanels}
            className="text-xs text-ink-secondary hover:text-ink-primary transition-colors"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      )}
      {(orderedLabs.length > 0 || pendingLabs.length > 0 || loadingOnDemand.length > 0) && (
        <SectionCard title="Laboratory Results">
          <div className="space-y-2">
            {orderedLabs.map(lab => {
              const key = findResultKey(lab, caseData.labResults)!
              const raw = caseData.labResults[key]
              const components: Array<{ name: string; value: string; unit: string; referenceRange: string; status: string }> =
                Array.isArray(raw?.components) && raw.components.length > 0
                  ? raw.components
                  : raw?.value
                    ? [{ name: lab, value: raw.value, unit: raw.unit ?? '', referenceRange: raw.referenceRange ?? '—', status: raw.status ?? 'normal' }]
                    : raw?.result
                      ? [{ name: lab, value: raw.result, unit: '', referenceRange: raw.referenceRange ?? '—', status: raw.status ?? 'normal' }]
                      : []
              const panelAbnormal = components.some(c => c.status === 'abnormal' || c.status === 'critical')
              const isCollapsed = collapsedPanels.has(lab)
              const summary = getPanelSummary(components)
              return (
                <div key={lab} className="rounded-md border border-surface-4 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-4/60 hover:bg-surface-3 transition-colors text-left"
                    onClick={() => togglePanel(lab)}
                  >
                    <span className={`text-xs font-semibold uppercase tracking-wide ${panelAbnormal ? 'text-caution' : 'text-ink-secondary'}`}>{lab}</span>
                    <div className="flex items-center gap-3 min-w-0">
                      {isCollapsed && <span className="text-xs text-ink-tertiary truncate max-w-xs">{summary}</span>}
                      <svg className={`w-4 h-4 text-ink-secondary transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <table className="w-full text-sm border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[36%]" />
                        <col className="w-[16%]" />
                        <col className="w-14" />
                        <col className="w-[16%]" />
                        <col className="w-[26%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-surface-1 border-b border-surface-4">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Test</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Result</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Flag</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Unit</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">Ref Range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.map((c, j) => {
                          const isCritical = c.status === 'critical'
                          const isAbnormal = c.status === 'abnormal' || isCritical
                          const direction = isAbnormal ? parseDirection(c.value, c.referenceRange) : null
                          return (
                            <tr key={j} className={`border-b border-surface-4/40 last:border-0 ${j % 2 === 0 ? 'bg-surface-2' : 'bg-surface-2/60'}`}>
                              <td className="pl-5 pr-4 py-2.5 text-ink-secondary">{c.name}</td>
                              <td className={`px-4 py-2.5 font-semibold tabular-nums ${isCritical ? 'text-critical' : isAbnormal ? 'text-caution' : 'text-ink-primary'}`}>{c.value}</td>
                              <td className="px-4 py-2.5 w-14 text-sm font-bold">
                                {isAbnormal && (
                                  <span className={isCritical ? 'text-critical' : 'text-caution'}>
                                    {direction === 'high' ? '↑' : direction === 'low' ? '↓' : isCritical ? '!' : 'A'}
                                    {isCritical && <span className="ml-1 text-[10px] font-semibold tracking-wide">CRIT</span>}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-ink-secondary">{c.unit}</td>
                              <td className="px-4 py-2.5 text-ink-secondary">{c.referenceRange}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
            {pendingLabs.map(lab => (
              <div key={lab} className={`rounded-md border border-surface-4 px-4 py-3 ${diagnosisSubmitted ? 'bg-surface-2/60' : 'bg-caution-bg border-caution-border'}`}>
                {diagnosisSubmitted ? (
                  <>
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">{lab}</span>
                      <span className="text-xs text-ink-tertiary italic">(returned after your diagnosis — typically {pendingHours(lab)})</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-secondary">Result not modeled for this case.</div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-caution animate-pulse flex-shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-caution">{lab}</span>
                    <span className="text-xs text-ink-tertiary">Result pending — typically available in {pendingHours(lab)}</span>
                  </div>
                )}
              </div>
            ))}
            {loadingOnDemand.map(t => (
              <div key={t} className="rounded-md border border-primary-200 bg-primary-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin text-primary-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary-700">{t}</span>
                  <span className="text-xs text-ink-tertiary">Generating result...</span>
                </div>
              </div>
            ))}
            {orderedArr.filter(t => failedOnDemand.has(t)).map(t => (
              <div key={t} className="rounded-md border border-surface-4 bg-surface-2/60 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{t}</span>
                  <button
                    className="text-xs text-primary-400 hover:text-primary-400 transition-colors flex-shrink-0"
                    onClick={() => onRetryFailed(t)}
                  >
                    Retry
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink-tertiary">Result generation failed — this test may not be available for this case.</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {(orderedImaging.length > 0 || orderedProcedures.length > 0) && (
        <SectionCard title="Imaging & Studies">
          <div className="space-y-2">
            {orderedImaging.map(img => {
              const key = findResultKey(img, caseData.imagingResults)!
              const report = caseData.imagingResults[key]
              const isCollapsed = collapsedPanels.has(img)

              if (isECGTest(img)) {
                const ecgImage = img in ecgCache ? ecgCache[img] : null
                const ecgSummary = (caseData.ecgFindings ?? report).split(/[.!?]/)[0].trim()
                return (
                  <div key={img} className="rounded-md border border-surface-4 overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-4/60 hover:bg-surface-3 transition-colors text-left"
                      onClick={() => togglePanel(img)}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">ECG / Electrocardiogram</span>
                      <div className="flex items-center gap-3 min-w-0">
                        {isCollapsed && diagnosisSubmitted && <span className="text-xs text-ink-tertiary truncate max-w-xs">ECG | {ecgSummary}</span>}
                        <svg className={`w-4 h-4 text-ink-secondary transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {!isCollapsed && (
                      <ECGPanel
                        ecgFindings={caseData.ecgFindings}
                        aiReport={report}
                        image={ecgImage}
                        diagnosisSubmitted={diagnosisSubmitted}
                        onZoom={(src, alt) => setZoomedImage({ src, alt })}
                      />
                    )}
                  </div>
                )
              }

              const specialModality = getSpecialModality(img)
              if (specialModality) {
                const specialImage = img in specialCacheMap[specialModality] ? specialCacheMap[specialModality][img] : null
                const firstLine = report.split(/[.\n]/)[0].trim()
                const isBiopsyGated = specialModality === 'biopsy' && !diagnosisSubmitted
                return (
                  <div key={img} className="rounded-md border border-surface-4 overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-4/60 hover:bg-surface-3 transition-colors text-left"
                      onClick={() => togglePanel(img)}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                        {SPECIAL_LABELS[specialModality]}
                        {isBiopsyGated && <span className="ml-2 text-xs font-normal text-caution normal-case">(results after diagnosis)</span>}
                      </span>
                      <div className="flex items-center gap-3 min-w-0">
                        {isCollapsed && <span className="text-xs text-ink-tertiary truncate max-w-xs">{firstLine}</span>}
                        <svg className={`w-4 h-4 text-ink-secondary transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {!isCollapsed && (
                      isBiopsyGated ? (
                        <div className="bg-surface-1 px-4 py-4">
                          <p className="text-sm text-ink-tertiary italic">H&E biopsy results are typically available after clinical assessment. Submit your diagnosis to view pathology findings.</p>
                        </div>
                      ) : (
                        <SpecialPanel
                          modality={specialModality}
                          report={report}
                          image={specialImage}
                          findings={findingsMap(specialModality)}
                          onZoom={(src, alt) => setZoomedImage({ src, alt })}
                        />
                      )
                    )}
                  </div>
                )
              }

              const firstLine = report.split(/[.\n]/)[0].trim()
              const cachedResults = imagingCache[img] ?? null
              return (
                <div key={img} className="rounded-md border border-surface-4 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-4/60 hover:bg-surface-3 transition-colors text-left"
                    onClick={() => togglePanel(img)}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{img}</span>
                    <div className="flex items-center gap-3 min-w-0">
                      {isCollapsed && diagnosisSubmitted && <span className="text-xs text-ink-tertiary truncate max-w-xs">{firstLine}</span>}
                      <svg className={`w-4 h-4 text-ink-secondary transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <ImagingPanel report={report} results={cachedResults} diagnosisSubmitted={diagnosisSubmitted} />
                  )}
                </div>
              )
            })}
            {orderedProcedures.map(proc => {
              const key = findResultKey(proc, caseData.procedureResults!)!
              const report = caseData.procedureResults![key]
              const isCollapsed = collapsedPanels.has(proc)
              const firstLine = report.split(/[.\n]/)[0].trim()
              return (
                <div key={proc} className="rounded-md border border-surface-4 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-4/60 hover:bg-surface-3 transition-colors text-left"
                    onClick={() => togglePanel(proc)}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{proc}</span>
                    <div className="flex items-center gap-3 min-w-0">
                      {isCollapsed && <span className="text-xs text-ink-tertiary truncate max-w-xs">{firstLine}</span>}
                      <svg className={`w-4 h-4 text-ink-secondary transition-transform duration-200 flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="rounded-b-md bg-surface-1 px-4 py-3">
                      <p className="text-sm leading-relaxed text-ink-secondary">{report}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

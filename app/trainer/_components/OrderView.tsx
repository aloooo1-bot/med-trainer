import { IMAGING_WITH_IMAGES, MASTER_TEST_LIST, searchTests } from '@/app/lib/testMasterList'
import { matchOrderSets, COMMON_CORE_TESTS } from '@/app/lib/orderSets'
import { SectionCard } from './SectionCard'
import { Badge } from './Badge'
import { PredictionPanel } from './PredictionPanel'
import type { CaseData } from '../_lib/types'

/** One selectable test button, shared across the Clinical ordering panels. */
function TestChip({ name, isOrdered, isSelected, locked, onClick }: {
  name: string
  isOrdered: boolean
  isSelected: boolean
  locked: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={() => !isOrdered && !locked && onClick()}
      disabled={isOrdered || locked}
      className={`text-left rounded-md border px-3 py-2 text-sm transition-colors ${
        isOrdered
          ? 'border-confirmed-border bg-confirmed-bg text-confirmed cursor-default'
          : isSelected
          ? 'border-primary-400 bg-primary-50 text-primary-700 cursor-pointer'
          : locked
          ? 'border-surface-4 bg-surface-2 text-ink-tertiary opacity-50 cursor-not-allowed'
          : 'border-surface-4 bg-surface-1 text-ink-primary hover:border-surface-4 hover:bg-surface-2 cursor-pointer'
      }`}
    >
      {name}
      {isOrdered && <span className="ml-1.5 text-xs">✓</span>}
      {isSelected && !isOrdered && <span className="ml-1.5 text-xs">●</span>}
    </button>
  )
}

export function OrderView({
  caseData, caseDifficulty, scaffoldingLevel, prediction, predictionConfidence, onLockPrediction,
  predictionCandidates, hasReasoningModel, caseSearchTests, orderedTests, selectedTests,
  toggleTest, orderTests, orderCustomTest, removeOrderedTest,
  testSearchQuery, setTestSearchQuery, showSearchDropdown, setShowSearchDropdown,
  customTestInput, setCustomTestInput, locked,
}: {
  caseData: CaseData
  caseDifficulty: string
  /** Interface scaffolding tier (5.3) — drives ordering UI density; defaults to caseDifficulty. */
  scaffoldingLevel?: string
  prediction: string[] | null
  predictionConfidence: number | null
  onLockPrediction: (ranking: string[], confidence: number) => void
  /** Foundations ranked-mode candidates (empty at gated difficulties — anti-cueing). */
  predictionCandidates: string[]
  /** Whether this case has a differential reasoning model (enables prediction UI). */
  hasReasoningModel: boolean
  /** Advanced: case-specific test names for the search list (names only). */
  caseSearchTests?: Array<{ name: string; category: string }>
  orderedTests: Set<string>
  selectedTests: Set<string>
  toggleTest: (name: string) => void
  orderTests: () => void
  addOrderedTest: (name: string) => void
  orderCustomTest: () => void
  removeOrderedTest: (name: string) => void
  openCategories: Set<string>
  setOpenCategories: React.Dispatch<React.SetStateAction<Set<string>>>
  testSearchQuery: string
  setTestSearchQuery: React.Dispatch<React.SetStateAction<string>>
  showSearchDropdown: boolean
  setShowSearchDropdown: React.Dispatch<React.SetStateAction<boolean>>
  customTestInput: string
  setCustomTestInput: React.Dispatch<React.SetStateAction<string>>
  locked: boolean
}) {
  // Scaffolding tier decides ordering UI density (5.3). Today it equals
  // difficulty; kept as a separate axis so the two can later diverge.
  const scaffold = scaffoldingLevel ?? caseDifficulty

  // Foundations gets the candidate list (training wheels); Clinical/Advanced commit
  // a free-text leading diagnosis so the answer isn't cued.
  const predictionOpen = caseDifficulty !== 'Foundations'

  // Add several tests to the selection at once (order-set "add all"), skipping
  // any already selected or ordered.
  const selectMany = (names: string[]) => {
    if (locked) return
    for (const n of names) {
      if (!selectedTests.has(n) && !orderedTests.has(n)) toggleTest(n)
    }
  }

  // ── FOUNDATIONS: curated checklist ──
  if (scaffold === 'Foundations') {
    const allOrdered = (name: string) => orderedTests.has(name)
    return (
      <div className="space-y-4">
        <PredictionPanel candidates={predictionCandidates} open={predictionOpen} prediction={prediction} confidence={predictionConfidence} onLock={onLockPrediction} />
        <SectionCard title="Laboratory Studies">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {caseData.availableLabs.map(lab => {
              const isOrdered = allOrdered(lab)
              const isSelected = selectedTests.has(lab)
              return (
                <label key={lab} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${isOrdered ? 'border-confirmed-border bg-confirmed-bg cursor-default' : isSelected ? 'border-primary-400 bg-primary-50' : 'border-surface-4 bg-surface-1 hover:border-surface-4'}`}>
                  <input type="checkbox" checked={isSelected || isOrdered} disabled={isOrdered} onChange={() => !isOrdered && toggleTest(lab)} className="accent-primary-500" />
                  <span className="text-sm text-ink-primary">{lab}</span>
                  {isOrdered && <Badge text="Ordered" color="green" />}
                </label>
              )
            })}
          </div>
        </SectionCard>
        <SectionCard title="Imaging Studies">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {caseData.availableImaging.map(img => {
              const isOrdered = allOrdered(img)
              const isSelected = selectedTests.has(img)
              return (
                <label key={img} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${isOrdered ? 'border-confirmed-border bg-confirmed-bg cursor-default' : isSelected ? 'border-primary-400 bg-primary-50' : 'border-surface-4 bg-surface-1 hover:border-surface-4'}`}>
                  <input type="checkbox" checked={isSelected || isOrdered} disabled={isOrdered} onChange={() => !isOrdered && toggleTest(img)} className="accent-primary-500" />
                  <span className="text-sm text-ink-primary">{img}</span>
                  {isOrdered && <Badge text="Ordered" color="green" />}
                </label>
              )
            })}
          </div>
        </SectionCard>
        <div className="rounded-lg border border-surface-4 bg-surface-2 p-3">
          <p className="text-xs text-ink-secondary mb-2">Order a custom test not listed above:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customTestInput}
              onChange={e => setCustomTestInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') orderCustomTest() }}
              placeholder="e.g. Factor VIII Activity, Knee MRI..."
              className="flex-1 rounded-md border border-surface-5 bg-surface-1 px-3 py-2 text-sm text-ink-primary placeholder-ink-tertiary focus:border-primary-400 focus:outline-none"
            />
            <button onClick={orderCustomTest} disabled={!customTestInput.trim()} className="rounded-md bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-400 disabled:opacity-40 transition-colors">
              Order
            </button>
          </div>
        </div>
        {selectedTests.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-primary-300 bg-primary-50 px-4 py-3">
            <span className="text-sm text-primary-700">{selectedTests.size} test{selectedTests.size > 1 ? 's' : ''} selected</span>
            <button onClick={orderTests} className="rounded-md bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-400 transition-colors">
              Order Selected Tests
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── CLINICAL: syndrome order sets + common core + searchable long tail ──
  if (scaffold === 'Clinical') {
    const searchResults = testSearchQuery.length >= 2 ? searchTests(testSearchQuery) : []
    // Order sets keyed to the presenting complaint (client-visible, so no
    // cueing). Knowing the standard workup for a presentation is the skill.
    const sets = matchOrderSets(caseData.patientInfo.chiefComplaint, caseData.hpi)

    return (
      <div className="space-y-4">
        {hasReasoningModel && (
          <PredictionPanel candidates={predictionCandidates} open={predictionOpen} prediction={prediction} confidence={predictionConfidence} onLock={onLockPrediction} />
        )}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <svg className="h-4 w-4 text-ink-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={testSearchQuery}
            onChange={e => { setTestSearchQuery(e.target.value); setShowSearchDropdown(true) }}
            onFocus={() => setShowSearchDropdown(true)}
            onBlur={() => setTimeout(() => setShowSearchDropdown(false), 150)}
            disabled={locked}
            placeholder={locked ? 'Start the timer to order tests' : 'Search any test or study…'}
            className="w-full rounded-lg border border-surface-5 bg-surface-1 py-2.5 pl-9 pr-4 text-sm text-ink-primary placeholder-ink-tertiary focus:border-primary-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {testSearchQuery && (
            <button
              onMouseDown={() => { setTestSearchQuery(''); setShowSearchDropdown(false) }}
              className="absolute inset-y-0 right-3 flex items-center text-ink-tertiary hover:text-ink-secondary"
            >
              ✕
            </button>
          )}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-surface-4 bg-surface-2 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
              {searchResults.slice(0, 10).map(result => {
                const isOrdered = orderedTests.has(result.name)
                const isSelected = selectedTests.has(result.name)
                return (
                  <button
                    key={result.name}
                    onMouseDown={() => {
                      if (!isOrdered && !locked) {
                        toggleTest(result.name)
                      }
                    }}
                    disabled={isOrdered || locked}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${isOrdered ? 'opacity-50 cursor-default bg-surface-2' : isSelected ? 'bg-primary-50' : 'hover:bg-surface-3 cursor-pointer'}`}
                  >
                    <span className="text-ink-primary">{result.name}</span>
                    <span className="text-xs text-ink-tertiary ml-2 flex-shrink-0">
                      {isOrdered ? <Badge text="Ordered" color="green" /> : isSelected ? <Badge text="Selected" color="blue" /> : result.category}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {showSearchDropdown && testSearchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-surface-4 bg-surface-2 shadow-xl overflow-hidden">
              <button
                onMouseDown={() => {
                  const name = testSearchQuery.trim()
                  if (name && !locked) { toggleTest(name); setTestSearchQuery(''); setShowSearchDropdown(false) }
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-surface-3 transition-colors"
              >
                <span className="text-ink-primary">Select &ldquo;{testSearchQuery.trim()}&rdquo;</span>
                <span className="text-xs text-ink-tertiary ml-2 flex-shrink-0">custom</span>
              </button>
            </div>
          )}
        </div>

        {/* Syndrome order sets — the standard workup for this presentation.
            Add the whole set, or pick individual tests. */}
        {sets.map(set => {
          const remaining = set.tests.filter(t => !selectedTests.has(t) && !orderedTests.has(t))
          return (
            <SectionCard key={set.id} title={set.label}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-ink-tertiary">Standard workup for this presentation — order the set or pick individually.</p>
                <button
                  onClick={() => selectMany(set.tests)}
                  disabled={locked || remaining.length === 0}
                  className="flex-shrink-0 rounded-md bg-primary-500 px-3 py-1 text-xs font-medium text-white hover:bg-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {remaining.length === 0 ? 'All added' : `Add all ${remaining.length}`}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {set.tests.map(test => (
                  <TestChip
                    key={test}
                    name={test}
                    isOrdered={orderedTests.has(test)}
                    isSelected={selectedTests.has(test)}
                    locked={locked}
                    onClick={() => toggleTest(test)}
                  />
                ))}
              </div>
            </SectionCard>
          )
        })}

        {/* Common core — the tests that appear in most workups. The long tail
            lives behind the search box above. */}
        <SectionCard title="Common tests">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {COMMON_CORE_TESTS.map(test => (
              <TestChip
                key={test}
                name={test}
                isOrdered={orderedTests.has(test)}
                isSelected={selectedTests.has(test)}
                locked={locked}
                onClick={() => toggleTest(test)}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-tertiary">
            Need something else? Search any test or imaging study above — hundreds are available.
          </p>
        </SectionCard>

        <SectionCard title="Imaging Studies">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {IMAGING_WITH_IMAGES.map(study => (
              <TestChip
                key={study}
                name={study}
                isOrdered={orderedTests.has(study)}
                isSelected={selectedTests.has(study)}
                locked={locked}
                onClick={() => toggleTest(study)}
              />
            ))}
          </div>
        </SectionCard>

        {selectedTests.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-primary-300 bg-primary-50 px-4 py-3">
            <span className="text-sm text-primary-700">{selectedTests.size} test{selectedTests.size > 1 ? 's' : ''} selected</span>
            <button onClick={orderTests} className="rounded-md bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-400 transition-colors">
              Order Selected Tests
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── ADVANCED: free-text search (least scaffolding) ──
  const caseSpecificTests = (caseSearchTests ?? [])
    .filter(rt => !MASTER_TEST_LIST.some(m => m.name === rt.name))
    .map(rt => ({ name: rt.name, abbreviations: [] as string[], synonyms: [] as string[], category: rt.category }))
  const combinedTestList = [...MASTER_TEST_LIST, ...caseSpecificTests]
  const searchResults = searchTests(testSearchQuery, combinedTestList)
  const orderedList = Array.from(orderedTests)
  const selectedList = Array.from(selectedTests)

  return (
    <div className="space-y-4">
      {hasReasoningModel && (
        <PredictionPanel candidates={predictionCandidates} open={predictionOpen} prediction={prediction} confidence={predictionConfidence} onLock={onLockPrediction} />
      )}
      <div className="rounded-md border border-primary-200 bg-primary-50 px-4 py-3">
        <p className="text-xs text-primary-700">
          <span className="font-semibold">Advanced difficulty:</span> no pre-listed lab panels — search and type test names from memory. Imaging modalities are listed below for reference.
        </p>
      </div>
      <div className="relative">
        <input
          type="text"
          value={testSearchQuery}
          onChange={e => { setTestSearchQuery(e.target.value); setShowSearchDropdown(true) }}
          onFocus={() => setShowSearchDropdown(true)}
          onBlur={() => setTimeout(() => setShowSearchDropdown(false), 150)}
          disabled={locked}
          placeholder={locked ? 'Start the timer to order tests' : 'Search for a test or study...'}
          className="w-full rounded-lg border border-surface-5 bg-surface-1 px-4 py-3 text-sm text-ink-primary placeholder-ink-tertiary focus:border-primary-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-surface-4 bg-surface-2 shadow-xl overflow-hidden">
            {searchResults.map(result => {
              const isOrdered = orderedTests.has(result.name)
              const isSelected = selectedTests.has(result.name)
              return (
                <button
                  key={result.name}
                  onMouseDown={() => {
                    if (!isOrdered && !locked) {
                      toggleTest(result.name)
                      setTestSearchQuery('')
                    }
                  }}
                  disabled={isOrdered || locked}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${isOrdered ? 'opacity-50 cursor-default bg-surface-2' : isSelected ? 'bg-primary-50' : 'hover:bg-surface-3 cursor-pointer'}`}
                >
                  <span className="text-ink-primary">{result.name}</span>
                  <span className="text-xs text-ink-tertiary ml-2 flex-shrink-0">
                    {isOrdered ? <Badge text="Ordered" color="green" /> : isSelected ? <Badge text="Selected" color="blue" /> : result.category}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {showSearchDropdown && testSearchQuery.length >= 2 && searchResults.length === 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-surface-4 bg-surface-2 shadow-xl overflow-hidden">
            <button
              onMouseDown={() => {
                const name = testSearchQuery.trim()
                if (name && !locked) {
                  toggleTest(name)
                  setTestSearchQuery('')
                  setShowSearchDropdown(false)
                }
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-surface-3 transition-colors"
            >
              <span className="text-ink-primary">Select &ldquo;{testSearchQuery.trim()}&rdquo;</span>
              <span className="text-xs text-ink-tertiary ml-2 flex-shrink-0">custom</span>
            </button>
          </div>
        )}
      </div>

      <SectionCard title="Imaging Studies">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {IMAGING_WITH_IMAGES.map(study => {
            const isOrdered = orderedTests.has(study)
            const isSelected = selectedTests.has(study)
            return (
              <button
                key={study}
                onClick={() => !isOrdered && !locked && toggleTest(study)}
                disabled={isOrdered || locked}
                className={`text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                  isOrdered
                    ? 'border-confirmed-border bg-confirmed-bg text-confirmed cursor-default'
                    : isSelected
                    ? 'border-primary-400 bg-primary-50 text-primary-700 cursor-pointer'
                    : locked
                    ? 'border-surface-4 bg-surface-2 text-ink-tertiary opacity-50 cursor-not-allowed'
                    : 'border-surface-4 bg-surface-1 text-ink-primary hover:border-surface-4 hover:bg-surface-2 cursor-pointer'
                }`}
              >
                {study}
                {isOrdered && <span className="ml-1.5 text-xs">✓</span>}
                {isSelected && !isOrdered && <span className="ml-1.5 text-xs">●</span>}
              </button>
            )
          })}
        </div>
      </SectionCard>

      {selectedList.length > 0 && (
        <SectionCard title={`Selected Tests (${selectedList.length})`}>
          <div className="space-y-2">
            {selectedList.map(t => (
              <div key={t} className="flex items-center justify-between rounded-md border border-primary-300 bg-primary-50 px-3 py-2">
                <span className="text-sm text-primary-700">{t}</span>
                <button onClick={() => toggleTest(t)} className="text-primary-400 hover:text-primary-700 text-xs transition-colors ml-3 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {orderedList.length > 0 && (
        <SectionCard title={`Ordered Tests (${orderedList.length})`}>
          <div className="space-y-2">
            {orderedList.map(t => (
              <div key={t} className="flex items-center justify-between rounded-md border border-surface-4 bg-surface-1 px-3 py-2">
                <span className="text-sm text-ink-primary">{t}</span>
                <button onClick={() => removeOrderedTest(t)} className="text-ink-tertiary hover:text-critical text-xs transition-colors ml-3 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {selectedList.length === 0 && orderedList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-ink-tertiary">
          <p className="text-sm">No tests selected yet.</p>
          <p className="text-xs mt-1">Search for a test above to add it.</p>
        </div>
      )}

      {selectedTests.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary-300 bg-primary-50 px-4 py-3">
          <span className="text-sm text-primary-700">{selectedTests.size} test{selectedTests.size > 1 ? 's' : ''} selected</span>
          <button onClick={orderTests} className="rounded-md bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-400 transition-colors">
            Order Selected Tests
          </button>
        </div>
      )}
    </div>
  )
}

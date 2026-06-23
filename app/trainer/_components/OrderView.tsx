import { CLINICAL_CATEGORIES, IMAGING_WITH_IMAGES, MASTER_TEST_LIST, searchTests } from '@/app/lib/testMasterList'
import { SectionCard } from './SectionCard'
import { Badge } from './Badge'
import { PredictionPanel } from './PredictionPanel'
import type { CaseData } from '../_lib/types'

export function OrderView({
  caseData, caseDifficulty, prediction, predictionConfidence, onLockPrediction, orderedTests, selectedTests,
  toggleTest, orderTests, orderCustomTest, removeOrderedTest,
  testSearchQuery, setTestSearchQuery, showSearchDropdown, setShowSearchDropdown,
  customTestInput, setCustomTestInput, locked,
}: {
  caseData: CaseData
  caseDifficulty: string
  prediction: string[] | null
  predictionConfidence: number | null
  onLockPrediction: (ranking: string[], confidence: number) => void
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
  // ── FOUNDATIONS: curated checklist ──
  if (caseDifficulty === 'Foundations') {
    const allOrdered = (name: string) => orderedTests.has(name)
    return (
      <div className="space-y-4">
        <PredictionPanel candidates={caseData.differentialPriors?.map(p => p.name) ?? []} prediction={prediction} confidence={predictionConfidence} onLock={onLockPrediction} />
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

  // ── CLINICAL: non-case-specific reference lists + master-list search ──
  if (caseDifficulty === 'Clinical') {
    const searchResults = testSearchQuery.length >= 2 ? searchTests(testSearchQuery) : []

    return (
      <div className="space-y-4">
        <PredictionPanel candidates={caseData.differentialPriors?.map(p => p.name) ?? []} prediction={prediction} confidence={predictionConfidence} onLock={onLockPrediction} />
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

        <SectionCard title="Common Laboratory Tests">
          <div className="space-y-4">
            {CLINICAL_CATEGORIES.filter(cat => cat.name !== 'Imaging').map(cat => (
              <div key={cat.name}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-400">{cat.name}</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {cat.tests.map(test => {
                    const isOrdered = orderedTests.has(test)
                    const isSelected = selectedTests.has(test)
                    return (
                      <button
                        key={test}
                        onClick={() => !isOrdered && !locked && toggleTest(test)}
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
                        {test}
                        {isOrdered && <span className="ml-1.5 text-xs">✓</span>}
                        {isSelected && !isOrdered && <span className="ml-1.5 text-xs">●</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

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

  // ── ADVANCED: free-text search ──
  const caseSpecificTests = (caseData.relevantTests ?? [])
    .filter(rt => !MASTER_TEST_LIST.some(m => m.name === rt.name))
    .map(rt => ({ name: rt.name, abbreviations: [] as string[], synonyms: [] as string[], category: rt.category }))
  const combinedTestList = [...MASTER_TEST_LIST, ...caseSpecificTests]
  const searchResults = searchTests(testSearchQuery, combinedTestList)
  const orderedList = Array.from(orderedTests)
  const selectedList = Array.from(selectedTests)

  return (
    <div className="space-y-4">
      <PredictionPanel candidates={caseData.differentialPriors?.map(p => p.name) ?? []} prediction={prediction} confidence={predictionConfidence} onLock={onLockPrediction} />
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

import { useState } from 'react'
import Link from 'next/link'
import { SectionCard } from './SectionCard'
import { ScoreRing, CategoryRow, ScorecardNotesPanel } from './ScoreRing'
import { FeedbackTabs, type FeedbackSection } from './FeedbackTabs'
import { DiagnosisInput } from './DiagnosisInput'
import { WhyPanel } from './WhyPanel'
import { MicButton } from './MicButton'
import { computeBeliefs } from '@/app/lib/reasoning/differential'
import { scorePrediction, predictionMatchesDiagnosis, commitmentQuadrant } from '@/app/lib/reasoning/prediction'
import { DifferentialBoard } from './DifferentialBoard'
import { getRubric, type DimensionKey } from '@/app/grading/rubric'
import { normalizeMissedQuestions, type GradingResult, type DimensionAverage } from '@/app/grading/types'
import { type TimerState, type NotesState, SOAP_TEMPLATE } from '../_lib/types'
import type { CaseData } from '../_lib/types'

export function DiagnosisView({
  caseData, caseDifficulty, prediction, predictionConfidence, resolvedSystem,
  gradingLoading, gradingError, gradingResult,
  userDiagnosis, setUserDiagnosis,
  userPresentation, setUserPresentation,
  timerState, locked,
  inPresentation, enterPresentation,
  expandedCategory, setExpandedCategory,
  feedbackRatings, setFeedbackRatings,
  feedbackHover, setFeedbackHover,
  feedbackText, setFeedbackText,
  feedbackSubmitted, setFeedbackSubmitted,
  feedbackSubmitting, setFeedbackSubmitting,
  notes,
  workingDifferential,
  submitDiagnosis, generateCase, orderedTests, dimensionAverages,
}: {
  caseData: CaseData
  caseDifficulty: string
  prediction: string[] | null
  predictionConfidence: number | null
  resolvedSystem: string
  gradingLoading: boolean
  gradingError: string | null
  gradingResult: GradingResult | null
  userDiagnosis: string
  setUserDiagnosis: React.Dispatch<React.SetStateAction<string>>
  userPresentation: string
  setUserPresentation: React.Dispatch<React.SetStateAction<string>>
  timerState: TimerState
  locked: boolean
  /** Clinical/Advanced: student has committed to the untimed write-up phase. */
  inPresentation: boolean
  enterPresentation: () => void
  expandedCategory: DimensionKey | null
  setExpandedCategory: React.Dispatch<React.SetStateAction<DimensionKey | null>>
  feedbackRatings: Record<string, number>
  setFeedbackRatings: React.Dispatch<React.SetStateAction<Record<string, number>>>
  feedbackHover: Record<string, number>
  setFeedbackHover: React.Dispatch<React.SetStateAction<Record<string, number>>>
  feedbackText: string
  setFeedbackText: React.Dispatch<React.SetStateAction<string>>
  feedbackSubmitted: boolean
  setFeedbackSubmitted: React.Dispatch<React.SetStateAction<boolean>>
  feedbackSubmitting: boolean
  setFeedbackSubmitting: React.Dispatch<React.SetStateAction<boolean>>
  notes: NotesState
  /** The student's own working differential list, for the scorecard echo. */
  workingDifferential?: string[]
  submitDiagnosis: (overrideDiagnosis?: string, overridePresentation?: string, timedOut?: boolean) => Promise<GradingResult | null>
  generateCase: (overrideSystem?: string, overrideDifficulty?: string, overrideDiagnosis?: string) => Promise<CaseData | null>
  orderedTests: Set<string>
  /** This student's own mean per dimension, as fractions of each max. */
  dimensionAverages?: DimensionAverage[]
}) {
  // Whether the student has taken control of which dimension is open. Until
  // they do, the scorecard leads with the weakest one.
  const [categoryTouched, setCategoryTouched] = useState(false)

  if (gradingLoading) {
    return (
      <SectionCard title="Evaluating Diagnosis">
        <div className="flex flex-col items-center justify-center py-14 gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-4 border-t-primary-400" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-ink-primary">Evaluating your diagnosis…</p>
            <p className="text-xs text-ink-tertiary">Reviewing history, workup, and clinical reasoning</p>
          </div>
        </div>
      </SectionCard>
    )
  }

  if (gradingError) {
    return (
      <SectionCard title="Submit Your Diagnosis">
        <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-red-800 bg-red-950/50">
            <svg className="h-4 w-4 text-critical" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-critical mb-0.5">{gradingError}</p>
            <p className="text-xs text-ink-tertiary">Your diagnosis and reasoning are still saved above.</p>
          </div>
          <button
            onClick={() => submitDiagnosis()}
            className="rounded-md bg-primary-500 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-400 transition-colors"
          >
            Retry
          </button>
        </div>
      </SectionCard>
    )
  }

  // Clinical/Advanced: entering the write-up stops the case timer and locks
  // the chart (server-enforced), so the untimed presentation can't be used to
  // keep working the case. Foundations has no timer and skips this gate.
  if (!gradingResult && caseDifficulty !== 'Foundations' && !inPresentation) {
    return (
      <SectionCard title="Begin Your Write-Up">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-sm text-ink-primary font-medium">
              Ready to commit to your {caseDifficulty === 'Advanced' ? 'diagnosis and oral presentation' : 'diagnosis and reasoning'}?
            </p>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Entering the write-up <span className="font-semibold">stops the case timer</span> — your{' '}
              {caseDifficulty === 'Advanced' ? 'presentation' : 'reasoning'} is untimed. In exchange, the chart locks:
              no further patient questions, exams, or test orders.
            </p>
          </div>
          <button
            onClick={enterPresentation}
            disabled={locked}
            title={locked ? 'Start the timer to begin the clinical encounter' : undefined}
            className="rounded-md bg-primary-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Begin write-up — stop timer &amp; lock chart
          </button>
        </div>
      </SectionCard>
    )
  }

  if (!gradingResult) {
    const reasoningWords = userPresentation.trim() === '' ? 0 : userPresentation.trim().split(/\s+/).filter(Boolean).length
    const CLINICAL_MIN_WORDS = 25
    return (
      <SectionCard title="Submit Your Diagnosis">
        <div className="space-y-4">
          <div>
            <label className="mb-2 flex items-center justify-between text-sm text-ink-secondary">
              <span>Primary diagnosis:</span>
              <MicButton
                onTranscript={text => setUserDiagnosis(prev => prev ? prev + ' ' + text : text)}
                paused={timerState.status === 'paused' || gradingLoading || locked}
                className="py-1"
              />
            </label>
            <DiagnosisInput
              value={userDiagnosis}
              onChange={setUserDiagnosis}
              onKeyDown={e => e.key === 'Enter' && caseDifficulty === 'Foundations' && submitDiagnosis()}
              disabled={gradingLoading || locked}
              // Advanced hides every list to avoid cueing — the type-ahead
              // corpus would leak candidate diagnoses through autocomplete.
              noSuggestions={caseDifficulty === 'Advanced'}
            />
          </div>

          {caseDifficulty === 'Clinical' && (
            <div>
              <label className="mb-2 flex items-center justify-between text-sm text-ink-secondary">
                <span>Clinical Reasoning <span className="text-ink-tertiary">(required, ≥{CLINICAL_MIN_WORDS} words)</span></span>
                <div className="flex items-center gap-2">
                  <MicButton
                    onTranscript={text => setUserPresentation(prev => prev ? prev + ' ' + text : text)}
                    paused={timerState.status === 'paused' || gradingLoading || locked}
                    className="py-1"
                  />
                  <span className={`text-xs tabular-nums ${reasoningWords < CLINICAL_MIN_WORDS ? 'text-ink-tertiary' : 'text-ink-secondary'}`}>
                    {reasoningWords} words
                  </span>
                </div>
              </label>
              <textarea
                value={userPresentation}
                onChange={e => setUserPresentation(e.target.value)}
                disabled={locked}
                placeholder="Explain what findings support your diagnosis. Reference specific values from the history, exam, or test results that led you to this conclusion."
                rows={5}
                className="w-full rounded-md border border-surface-5 bg-surface-1 px-4 py-3 text-sm text-ink-primary placeholder-ink-tertiary focus:border-primary-400 focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {caseDifficulty === 'Advanced' && (
            <div>
              <label className="mb-2 flex items-center justify-between text-sm text-ink-secondary">
                <span>Oral Presentation <span className="text-ink-tertiary">(required)</span></span>
                <div className="flex items-center gap-2">
                  <MicButton
                    onTranscript={text => setUserPresentation(prev => prev ? prev + ' ' + text : text)}
                    paused={timerState.status === 'paused' || gradingLoading || locked}
                    className="py-1"
                  />
                  <span className={`text-xs tabular-nums ${userPresentation.trim().split(/\s+/).filter(Boolean).length < 50 ? 'text-ink-tertiary' : 'text-ink-secondary'}`}>
                    {userPresentation.trim() === '' ? 0 : userPresentation.trim().split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
              </label>
              <textarea
                value={userPresentation}
                onChange={e => setUserPresentation(e.target.value)}
                disabled={locked}
                placeholder={"Patient summary: [Name] is a [age]yo [gender] presenting with [chief complaint].\n\nKey findings: [Most significant positives and pertinent negatives from history, exam, and results — cite actual values.]\n\nAssessment: [Your diagnosis and why the findings support it. Address top differentials and why you ruled them out.]\n\nPlan: [Immediate management steps — treatment, further workup, disposition, safety considerations.]"}
                rows={10}
                className="w-full rounded-md border border-surface-5 bg-surface-1 px-4 py-3 text-sm text-ink-primary placeholder-ink-tertiary focus:border-primary-400 focus:outline-none resize-y font-mono leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          )}

          <p className="text-xs text-ink-tertiary italic">
            {caseDifficulty === 'Advanced'
              ? 'Tip: Be specific — cite actual values (e.g. "UPCR 5.8", "eGFR 48") rather than general terms.'
              : 'Tip: Consider including the underlying cause in your diagnosis (e.g. "X secondary to Y").'}
          </p>

          {/* Foundations only: these categories are exactly where hiddenHistory
              hooks live, so at Clinical/Advanced this box is a free hint that
              contradicts the gating philosophy. */}
          {caseDifficulty === 'Foundations' && (
            <div className="rounded-md border border-surface-4/60 bg-surface-2/40 px-3 py-2.5">
              <p className="text-xs font-medium text-ink-tertiary mb-1.5">Before submitting — have you asked about:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  'Family history of similar conditions',
                  'Recent medication changes or new drugs',
                  'OTC medications, NSAIDs, or supplements',
                  'Recent travel or sick contacts',
                ].map((q) => (
                  <div key={q} className="flex items-start gap-1.5 text-xs text-ink-tertiary">
                    <span className="mt-px flex-shrink-0 text-ink-tertiary">□</span>
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => submitDiagnosis()}
            disabled={
              !userDiagnosis.trim() ||
              gradingLoading ||
              locked ||
              // Clinical requires substantive reasoning — a placeholder like "x"
              // no longer satisfies the required field (min word count).
              (caseDifficulty === 'Clinical' && reasoningWords < CLINICAL_MIN_WORDS) ||
              ((caseDifficulty === 'Clinical' || caseDifficulty === 'Advanced') && !userPresentation.trim())
            }
            className="w-full rounded-md bg-primary-500 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {gradingLoading ? 'Grading...' : 'Submit Diagnosis'}
          </button>
          {orderedTests.size === 0 && (
            <p className="text-xs text-caution">
              Tip: Order some tests first to improve your workup.
            </p>
          )}
        </div>
      </SectionCard>
    )
  }

  // ── Grading result / scorecard ──

  /**
   * The weakest dimension opens by default.
   *
   * Every row started collapsed, so the per-dimension feedback — the only text
   * that says WHERE the points went — was invisible until the student thought
   * to click a small chevron. The one row worth reading first is the one that
   * cost the most, so it is open on arrival; any click hands control back.
   */
  const weakestCategory: DimensionKey | null = (() => {
    if (!gradingResult?.dimensions) return null
    let worst: DimensionKey | null = null
    let worstPct = Infinity
    for (const { key, max } of getRubric(caseDifficulty)) {
      const dim = gradingResult.dimensions[key]
      if (!dim || max <= 0) continue
      const pct = dim.score / max
      // Strict <, so ties keep the earlier (higher-weighted) rubric row.
      if (pct < worstPct) { worstPct = pct; worst = key }
    }
    // Nothing to lead with when the student dropped no meaningful points.
    return worstPct < 1 ? worst : null
  })()
  const shownCategory = categoryTouched ? expandedCategory : weakestCategory

  const submitFeedback = async () => {
    setFeedbackSubmitting(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosis: caseData?.diagnosis,
          difficulty: caseDifficulty,
          system: caseData?.patientInfo ? resolvedSystem : undefined,
          patientName: caseData?.patientInfo?.name,
          ratings: feedbackRatings,
          feedback: feedbackText,
        }),
      })
    } catch {}
    setFeedbackSubmitted(true)
    setFeedbackSubmitting(false)
  }

  const FEEDBACK_DIMS = [
    { key: 'overall',               label: 'Overall Case' },
    { key: 'clinicalRealism',        label: 'Clinical Realism' },
    { key: 'gradingFairness',        label: 'Grading Fairness' },
    { key: 'patientCommunication',   label: 'Patient Communication' },
    { key: 'difficultyAccuracy',     label: 'Difficulty Accuracy' },
  ]
  const hasAnyRating = Object.values(feedbackRatings).some(v => v > 0)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-rule bg-paper text-ink shadow-sm overflow-hidden">

        {/* A — Header bar */}
        <div style={{ background: 'var(--color-paper-2)', borderBottom: '1px solid var(--color-rule)', padding: '12px 20px' }}>
          {/* Identity, then the two diagnoses side by side beneath it.
              These used to sit in a right-aligned nowrap column, so a full
              differential written out in a sentence — which is what a good
              answer looks like — ran off the card and took the correct
              diagnosis with it. Comparing the two is the single most useful
              thing on this screen, so both now wrap and neither can be
              pushed out of view. */}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-3)', marginBottom: 4 }}>
            {'CASE · ' + (resolvedSystem || 'General') + ' · ' + caseDifficulty}
          </div>
          <div style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 20, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 12 }}>
            {(caseData?.patientInfo?.name ?? '') + (caseData?.patientInfo?.name ? ', ' : '') + (caseData?.patientInfo?.age ?? '') + (caseData?.patientInfo?.gender === 'male' ? 'M' : caseData?.patientInfo?.gender === 'female' ? 'F' : (caseData?.patientInfo?.gender?.charAt(0).toUpperCase() ?? ''))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: gradingResult.correct ? 'var(--color-confirmed)' : 'var(--color-critical)', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {gradingResult.correct ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-3)' }}>
                  Your diagnosis
                </span>
              </div>
              <div style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                {userDiagnosis || '—'}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-3)', marginBottom: 4 }}>
                Correct diagnosis
              </div>
              <div style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                {caseData?.diagnosis ?? '—'}
              </div>
            </div>
          </div>
        </div>

        {/* B — Body: ring (left) + categories (right) */}
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
          <div className="flex flex-col items-center gap-2 py-8 px-6 border-b md:border-b-0 md:border-r border-rule">
            <ScoreRing score={gradingResult.score} />
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 500, color: 'var(--color-ink)' }}>
              {gradingResult.score >= 80 ? 'Strong pass' : gradingResult.score >= 70 ? 'Pass' : gradingResult.score >= 50 ? 'Needs review' : 'Did not pass'}
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--color-ink-3)', textAlign: 'center', lineHeight: 1.6, marginTop: 2 }}>
              {gradingResult.score}/100 rubric
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex flex-col divide-y divide-rule">
              {gradingResult.dimensions && getRubric(caseDifficulty).map(({ key, label, max }, i) => {
                const dim = gradingResult.dimensions![key]
                if (!dim) return null
                const pct = Math.min(100, (dim.score / max) * 100)
                return (
                  <CategoryRow
                    key={key}
                    label={label}
                    dim={dim}
                    max={max}
                    pct={pct}
                    index={i}
                    // Rescaled from a stored fraction to THIS case's max, so a
                    // Foundations history and a Clinical case still compare.
                    average={(() => {
                      const a = dimensionAverages?.find(d => d.key === key)
                      return a && a.n > 0
                        ? { score: Math.round(a.avgFraction * max * 10) / 10, n: a.n }
                        : null
                    })()}
                    expanded={shownCategory === key}
                    onToggle={() => {
                      setCategoryTouched(true)
                      setExpandedCategory(shownCategory === key ? null : key)
                    }}
                  />
                )
              })}
            </div>
            {gradingResult.feedback && (
              <div style={{ borderTop: '1px solid var(--color-rule)', padding: '14px 20px', background: 'var(--color-paper-2)' }}>
                <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                  {gradingResult.feedback}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* C — Feedback section carousel */}
        {((gradingResult.strengths?.length ?? 0) > 0
          || (gradingResult.missedQuestions?.length ?? 0) > 0
          || (gradingResult.teachingPoints?.length ?? 0) > 0) && (
          <div style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 12, paddingBottom: 4, background: 'var(--color-paper)' }}>
            {(() => {
              const strengthsAll = [
                ...(gradingResult.strengths ?? []),
              ]
              const feedSections: FeedbackSection[] = []
              if (strengthsAll.length > 0) feedSections.push({
                title: 'Strengths', items: strengthsAll, tone: 'confirmed', icon: '✓',
              })
              // Each miss carries the nearest thing the student actually said,
              // so "you should have asked X" is answerable with "…I asked this
              // instead" rather than leaving them to reconstruct it from memory.
              const missed = normalizeMissedQuestions(gradingResult.missedQuestions)
              if (missed.length > 0) feedSections.push({
                title: 'What you missed',
                tone: 'caution',
                icon: '!',
                items: missed.map((m, i) => (
                  <span key={i}>
                    {m.question}
                    <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, color: 'var(--color-ink-tertiary)', fontStyle: 'italic' }}>
                      {m.youAsked ? <>you asked: “{m.youAsked}”</> : 'never approached'}
                    </span>
                  </span>
                )),
              })
              if ((gradingResult.teachingPoints?.length ?? 0) > 0) feedSections.push({
                title: 'Teaching points', items: gradingResult.teachingPoints!, tone: 'insight', icon: '★',
              })
              return <FeedbackTabs sections={feedSections} />
            })()}
          </div>
        )}

        {/* Patient communication — reported, never scored. Labelled as such so
            it can never read as points the student lost. */}
        {(() => {
          const comm = gradingResult.communication
          if (!comm || (!comm.summary && !(comm.moments?.length > 0))) return null
          return (
            <div className="border-t border-rule px-5 py-4">
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="font-serif text-sm font-semibold text-ink">Patient Communication</h3>
                <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">not scored</span>
              </div>
              {comm.summary && (
                <p style={{ fontSize: 12, color: 'var(--color-ink-secondary)', lineHeight: 1.6, marginBottom: comm.moments?.length ? 10 : 0 }}>
                  {comm.summary}
                </p>
              )}
              <div className="space-y-2">
                {(comm.moments ?? []).map((m, i) => (
                  <div
                    key={i}
                    style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 8, padding: '10px 14px' }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        style={{ color: m.acknowledged ? 'var(--color-confirmed)' : 'var(--color-caution)', fontSize: 12, lineHeight: '18px' }}
                      >
                        {m.acknowledged ? '✓' : '○'}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--color-ink)', fontStyle: 'italic' }}>“{m.concern}”</div>
                        {m.note && (
                          <p style={{ fontSize: 12, color: 'var(--color-ink-secondary)', lineHeight: 1.6, marginTop: 3 }}>{m.note}</p>
                        )}
                      </div>
                    </div>
                    <span className="sr-only">{m.acknowledged ? 'You responded to this.' : 'This went unaddressed.'}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Differentials */}
        {gradingResult.differentials?.length > 0 && (
          <div className="border-t border-rule px-5 py-4">
            <h3 className="font-serif text-sm font-semibold text-ink mb-3">Differential Diagnosis Discussion</h3>
            {(workingDifferential?.length ?? 0) > 0 && (() => {
              // Loose token match against the revealed diagnosis — same idea as
              // history's diagnosisIsPartial: every substantial word present.
              const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
              const dxTokens = norm(caseData.diagnosis ?? '').split(' ').filter(t => t.length > 3)
              const matchesDx = (entry: string) => {
                const e = norm(entry)
                return dxTokens.length > 0 && dxTokens.every(t => e.includes(t))
              }
              return (
                <div className="mb-3 rounded-md border border-surface-4 bg-surface-1 px-3.5 py-2.5">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Your differential going in</div>
                  <ol className="flex flex-col gap-1">
                    {workingDifferential!.map((name, i) => {
                      const hit = matchesDx(name)
                      return (
                        <li key={`${name}-${i}`} className="flex items-center gap-2 text-[12px] text-ink-secondary">
                          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[10px]">{i + 1}</span>
                          <span className={hit ? 'font-semibold text-confirmed' : ''}>{name}</span>
                          {hit && <span className="text-confirmed" title="Matches the correct diagnosis">✓</span>}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )
            })()}
            <div className="space-y-2">
              {gradingResult.differentials.map((dx, i) => {
                const colonIdx = dx.indexOf(':')
                const name = colonIdx !== -1 ? dx.slice(0, colonIdx).trim() : dx
                const explanation = colonIdx !== -1 ? dx.slice(colonIdx + 1).trim() : ''
                return (
                  <div key={i} style={{ background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 15, fontWeight: 600, color: '#7A6A95', marginBottom: explanation ? 4 : 0 }}>{name}</div>
                    {explanation && <p style={{ fontSize: 12, color: 'var(--color-ink-secondary)', lineHeight: 1.6 }}>{explanation}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {prediction && (caseData.differentialPriors?.length ?? 0) > 0 && (() => {
          const isFoundations = caseDifficulty === 'Foundations'
          const beliefs = computeBeliefs(caseData.differentialPriors!, caseData.testImpacts ?? {}, Array.from(orderedTests))
          const ps = scorePrediction(prediction, beliefs)
          const engineTop = beliefs[0]?.name
          const confPct = predictionConfidence != null ? Math.round(predictionConfidence * 100) : null
          return (
            <div className="border-t border-rule px-5 py-4">
              <h3 className="font-serif text-sm font-semibold text-ink mb-3">Pre-test calibration</h3>

              {/* The commitment, paid off. This is the emotional point of
                  committing before you test — it was previously narrated in a
                  sentence, which buried the one fact the student most wants. */}
              {(() => {
                const hit = predictionMatchesDiagnosis(prediction[0], caseData.diagnosis)
                const quad = commitmentQuadrant(hit, predictionConfidence)
                const VERDICT: Record<typeof quad, { label: string; color: string; lesson: string }> = {
                  'confident-right': {
                    label: 'Confident and correct', color: 'var(--color-confirmed)',
                    lesson: 'You backed a strong read and it held — that is what good calibration looks like.',
                  },
                  'hedged-right': {
                    label: 'Right, but hedged', color: 'var(--color-caution)',
                    lesson: 'You were more right than you gave yourself credit for. Worth trusting that read a little sooner.',
                  },
                  'confident-wrong': {
                    label: 'Confident and wrong', color: 'var(--color-critical)',
                    lesson: 'The costly quadrant. Before committing this hard, ask what finding would have changed your mind.',
                  },
                  'hedged-wrong': {
                    label: 'Wrong, appropriately unsure', color: 'var(--color-ink-secondary)',
                    lesson: 'Your uncertainty was honest — the workup was doing real work here, which is exactly its job.',
                  },
                }
                const v = VERDICT[quad]
                return (
                  <div
                    className="rounded-lg border px-4 py-3 mb-3"
                    style={{ borderColor: v.color, background: `color-mix(in srgb, ${v.color} 7%, transparent)` }}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span style={{ fontSize: 11, color: 'var(--color-ink-tertiary)' }}>You committed to</span>
                      <strong style={{ fontSize: 13, color: 'var(--color-ink-primary)' }}>{prediction[0]}</strong>
                      {confPct != null && (
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700,
                          padding: '1px 6px', borderRadius: 4, color: v.color,
                          background: `color-mix(in srgb, ${v.color} 14%, transparent)`,
                        }}>{confPct}%</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1">
                      <span style={{ fontSize: 11, color: 'var(--color-ink-tertiary)' }}>The answer was</span>
                      <strong style={{ fontSize: 13, color: 'var(--color-ink-primary)' }}>{caseData.diagnosis}</strong>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: v.color }}>
                      {hit ? '✓ ' : '✕ '}{v.label}
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--color-ink-secondary)', lineHeight: 1.6 }}>
                      {v.lesson}
                    </p>
                  </div>
                )
              })()}

              {isFoundations && ps.comparedCount > 0 ? (
                <p style={{ fontSize: 12, color: 'var(--color-ink-secondary)', lineHeight: 1.6 }}>
                  Ranking agreement with the evidence-based order: <strong>{ps.score}/100</strong>
                  {ps.topHit ? ' — your top pick matched the evidence leader.' : ` — after the workup the evidence pointed to ${ps.engineTop}.`}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-ink-secondary)', lineHeight: 1.6 }}>
                  After your workup the evidence-based leader was <strong>{engineTop}</strong>. Here is how the differential actually moved:
                </p>
              )}
              {!isFoundations && (
                <div className="mt-3">
                  <DifferentialBoard
                    priors={caseData.differentialPriors}
                    testImpacts={caseData.testImpacts}
                    orderedTests={Array.from(orderedTests)}
                    correctDiagnosis={caseData.diagnosis}
                    caseDifficulty={caseDifficulty}
                    reveal
                    showHint={false}
                  />
                </div>
              )}
            </div>
          )
        })()}

        {caseData.mechanism && (
          <div className="border-t border-rule px-5 py-4">
            <WhyPanel mechanism={caseData.mechanism} />
          </div>
        )}

        {/* Oral Presentation (Advanced) */}
        {gradingResult.presentation?.scores && (
          <div className="border-t border-rule px-5 py-4">
            <h3 className="font-serif text-sm font-semibold text-ink mb-3">
              Oral Presentation
              <span className="ml-2 font-mono font-normal text-xs text-ink-3">
                {gradingResult.presentation.presentationTotal ?? 0}/100
              </span>
              <span className="ml-2 font-normal text-xs text-ink-3" title="A portion of your presentation score folds into your Advanced mastery for this system.">
                · contributes to mastery
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(
                [
                  ['Accuracy', gradingResult.presentation.scores.accuracy],
                  ['Completeness', gradingResult.presentation.scores.completeness],
                  ['Conciseness', gradingResult.presentation.scores.conciseness],
                  ['Safety', gradingResult.presentation.scores.safety],
                ] as [string, number][]
              ).map(([axis, score]) => {
                const pct = (score / 25) * 100
                const c = pct >= 72 ? 'text-confirmed' : pct >= 48 ? 'text-caution' : 'text-critical'
                return (
                  <div key={axis} className="rounded-lg bg-paper-2 border border-rule px-3 py-2">
                    <div className="text-xs text-ink-3 mb-1">{axis}</div>
                    <span className={'text-base font-semibold font-mono ' + c}>{score}/25</span>
                  </div>
                )
              })}
            </div>
            {gradingResult.presentation.presentationFeedback && (
              <p className="text-sm text-ink-2 leading-relaxed">{gradingResult.presentation.presentationFeedback}</p>
            )}
            {gradingResult.presentation.criticalMisses && gradingResult.presentation.criticalMisses.length > 0 && (
              <div className="mt-3 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-critical mb-2">Critical Misses</div>
                <ul className="space-y-1">
                  {gradingResult.presentation.criticalMisses.map((miss, i) => (
                    <li key={i} className="flex gap-2 text-sm text-critical">
                      <span className="flex-shrink-0">!</span>{miss}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Case Notes */}
        {notes.content.trim() && notes.content !== SOAP_TEMPLATE && (
          <div className="border-t border-rule px-5 py-4">
            <ScorecardNotesPanel content={notes.content} />
          </div>
        )}

        {/* Rate This Case */}
        <div className="border-t border-rule px-5 py-4">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Rate This Case</div>
          {feedbackSubmitted ? (
            <p className="text-sm text-confirmed text-center py-2">Thank you for your feedback!</p>
          ) : (
            <>
              <div className="space-y-3 mb-4">
                {FEEDBACK_DIMS.map(({ key, label }) => {
                  const active = feedbackRatings[key] ?? 0
                  const hov = feedbackHover[key] ?? 0
                  return (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-ink-2 w-40 shrink-0">{label}</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            onMouseEnter={() => setFeedbackHover(h => ({ ...h, [key]: star }))}
                            onMouseLeave={() => setFeedbackHover(h => ({ ...h, [key]: 0 }))}
                            onClick={() => setFeedbackRatings(r => ({ ...r, [key]: star }))}
                            className="text-xl leading-none transition-colors"
                            aria-label={star + ' star'}
                          >
                            <span className={(hov || active) >= star ? 'text-caution' : 'text-ink-3'}>
                              ★
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Any comments or suggestions? (optional)"
                rows={3}
                className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 text-sm text-ink placeholder-ink-3 focus:border-sc-accent focus:outline-none resize-none mb-3"
              />
              <button
                onClick={submitFeedback}
                disabled={!hasAnyRating || feedbackSubmitting}
                className="w-full rounded-md bg-sc-accent px-4 py-2 text-sm font-medium text-white hover:bg-sc-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {feedbackSubmitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </>
          )}
        </div>

        {/* D — Action bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', background: 'var(--color-paper-2)', borderTop: '1px solid var(--color-rule)', borderRadius: '0 0 1rem 1rem', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{ border: '1px solid var(--color-rule)', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--color-ink-2)', textDecoration: 'none', background: 'transparent', display: 'inline-block', lineHeight: '1.4' }}
            className="hover:bg-paper-3 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/history"
            style={{ border: '1px solid var(--color-rule)', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: 'var(--color-ink-2)', textDecoration: 'none', background: 'transparent', display: 'inline-block', lineHeight: '1.4' }}
            className="hover:bg-paper-3 transition-colors"
          >
            Case History
          </Link>
          <button
            onClick={() => generateCase()}
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-foreground)', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', cursor: 'pointer', lineHeight: '1.4' }}
            className="hover:opacity-90 transition-opacity"
          >
            Next case →
          </button>
        </div>

      </div>
    </div>
  )
}

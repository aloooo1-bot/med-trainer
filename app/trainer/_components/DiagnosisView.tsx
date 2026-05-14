import Link from 'next/link'
import { SectionCard } from './SectionCard'
import { ScoreRing, CategoryRow, ScorecardNotesPanel } from './ScoreRing'
import { FeedbackCarousel, type FeedbackSection } from './FeedbackCarousel'
import { DiagnosisInput } from './DiagnosisInput'
import { MicButton } from './MicButton'
import { getRubric, type DimensionKey } from '@/app/grading/rubric'
import { type GradingResult } from '@/app/grading/types'
import { type TimerState, type NotesState, SOAP_TEMPLATE } from '../_lib/types'
import { fmtTime } from '../_lib/useTimer'
import type { CaseData } from '../_lib/types'

export function DiagnosisView({
  caseData, caseDifficulty, resolvedSystem,
  gradingLoading, gradingError, gradingResult,
  userDiagnosis, setUserDiagnosis,
  userPresentation, setUserPresentation,
  timerState, locked,
  expandedCategory, setExpandedCategory,
  feedbackRatings, setFeedbackRatings,
  feedbackHover, setFeedbackHover,
  feedbackText, setFeedbackText,
  feedbackSubmitted, setFeedbackSubmitted,
  feedbackSubmitting, setFeedbackSubmitting,
  notes, setNotes,
  submitDiagnosis, generateCase, orderedTests,
}: {
  caseData: CaseData
  caseDifficulty: string
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
  setNotes: React.Dispatch<React.SetStateAction<NotesState>>
  submitDiagnosis: (overrideDiagnosis?: string, overridePresentation?: string, timedOut?: boolean) => Promise<GradingResult | null>
  generateCase: (overrideSystem?: string, overrideDifficulty?: string, overrideDiagnosis?: string) => Promise<CaseData | null>
  orderedTests: Set<string>
}) {
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

  if (!gradingResult) {
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
            />
          </div>

          {caseDifficulty === 'Clinical' && (
            <div>
              <label className="mb-2 flex items-center justify-between text-sm text-ink-secondary">
                <span>Clinical Reasoning <span className="text-ink-tertiary">(required)</span></span>
                <MicButton
                  onTranscript={text => setUserPresentation(prev => prev ? prev + ' ' + text : text)}
                  paused={timerState.status === 'paused' || gradingLoading || locked}
                  className="py-1"
                />
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

          <button
            onClick={() => submitDiagnosis()}
            disabled={
              !userDiagnosis.trim() ||
              gradingLoading ||
              locked ||
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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-3)', marginBottom: 4 }}>
                {'CASE · ' + (resolvedSystem || 'General') + ' · ' + caseDifficulty}
              </div>
              <div style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 20, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.2 }}>
                {(caseData?.patientInfo?.name ?? '') + (caseData?.patientInfo?.name ? ', ' : '') + (caseData?.patientInfo?.age ?? '') + (caseData?.patientInfo?.gender === 'male' ? 'M' : caseData?.patientInfo?.gender === 'female' ? 'F' : (caseData?.patientInfo?.gender?.charAt(0).toUpperCase() ?? ''))}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-3)', marginBottom: 4 }}>
                SUBMITTED DIAGNOSIS
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <span style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>{userDiagnosis}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: gradingResult.correct ? 'var(--color-confirmed)' : 'var(--color-critical)', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {gradingResult.correct ? '✓' : '✗'}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-3)', marginTop: 10, marginBottom: 4 }}>
                CORRECT DIAGNOSIS
              </div>
              <div style={{ fontFamily: 'Source Serif 4, Georgia, serif', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>
                {caseData?.diagnosis ?? '—'}
              </div>
              {gradingResult.efficiency && (
                <div style={{ fontSize: 11, color: 'var(--color-ink-3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                  {fmtTime(gradingResult.efficiency.elapsedSeconds)}
                </div>
              )}
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
              {gradingResult.efficiency && (<><br/>{caseDifficulty} · {fmtTime(gradingResult.efficiency.elapsedSeconds)}</>)}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex flex-col divide-y divide-rule">
              {gradingResult.dimensions && getRubric(caseDifficulty).map(({ key, label, max }) => {
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
                    expanded={expandedCategory === key}
                    onToggle={() => setExpandedCategory(expandedCategory === key ? null : key)}
                  />
                )
              })}
              {gradingResult.efficiency && (() => {
                const eff = gradingResult.efficiency!
                const pct = (eff.score / 10) * 100
                const barColor = pct >= 80 ? 'bg-confirmed' : pct >= 50 ? 'bg-caution' : 'bg-critical'
                const scoreColor = pct >= 80 ? 'text-confirmed' : pct >= 50 ? 'text-caution' : 'text-critical'
                return (
                  <div className="flex items-center gap-3 px-4 py-3 bg-paper-2">
                    <span className="w-40 shrink-0 text-xs font-medium text-ink-3">Efficiency</span>
                    <div className="flex-1 h-1.5 rounded-full bg-paper-3 overflow-hidden">
                      <div className={'h-full rounded-full ' + barColor} style={{ width: pct + '%' }} />
                    </div>
                    <span className={'w-14 text-right font-mono text-xs tabular-nums ' + scoreColor}>
                      {eff.score}<span className="text-ink-3">/10</span>
                    </span>
                    <span className="text-[10px] text-ink-3 italic whitespace-nowrap">not in /100</span>
                  </div>
                )
              })()}
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
        {((gradingResult.strengths?.length ?? 0) > 0 || gradingResult.efficiency?.score === 10
          || (gradingResult.missedQuestions?.length ?? 0) > 0
          || (gradingResult.teachingPoints?.length ?? 0) > 0) && (
          <div style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 12, paddingBottom: 4, background: 'var(--color-paper)' }}>
            {(() => {
              const strengthsAll = [
                ...(gradingResult.strengths ?? []),
                ...(gradingResult.efficiency?.score === 10 ? ['Completed the case efficiently within the allotted time'] : []),
              ]
              const feedSections: FeedbackSection[] = []
              if (strengthsAll.length > 0) feedSections.push({
                title: 'Strengths', items: strengthsAll, tone: 'confirmed', icon: '✓',
                footer: gradingResult.efficiency?.timedOut ? 'The case timed out before submission. Time management is a clinical skill that improves with practice. Focus on high-yield questions early and order targeted tests rather than a broad workup.' : undefined,
              })
              if ((gradingResult.missedQuestions?.length ?? 0) > 0) feedSections.push({
                title: 'What you missed', items: gradingResult.missedQuestions!, tone: 'caution', icon: '!',
              })
              if ((gradingResult.teachingPoints?.length ?? 0) > 0) feedSections.push({
                title: 'Teaching points', items: gradingResult.teachingPoints!, tone: 'insight', icon: '★',
              })
              return <FeedbackCarousel sections={feedSections} />
            })()}
          </div>
        )}

        {/* Differentials */}
        {gradingResult.differentials?.length > 0 && (
          <div className="border-t border-rule px-5 py-4">
            <h3 className="font-serif text-sm font-semibold text-ink mb-3">Differential Diagnosis Discussion</h3>
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

        {/* Oral Presentation (Advanced) */}
        {gradingResult.presentation?.scores && (
          <div className="border-t border-rule px-5 py-4">
            <h3 className="font-serif text-sm font-semibold text-ink mb-3">
              Oral Presentation
              <span className="ml-2 font-mono font-normal text-xs text-ink-3">
                {gradingResult.presentation.presentationTotal ?? 0}/100
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

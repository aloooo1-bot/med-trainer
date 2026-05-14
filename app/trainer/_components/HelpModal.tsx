import { useEffect } from 'react'

interface HelpSectionItem { heading: string; body: string }
interface HelpEntry { title: string; sections: HelpSectionItem[]; tip: string }

const HELP_CONTENT: Record<string, HelpEntry> = {
  hpi: {
    title: 'History of Present Illness',
    sections: [
      {
        heading: 'What\'s pre-revealed',
        body: 'Patient information and vitals are already displayed. You do not need to ask for them.',
      },
      {
        heading: 'Background history',
        body: 'Past medical history, medications, social history, and family history are locked. Ask the patient about relevant areas in the chat to unlock each field.',
      },
      {
        heading: 'How fields unlock',
        body: 'Fields reveal as you ask relevant questions. The more targeted your questions, the more efficiently the history comes together.',
      },
      {
        heading: 'Why it matters',
        body: 'The HPI sets the clinical context for everything that follows — diagnosis, test selection, and grading all reference back to this stage.',
      },
    ],
    tip: 'Note the chief complaint and vitals before asking any questions — they should guide what you ask first.',
  },
  ros: {
    title: 'Review of Systems',
    sections: [
      {
        heading: 'How ROS unlocks',
        body: 'Each system reveals when you ask the patient about symptoms in that category via the chat. Systems stay locked until you ask.',
      },
      {
        heading: 'Be selective, not exhaustive',
        body: 'Not every system needs review. Targeted questioning is scored higher than a rote checklist of every possible symptom.',
      },
      {
        heading: 'High-yield systems',
        body: 'Neurological and vascular symptoms are commonly missed but frequently change management. Prioritize these when they could be relevant to your working diagnosis.',
      },
    ],
    tip: 'Ask about symptoms that would change your management if present, not every possible symptom.',
  },
  exam: {
    title: 'Physical Examination',
    sections: [
      {
        heading: 'All findings pre-revealed',
        body: 'The complete physical exam is already displayed. No action is required — everything is available from the start.',
      },
      {
        heading: 'How to use it',
        body: 'Read carefully before ordering tests. Exam findings should confirm or challenge your working hypothesis from the HPI.',
      },
      {
        heading: 'What to look for',
        body: 'Vital sign trends, focal vs. diffuse findings, and lateralizing signs are the most diagnostically useful patterns.',
      },
    ],
    tip: 'The extremities and neurological sections contain the most discriminating findings in most cases.',
  },
  order: {
    title: 'Order Tests',
    sections: [
      {
        heading: 'For This Case section',
        body: 'The top section contains tests specifically relevant to this case and its comorbidities — check here before the standard panels.',
      },
      {
        heading: 'Standard panels',
        body: 'Common laboratory and imaging panels are organized below. Check anything that is clinically indicated.',
      },
      {
        heading: 'Scoring and penalties',
        body: 'You are penalized only for tests that are clearly unnecessary or contraindicated, not for reasonable clinical judgment calls.',
      },
      {
        heading: 'Custom tests',
        body: 'Use the free-text input for anything not in the standard panels — specific cultures, genetic tests, specialist studies, etc.',
      },
    ],
    tip: 'Order the confirmatory test for your working diagnosis plus the tests that would rule out your top differential.',
  },
  results: {
    title: 'Test Results',
    sections: [
      {
        heading: 'Reading results',
        body: 'Abnormal values are flagged. Radiology results appear as structured reports with Findings and Impression sections.',
      },
      {
        heading: 'Missing results',
        body: 'If a test returns no result, use the on-demand generate button to request it.',
      },
      {
        heading: 'Normal results matter',
        body: 'Normal results are clinically meaningful — they help narrow the differential just as much as abnormal ones.',
      },
    ],
    tip: 'A normal result that rules out a dangerous alternative diagnosis is as valuable as an abnormal one.',
  },
  diagnosis: {
    title: 'Diagnosis',
    sections: [
      {
        heading: 'Name the full entity',
        body: 'Your primary diagnosis should name the complete clinical entity — not just the condition, but the qualifier (e.g., "Acute traumatic hemarthrosis with ACL tear" not just "ACL tear").',
      },
      {
        heading: 'Clinical reasoning',
        body: 'Reference specific values from the history, exam, and labs in your reasoning. Vague reasoning scores poorly even when the diagnosis is correct.',
      },
      {
        heading: 'How you\'re graded',
        body: 'The rubric rewards targeted history, selective testing, accurate diagnosis, and complete reasoning. Each dimension carries a fixed point weight.',
      },
    ],
    tip: 'Mention the pathognomonic finding explicitly in your reasoning — the grader looks for it.',
  },
}

export function hasHelpContent(section: string): boolean {
  return section in HELP_CONTENT
}

export function HelpModal({ section, onClose }: { section: string; onClose: () => void }) {
  const content = HELP_CONTENT[section]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!content) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md rounded-xl border border-surface-4 bg-surface-1 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-4 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-primary">How to use: {content.title}</h2>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-tertiary hover:text-ink-primary transition-colors"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {content.sections.map(s => (
            <div key={s.heading}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary-400">{s.heading}</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">{s.body}</p>
            </div>
          ))}
          <div className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
            <div className="mb-1 text-xs font-semibold text-primary-700">Pro tip</div>
            <p className="text-sm text-primary-700 leading-relaxed">{content.tip}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

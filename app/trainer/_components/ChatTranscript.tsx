import { splitStageDirections } from '@/app/lib/transcriptText'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * The interview transcript.
 *
 * Extracted from the panel because the markup had grown three problems at once:
 * prose was set at 11px where every other reading surface in the app uses
 * 13–14px, turns carried no speaker label so a long scrollback was hard to
 * navigate, and newlines collapsed because nothing preserved whitespace.
 */
export function ChatTranscript({
  messages, patientName, loading,
}: {
  messages: TranscriptMessage[]
  patientName?: string
  loading?: boolean
}) {
  return (
    <>
      {messages.map((msg, i) => {
        const isUser = msg.role === 'user'
        // A run of turns from the same speaker only needs one label.
        const showLabel = i === 0 || messages[i - 1].role !== msg.role
        return (
          <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
            {showLabel && (
              <span className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">
                {isUser ? 'You' : patientName || 'Patient'}
              </span>
            )}
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                isUser
                  // text-ink-inverse, NOT text-white: on the dark theme this
                  // surface is #B8C4DE, where white measures 1.75:1 and fails
                  // WCAG AA outright. Every other primary-500 surface in the
                  // app already uses ink-inverse, which measures 11:1.
                  ? 'bg-primary-500 text-ink-inverse'
                  : 'bg-surface-2 text-ink-primary border border-surface-5'
              }`}
            >
              {splitStageDirections(msg.content).map((seg, j) =>
                seg.kind === 'gesture' ? (
                  <em
                    key={j}
                    // Kept visible, not hidden: these are the emotional cues the
                    // communication feedback marks the student on.
                    className={`italic ${isUser ? 'opacity-70' : 'text-ink-secondary'}`}
                  >
                    {seg.text}{' '}
                  </em>
                ) : (
                  <span key={j}>{seg.text}</span>
                ),
              )}
            </div>
          </div>
        )
      })}
      {loading && (
        <div className="flex justify-start">
          <div className="rounded-lg bg-surface-2 border border-surface-5 px-3 py-2">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

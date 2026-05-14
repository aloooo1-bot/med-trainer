import { useEffect } from 'react'
import { useSpeechInput } from '@/app/lib/useSpeechInput'

export function MicButton({
  onTranscript,
  paused = false,
  className = '',
}: {
  onTranscript: (text: string) => void
  paused?: boolean
  className?: string
}) {
  const { listening, supported, startListening, stopListening } = useSpeechInput(onTranscript)

  useEffect(() => {
    if (paused && listening) stopListening()
  }, [paused, listening, stopListening])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={() => (listening ? stopListening() : startListening())}
      disabled={paused}
      title={listening ? 'Stop recording' : 'Dictate'}
      className={`flex-shrink-0 rounded-md border px-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        listening
          ? 'border-critical bg-critical-bg text-critical animate-pulse'
          : 'border-surface-4 bg-surface-2 text-ink-tertiary hover:border-surface-4 hover:text-ink-secondary'
      } ${className}`}
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
      </svg>
    </button>
  )
}

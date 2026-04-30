'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { MEDICAL_CORRECTIONS } from './medicalTermCorrections'

function applyCorrections(text: string): string {
  let result = text
  for (const { heard, correct } of MEDICAL_CORRECTIONS) {
    for (const variant of heard) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), correct)
    }
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & typeof globalThis & Record<string, any>

export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as AnyWindow
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition)
}

export function useSpeechInput(onTranscript: (text: string) => void): {
  listening: boolean
  supported: boolean
  startListening: () => void
  stopListening: () => void
} {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => { onTranscriptRef.current = onTranscript })
  useEffect(() => { setSupported(isSpeechSupported()) }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (!supported || recognitionRef.current) return
    const w = window as AnyWindow
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex]
      if (result?.[0]) {
        const transcript = (result[0].transcript as string).trim()
        if (transcript) onTranscriptRef.current(applyCorrections(transcript))
      }
    }
    recognition.onerror = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [supported])

  return { listening, supported, startListening, stopListening }
}

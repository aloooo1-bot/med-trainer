import { useState, useRef, useEffect } from 'react'
import type { TimerState } from './types'

export function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * One-second advance of the timer state machine. Expiry is a soft deadline:
 * 'expired' keeps ticking elapsedSeconds (overtime) so the student can finish
 * the case; only pause/complete stop the clock.
 */
export function tickTimer(prev: TimerState): TimerState {
  if (prev.status !== 'running' && prev.status !== 'expired') return prev
  const newElapsed = prev.elapsedSeconds + 1
  if (prev.status === 'expired') return { ...prev, elapsedSeconds: newElapsed }
  const newRemaining = prev.remainingSeconds - 1
  if (newRemaining <= 0) return { ...prev, remainingSeconds: 0, elapsedSeconds: newElapsed, status: 'expired' }
  return { ...prev, remainingSeconds: newRemaining, elapsedSeconds: newElapsed }
}

/** A pause taken during overtime resumes back into overtime, not 'running'. */
export function resumedStatus(prev: TimerState): 'running' | 'expired' {
  return prev.totalSeconds > 0 && prev.remainingSeconds <= 0 ? 'expired' : 'running'
}

export function useTimer(onExpire: () => void) {
  const [state, setState] = useState<TimerState>({
    totalSeconds: 0, remainingSeconds: 0, elapsedSeconds: 0, pausedSeconds: 0, status: 'idle',
  })
  const pauseStartRef = useRef<number>(0)
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  useEffect(() => {
    if (state.status !== 'running' && state.status !== 'expired') return
    const id = setInterval(() => setState(tickTimer), 1000)
    return () => clearInterval(id)
  }, [state.status])

  // Fire once per timer run — resuming a pause taken during overtime re-enters
  // 'expired' and must not re-announce the expiry.
  const expireFiredRef = useRef(false)
  useEffect(() => {
    if (state.status === 'expired' && !expireFiredRef.current) {
      expireFiredRef.current = true
      onExpireRef.current()
    }
  }, [state.status])

  const startTimer = (diff: string) => {
    const total = diff === 'Clinical' ? 1320 : diff === 'Advanced' ? 900 : 0
    if (total === 0) return
    expireFiredRef.current = false
    setState({ totalSeconds: total, remainingSeconds: total, elapsedSeconds: 0, pausedSeconds: 0, status: 'running' })
  }
  const pauseTimer = () => {
    pauseStartRef.current = Date.now()
    setState(prev => prev.status === 'running' || prev.status === 'expired' ? { ...prev, status: 'paused' } : prev)
  }
  const resumeTimer = () => {
    setState(prev => {
      if (prev.status !== 'paused') return prev
      const added = Math.round((Date.now() - pauseStartRef.current) / 1000)
      return { ...prev, status: resumedStatus(prev), pausedSeconds: prev.pausedSeconds + added }
    })
  }
  const completeTimer = () => setState(prev => prev.status === 'running' || prev.status === 'paused' || prev.status === 'expired' ? { ...prev, status: 'completed' } : prev)
  const resetTimer   = () => {
    expireFiredRef.current = false
    setState({ totalSeconds: 0, remainingSeconds: 0, elapsedSeconds: 0, pausedSeconds: 0, status: 'idle' })
  }

  return { timerState: state, startTimer, pauseTimer, resumeTimer, completeTimer, resetTimer }
}

import { useState, useRef, useEffect } from 'react'
import type { TimerState } from './types'

export function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function useTimer(onExpire: () => void) {
  const [state, setState] = useState<TimerState>({
    totalSeconds: 0, remainingSeconds: 0, elapsedSeconds: 0, pausedSeconds: 0, status: 'idle',
  })
  const pauseStartRef = useRef<number>(0)
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => {
      setState(prev => {
        if (prev.status !== 'running') return prev
        const newRemaining = prev.remainingSeconds - 1
        const newElapsed = prev.elapsedSeconds + 1
        if (newRemaining <= 0) return { ...prev, remainingSeconds: 0, elapsedSeconds: newElapsed, status: 'expired' }
        return { ...prev, remainingSeconds: newRemaining, elapsedSeconds: newElapsed }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [state.status])

  useEffect(() => {
    if (state.status === 'expired') onExpireRef.current()
  }, [state.status])

  const startTimer = (diff: string) => {
    const total = diff === 'Clinical' ? 1320 : diff === 'Advanced' ? 900 : 0
    if (total === 0) return
    setState({ totalSeconds: total, remainingSeconds: total, elapsedSeconds: 0, pausedSeconds: 0, status: 'running' })
  }
  const pauseTimer = () => {
    pauseStartRef.current = Date.now()
    setState(prev => prev.status === 'running' ? { ...prev, status: 'paused' } : prev)
  }
  const resumeTimer = () => {
    setState(prev => {
      if (prev.status !== 'paused') return prev
      const added = Math.round((Date.now() - pauseStartRef.current) / 1000)
      return { ...prev, status: 'running', pausedSeconds: prev.pausedSeconds + added }
    })
  }
  const completeTimer = () => setState(prev => prev.status === 'running' || prev.status === 'paused' ? { ...prev, status: 'completed' } : prev)
  const resetTimer   = () => setState({ totalSeconds: 0, remainingSeconds: 0, elapsedSeconds: 0, pausedSeconds: 0, status: 'idle' })

  return { timerState: state, startTimer, pauseTimer, resumeTimer, completeTimer, resetTimer }
}

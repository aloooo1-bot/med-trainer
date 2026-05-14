'use client'
import { useEffect, useState } from 'react'

export type ChartTheme = {
  inkPrimary: string
  inkSecondary: string
  inkTertiary: string
  primary: string
  surfaceFaint: string
  gridLine: string
  critical: string
  caution: string
  confirmed: string
  insight: string
  purple: string
  isDark: boolean
}

function read(): ChartTheme {
  if (typeof window === 'undefined') {
    return {
      inkPrimary: '#16201F', inkSecondary: '#4A5856', inkTertiary: '#7A8786',
      primary: '#131C28', surfaceFaint: '#EFEAE0', gridLine: 'rgba(22,32,31,0.06)',
      critical: '#B43B3B', caution: '#B8862E', confirmed: '#2D7A4A',
      insight: '#4A5856', purple: '#7A6A95', isDark: false,
    }
  }
  const cs = getComputedStyle(document.documentElement)
  const isDark = document.documentElement.classList.contains('scheme-dark')
  return {
    inkPrimary:   cs.getPropertyValue('--color-ink-primary').trim()   || '#16201F',
    inkSecondary: cs.getPropertyValue('--color-ink-secondary').trim() || '#4A5856',
    inkTertiary:  cs.getPropertyValue('--color-ink-tertiary').trim()  || '#7A8786',
    primary:      cs.getPropertyValue('--color-primary').trim()       || '#131C28',
    surfaceFaint: cs.getPropertyValue('--color-surface-3').trim()     || '#E4DED1',
    gridLine:     isDark ? 'rgba(255,255,255,0.06)' : 'rgba(22,32,31,0.06)',
    critical:     cs.getPropertyValue('--color-critical').trim()      || '#B43B3B',
    caution:      cs.getPropertyValue('--color-caution').trim()       || '#B8862E',
    confirmed:    cs.getPropertyValue('--color-confirmed').trim()     || '#2D7A4A',
    insight:      cs.getPropertyValue('--color-insight').trim()       || '#4A5856',
    purple:       isDark ? '#A695C2' : '#7A6A95',
    isDark,
  }
}

export function useChartTheme(): ChartTheme {
  const [t, setT] = useState<ChartTheme>(read)
  useEffect(() => {
    const update = () => setT(read())
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return t
}

const KEY = 'medtrainer_color_scheme'
export type Scheme = 'light' | 'dark' | 'auto'
export type EffectiveScheme = 'light' | 'dark'

export function getScheme(): Scheme {
  if (typeof window === 'undefined') return 'auto'
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto'
  } catch { return 'auto' }
}

export function setScheme(s: Scheme): void {
  try { window.localStorage.setItem(KEY, s) } catch {}
  applyScheme(s)
}

export function resolveScheme(s: Scheme): EffectiveScheme {
  if (s !== 'auto') return s
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyScheme(s: Scheme): void {
  const eff = resolveScheme(s)
  document.documentElement.classList.toggle('scheme-dark', eff === 'dark')
}

export function subscribeOSChanges(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

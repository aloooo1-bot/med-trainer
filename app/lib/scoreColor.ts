export function scoreColor(score: number): string {
  if (score < 60) return 'var(--red)'
  if (score < 75) return 'var(--amber)'
  return 'var(--green)'
}

export function scoreClass(score: number): string {
  if (score < 60) return 'score-red'
  if (score < 75) return 'score-amber'
  return 'score-green'
}

export function fractionToPercent(fraction: string): number {
  const [a, b] = fraction.split('/').map(Number)
  if (!b) return 0
  return Math.round((a / b) * 100)
}

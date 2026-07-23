const DAY_MS = 86_400_000

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Which x-axis indices get a date label: the first point, then the first point
 * of each new day at least `gapDays` after the last labeled one. Keeps the
 * axis readable when many cases share a date or cluster on consecutive days.
 */
export function dateTickIndices(items: { completed_at: string }[], gapDays = 2): Set<number> {
  const shown = new Set<number>()
  let last: number | null = null
  items.forEach((item, i) => {
    const day = new Date(item.completed_at).setHours(0, 0, 0, 0)
    if (last === null || day - last >= gapDays * DAY_MS) {
      shown.add(i)
      last = day
    }
  })
  return shown
}

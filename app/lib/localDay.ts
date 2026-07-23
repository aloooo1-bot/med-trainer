/**
 * Canonical local-calendar-day key (YYYY-MM-DD in the user's timezone).
 *
 * Every feature that buckets sessions by "day" — the training-activity
 * calendar, the weekly goal strip, the study streak, the recall streak, and
 * the /history?date= deep link — must use this same key so a case completed
 * at 11pm lands on the same day everywhere.
 */
export function localDayKey(input: Date | number | string): string {
  const d = new Date(input)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The local-day key N days before the given moment. */
export function localDayKeyOffset(from: Date | number, daysBack: number): string {
  const d = new Date(from)
  d.setDate(d.getDate() - daysBack)
  return localDayKey(d)
}

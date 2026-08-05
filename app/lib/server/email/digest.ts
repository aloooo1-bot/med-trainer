import type { EmailMessage } from './send'

/**
 * Notification content. Pure: takes already-queried numbers and returns a
 * message, or null when there is nothing worth sending.
 *
 * The null cases matter more than the copy. Mailing a dormant user a summary
 * of a week in which they did nothing is spam, and it is the fastest way to
 * train people to ignore — or report — everything you send.
 */

export interface WeeklyStats {
  casesThisWeek: number
  casesLastWeek: number
  /** Mean rubric score across this week's cases, or null when none. */
  avgScore: number | null
  weakestSystem: { system: string; avgScore: number } | null
  dueCards: number
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://medtrainer.app'

function shell(bodyLines: string[], unsubscribeUrl?: string, unsubLabel = 'Unsubscribe'): string {
  const paras = bodyLines.map(l => `<p style="margin:0 0 12px">${l}</p>`).join('')
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#16201F;max-width:520px">
${paras}
<p style="margin:24px 0 0"><a href="${APP_URL()}/trainer" style="color:#131C28;font-weight:600">Start a case →</a></p>
${unsubscribeUrl ? `<p style="margin:28px 0 0;font-size:12px;color:#7A8786">${unsubLabel}: <a href="${unsubscribeUrl}" style="color:#7A8786">one click, no sign-in needed</a>.</p>` : ''}
</div>`
}

/** Weekly progress summary. Null when the week holds nothing to report. */
export function buildWeeklySummary(
  firstName: string,
  s: WeeklyStats,
  unsubscribeUrl?: string,
): EmailMessage | null {
  // Nothing this week AND nothing last week — this person is dormant. A
  // reminder may still be appropriate; a "summary" of zero is not.
  if (s.casesThisWeek === 0 && s.casesLastWeek === 0) return null

  const delta = s.casesThisWeek - s.casesLastWeek
  const trend = delta > 0 ? `up ${delta} from last week`
    : delta < 0 ? `down ${Math.abs(delta)} from last week`
    : 'the same as last week'

  const lines = [
    `Hi ${firstName},`,
    s.casesThisWeek > 0
      ? `You completed <strong>${s.casesThisWeek} case${s.casesThisWeek === 1 ? '' : 's'}</strong> this week — ${trend}.`
      : `You didn't complete any cases this week, after ${s.casesLastWeek} the week before.`,
    ...(s.avgScore != null ? [`Your average rubric score was <strong>${s.avgScore}/100</strong>.`] : []),
    ...(s.weakestSystem
      ? [`Weakest area right now: <strong>${s.weakestSystem.system}</strong> (${s.weakestSystem.avgScore}/100). Worth a case or two.`]
      : []),
    ...(s.dueCards > 0
      ? [`<strong>${s.dueCards} recall card${s.dueCards === 1 ? '' : 's'}</strong> are due for review.`]
      : []),
  ]

  const text = lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n\n')
    + `\n\nStart a case: ${APP_URL()}/trainer`
    + (unsubscribeUrl ? `\n\nUnsubscribe from weekly summaries: ${unsubscribeUrl}` : '')

  return {
    to: '', // filled by the caller
    subject: s.casesThisWeek > 0
      ? `Your week: ${s.casesThisWeek} case${s.casesThisWeek === 1 ? '' : 's'}${s.avgScore != null ? `, ${s.avgScore}/100 average` : ''}`
      : 'Your week on MedTrainer',
    text,
    html: shell(lines, unsubscribeUrl, 'Unsubscribe from weekly summaries'),
    unsubscribeUrl,
  }
}

/** Minimum idle days before a nudge is warranted. */
export const REMINDER_AFTER_DAYS = 5
/** Past this we stop nudging — they have moved on, and we are not a stalker. */
export const REMINDER_GIVE_UP_DAYS = 45

/**
 * Idle nudge. Null unless the user has actually trained before and has been
 * away long enough to notice, but not so long that mail is unwelcome.
 */
export function buildReminder(
  firstName: string,
  daysSinceLastCase: number | null,
  dueCards: number,
  unsubscribeUrl?: string,
): EmailMessage | null {
  if (daysSinceLastCase == null) return null // never trained — nothing to resume
  if (daysSinceLastCase < REMINDER_AFTER_DAYS) return null
  if (daysSinceLastCase > REMINDER_GIVE_UP_DAYS) return null

  const lines = [
    `Hi ${firstName},`,
    `It's been <strong>${daysSinceLastCase} days</strong> since your last case.`,
    ...(dueCards > 0
      ? [`You have <strong>${dueCards} recall card${dueCards === 1 ? '' : 's'}</strong> due — spaced repetition works best when you don't let them pile up.`]
      : [`A single case takes about ten minutes.`]),
  ]

  const text = lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n\n')
    + `\n\nStart a case: ${APP_URL()}/trainer`
    + (unsubscribeUrl ? `\n\nUnsubscribe from reminders: ${unsubscribeUrl}` : '')

  return {
    to: '',
    subject: dueCards > 0 ? `${dueCards} card${dueCards === 1 ? '' : 's'} waiting for you` : 'Ready for another case?',
    text,
    html: shell(lines, unsubscribeUrl, 'Unsubscribe from reminders'),
    unsubscribeUrl,
  }
}

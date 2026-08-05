import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWeeklySummary, buildReminder, REMINDER_AFTER_DAYS, REMINDER_GIVE_UP_DAYS,
  type WeeklyStats,
} from '../digest'

const stats = (over: Partial<WeeklyStats> = {}): WeeklyStats => ({
  casesThisWeek: 4, casesLastWeek: 2, avgScore: 78,
  weakestSystem: { system: 'Renal', avgScore: 61 }, dueCards: 3, ...over,
})

// The null cases are the point: mail nobody wants is the fastest way to get
// every later message ignored or reported.

test('no weekly summary for a dormant user', () => {
  assert.equal(buildWeeklySummary('Sam', stats({ casesThisWeek: 0, casesLastWeek: 0, avgScore: null })), null)
})

test('a summary is still sent for a week that lapsed after activity', () => {
  const msg = buildWeeklySummary('Sam', stats({ casesThisWeek: 0, casesLastWeek: 5, avgScore: null }))
  assert.ok(msg)
  assert.match(msg.text, /didn't complete any cases this week/)
})

test('summary reports the week-over-week direction', () => {
  assert.match(buildWeeklySummary('Sam', stats({ casesThisWeek: 5, casesLastWeek: 2 }))!.text, /up 3 from last week/)
  assert.match(buildWeeklySummary('Sam', stats({ casesThisWeek: 1, casesLastWeek: 4 }))!.text, /down 3 from last week/)
  assert.match(buildWeeklySummary('Sam', stats({ casesThisWeek: 3, casesLastWeek: 3 }))!.text, /the same as last week/)
})

test('summary omits sections it has no data for', () => {
  const msg = buildWeeklySummary('Sam', stats({ avgScore: null, weakestSystem: null, dueCards: 0 }))!
  assert.doesNotMatch(msg.text, /average rubric score/)
  assert.doesNotMatch(msg.text, /Weakest area/)
  assert.doesNotMatch(msg.text, /recall card/)
})

test('every summary carries a plain-text body with no markup', () => {
  const msg = buildWeeklySummary('Sam', stats())!
  assert.ok(msg.text.length > 0)
  assert.doesNotMatch(msg.text, /<[a-z/]/i)
})

test('no reminder for someone who has never trained', () => {
  assert.equal(buildReminder('Sam', null, 0), null)
})

test('no reminder before the idle threshold', () => {
  assert.equal(buildReminder('Sam', REMINDER_AFTER_DAYS - 1, 2), null)
  assert.ok(buildReminder('Sam', REMINDER_AFTER_DAYS, 2))
})

test('reminders stop once someone has clearly moved on', () => {
  assert.ok(buildReminder('Sam', REMINDER_GIVE_UP_DAYS, 0))
  assert.equal(buildReminder('Sam', REMINDER_GIVE_UP_DAYS + 1, 0), null)
})

test('reminder leads with due cards when there are any', () => {
  assert.match(buildReminder('Sam', 7, 12)!.subject, /12 cards waiting/)
  assert.match(buildReminder('Sam', 7, 0)!.subject, /another case/)
})

test('unsubscribe url is carried into the body and the header field', () => {
  const url = 'https://example.test/api/notifications/unsubscribe?token=abc'
  const msg = buildWeeklySummary('Sam', stats(), url)!
  assert.equal(msg.unsubscribeUrl, url)
  assert.ok(msg.text.includes(url))
  assert.ok(msg.html!.includes(url))
})

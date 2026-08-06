import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CLIENT_REQUEST_TIMEOUT_MS, SERVER_BUDGET_MS, fitsInBudget, remainingBudget } from '../requestBudget'

/**
 * Both timeout bugs this file guards against were invisible in review because
 * each number was defensible where it was written. What was missing was
 * anything asserting the nesting: an inner budget must fit inside the outer
 * bound that contains it.
 *
 * These read the real source files rather than restating their constants,
 * because a test that copies the number it is checking cannot fail.
 */

const root = path.join(process.cwd(), 'app')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')
const ms = (src: string, re: RegExp): number => {
  const m = src.match(re)
  assert.ok(m, `could not read a value for ${re}`)
  return Number(m![1].replace(/_/g, ''))
}

test('the server budget leaves the client room to receive the response', () => {
  assert.ok(SERVER_BUDGET_MS < CLIENT_REQUEST_TIMEOUT_MS, 'server must finish before the client gives up')
  assert.ok(CLIENT_REQUEST_TIMEOUT_MS - SERVER_BUDGET_MS >= 10_000, 'too little room to serialise and respond')
})

test('no model task may outlast the request it runs inside', () => {
  // case_generation was set to 175s against a 120s SDK client timeout, so every
  // generation slower than 120s aborted and restarted. Nothing caught it.
  const llm = read('lib/server/llm.ts')
  for (const [, literal] of llm.matchAll(/^\s+(?:case_generation|grading|case_audit): ([0-9_]+),/gm)) {
    assert.ok(
      Number(literal.replace(/_/g, '')) <= SERVER_BUDGET_MS,
      `a task budget of ${literal} exceeds the request budget of ${SERVER_BUDGET_MS}`,
    )
  }
})

test('the SDK client timeout never undercuts the longest task', () => {
  const llm = read('lib/server/llm.ts')
  assert.match(
    llm,
    /timeout: MAX_TASK_TIMEOUT_MS/,
    'the client timeout must be derived from the task map, not hand-written',
  )
  assert.match(llm, /Math\.max\(75_000, \.\.\.Object\.values\(TASK_TIMEOUTS_MS\)\)/)
})

test('grading fits even when it retries and scores the oral presentation', () => {
  // Two 120s attempts plus a 75s oral call is 315s inside a 180s wait. The
  // deadline is what makes the sequence fit, so assert it is actually applied.
  const grade = read('lib/server/gradeService.ts')
  const minAttempt = ms(grade, /MIN_GRADE_ATTEMPT_MS = ([0-9_]+)/)
  const minOral = ms(grade, /MIN_ORAL_MS = ([0-9_]+)/)

  assert.match(grade, /timeoutMs: left\(\)/g, 'each grading call must be capped by what is left')
  assert.equal((grade.match(/timeoutMs: left\(\)/g) ?? []).length, 2, 'both the grade and the oral call')
  assert.ok(minAttempt > 0 && minOral > 0)
  // A step is only started when it could plausibly finish inside what remains.
  assert.ok(minAttempt <= SERVER_BUDGET_MS && minOral <= SERVER_BUDGET_MS)
})

test('every route that calls a model declares a maxDuration above the budget', () => {
  // The platform kills the function regardless of what the code budgets, and
  // an undeclared maxDuration silently inherits whatever the default is.
  for (const route of ['start', 'grade', 'ask', 'order']) {
    const src = read(`api/session/${route}/route.ts`)
    const seconds = ms(src, /export const maxDuration = (\d+)/)
    assert.ok(
      seconds * 1000 > SERVER_BUDGET_MS,
      `/api/session/${route} would be killed at ${seconds}s, inside its own ${SERVER_BUDGET_MS / 1000}s budget`,
    )
  }
})

test('the client wait is declared once and imported, not repeated', () => {
  const api = read('trainer/_lib/sessionApi.ts')
  assert.match(api, /AbortSignal\.timeout\(CLIENT_REQUEST_TIMEOUT_MS\)/)
  assert.equal(/AbortSignal\.timeout\(\s*\d/.test(api), false, 'no bare literal wait')
})

test('budget arithmetic', () => {
  assert.equal(remainingBudget(0), SERVER_BUDGET_MS)
  assert.equal(remainingBudget(SERVER_BUDGET_MS + 5_000), 0, 'never negative')
  assert.equal(fitsInBudget(0, SERVER_BUDGET_MS), true, 'exactly filling it fits')
  assert.equal(fitsInBudget(1, SERVER_BUDGET_MS), false)
  assert.equal(fitsInBudget(SERVER_BUDGET_MS - 30_000, 30_000), true)
  assert.equal(fitsInBudget(SERVER_BUDGET_MS - 29_000, 30_000), false)
})

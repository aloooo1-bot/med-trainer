/**
 * One place that says how long a /api/session/* request may take.
 *
 * Every timeout bug this codebase has hit was the same shape: a budget chosen
 * locally, sitting inside a bound set somewhere else, with nothing checking the
 * two agreed. Case generation was given 175s inside an SDK client configured
 * for 120s, so every slow generation aborted and restarted. Grading was given
 * two 120s attempts plus a 75s oral call inside a client that gives up at 180s.
 *
 * Both numbers were defensible on their own. Neither knew about the other. So
 * the client's wait is declared once here and the server budgets are derived
 * from it, rather than each being sized in the file that happens to use it.
 *
 * Pure and framework-free: imported by client code and server code alike.
 */

/** How long the browser waits for a session API response before giving up. */
export const CLIENT_REQUEST_TIMEOUT_MS = 180_000

/**
 * How long the server may spend on one request.
 *
 * The gap covers what the client's clock counts and the server's does not:
 * connection setup, request and response serialisation, and the event-log write
 * that happens after the model work is done. Overrunning it means the student
 * loses a response the server successfully produced.
 */
export const SERVER_BUDGET_MS = CLIENT_REQUEST_TIMEOUT_MS - 15_000

/**
 * Whether an operation that will take `needsMs` still fits.
 *
 * Used to decide whether to start work rather than to abandon it midway —
 * skipping a step cleanly beats being killed partway through one.
 */
export function fitsInBudget(elapsedMs: number, needsMs: number): boolean {
  return elapsedMs + needsMs <= SERVER_BUDGET_MS
}

/** What is left of the budget after `elapsedMs`, never negative. */
export function remainingBudget(elapsedMs: number): number {
  return Math.max(0, SERVER_BUDGET_MS - elapsedMs)
}

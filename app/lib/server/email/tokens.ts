import 'server-only'
import { createToken, verifyToken, type NotificationKind } from './tokenCrypto'

export { PREF_COLUMN, type NotificationKind } from './tokenCrypto'

/**
 * Stateless one-click unsubscribe tokens.
 *
 * HMAC-signed rather than stored, so unsubscribing needs no table and the link
 * keeps working long after the job that sent it. The token names WHICH
 * preference it disables, so a reminder link cannot be replayed to also switch
 * off the weekly summary, and it confers no other authority.
 *
 * A working unsubscribe that does not require signing in is both the legal
 * expectation for bulk mail and the decent thing to do; a signed link is how
 * you offer one safely.
 *
 * This module is the only place the signing secret is read.
 */

function secret(): string | null {
  // Dedicated secret on purpose: signing public URLs with the service-role key
  // would put a database credential into the signing path.
  return process.env.NOTIFICATION_SECRET || null
}

/** Build a token, or null when no signing secret is configured. */
export function createUnsubscribeToken(userId: string, kind: NotificationKind): string | null {
  const key = secret()
  return key ? createToken(userId, kind, key) : null
}

/** Verify a token, returning its claims or null. */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
): { userId: string; kind: NotificationKind } | null {
  const key = secret()
  return key ? verifyToken(token, key) : null
}

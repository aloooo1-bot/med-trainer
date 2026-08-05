import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Signing/verification for unsubscribe links.
 *
 * The signing key is passed in rather than read from the environment: it keeps
 * these functions pure and testable, and it keeps secret handling in exactly
 * one place (tokens.ts, which is server-only).
 */

export type NotificationKind = 'reminders' | 'summary'

export const NOTIFICATION_KINDS: NotificationKind[] = ['reminders', 'summary']

/** Which profile column each preference maps to. */
export const PREF_COLUMN: Record<NotificationKind, 'email_case_reminders' | 'email_weekly_summary'> = {
  reminders: 'email_case_reminders',
  summary: 'email_weekly_summary',
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

export function createToken(userId: string, kind: NotificationKind, key: string): string {
  const payload = `${userId}:${kind}`
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload, key)}`
}

/**
 * Verify a token. Returns null for anything malformed, tampered, or signed
 * with a different key — never throws, whatever arrives in the query string.
 */
export function verifyToken(
  token: string | null | undefined,
  key: string,
): { userId: string; kind: NotificationKind } | null {
  if (typeof token !== 'string' || !key) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null

  let payload: string
  try {
    payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8')
  } catch {
    return null
  }

  const a = Buffer.from(sign(payload, key))
  const b = Buffer.from(token.slice(dot + 1))
  // timingSafeEqual requires equal lengths, so the cheap check comes first.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const sep = payload.lastIndexOf(':')
  if (sep <= 0) return null
  const userId = payload.slice(0, sep)
  const kind = payload.slice(sep + 1) as NotificationKind
  if (!userId || !NOTIFICATION_KINDS.includes(kind)) return null

  return { userId, kind }
}

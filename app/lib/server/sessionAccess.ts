import 'server-only'
import { getSessionUser, unauthorized, type SessionUser } from './auth'
import { getSessionStore, type SessionWithEvents } from './sessionStore'
import { sessionRatelimit } from '../ratelimit'

/**
 * Shared route guard: authenticated user + owned session + per-user rate limit.
 */
export type SessionAccess =
  | { ok: true; user: SessionUser; data: SessionWithEvents }
  | { ok: false; response: Response }

export async function requireOwnSession(sessionId: unknown): Promise<SessionAccess> {
  const user = await getSessionUser()
  if (!user) return { ok: false, response: unauthorized() }

  const { success } = await sessionRatelimit.limit(user.id)
  if (!success) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Too many requests — please wait a moment before trying again.' },
        { status: 429 },
      ),
    }
  }

  if (typeof sessionId !== 'string' || !sessionId) {
    return { ok: false, response: Response.json({ error: 'sessionId is required.' }, { status: 400 }) }
  }
  const store = await getSessionStore()
  const data = await store.get(sessionId)
  if (!data || data.session.userId !== user.id) {
    // 404 for both missing and foreign sessions — don't confirm existence.
    return { ok: false, response: Response.json({ error: 'Session not found.' }, { status: 404 }) }
  }
  return { ok: true, user, data }
}

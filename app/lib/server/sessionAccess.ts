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

export type UserAccess =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response }

/**
 * The half of the guard that costs nothing: authenticated user + rate limit.
 *
 * Split out so a route that only needs a sliver of the session can share the
 * same auth and throttle without paying for a full snapshot + event-log read.
 * Any route using this MUST still check ownership itself — see the exam route,
 * which compares the userId returned by its own narrow read.
 */
export async function requireUser(): Promise<UserAccess> {
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
  return { ok: true, user }
}

/** 404 for both missing and foreign sessions — never confirm existence. */
export function sessionNotFound(): Response {
  return Response.json({ error: 'Session not found.' }, { status: 404 })
}

export function sessionIdRequired(): Response {
  return Response.json({ error: 'sessionId is required.' }, { status: 400 })
}

export async function requireOwnSession(sessionId: unknown): Promise<SessionAccess> {
  const access = await requireUser()
  if (!access.ok) return access
  const { user } = access

  if (typeof sessionId !== 'string' || !sessionId) {
    return { ok: false, response: sessionIdRequired() }
  }
  const store = await getSessionStore()
  const data = await store.get(sessionId)
  if (!data || data.session.userId !== user.id) {
    return { ok: false, response: sessionNotFound() }
  }
  return { ok: true, user, data }
}

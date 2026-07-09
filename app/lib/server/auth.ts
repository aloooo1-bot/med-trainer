import 'server-only'
import { createClient } from '../supabase/server'

export interface SessionUser {
  id: string
  email?: string
}

/**
 * Resolve the authenticated Supabase user for an API route, or null.
 *
 * Dev escape hatch: with the Supabase project unreachable there is no way to
 * authenticate locally, so `DEV_AUTH_BYPASS=1` (honored ONLY in development
 * builds) yields a synthetic local user. Never set it in production.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === '1') {
    return { id: 'dev-local-user', email: 'dev@localhost' }
  }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return { id: user.id, email: user.email ?? undefined }
  } catch {
    // Supabase unreachable → treat as unauthenticated rather than 500.
    return null
  }
}

export function unauthorized(): Response {
  return Response.json({ error: 'Authentication required.' }, { status: 401 })
}

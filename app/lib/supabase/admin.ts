import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Service-role client — bypasses RLS, server-side only.
// NEVER import this in client components or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

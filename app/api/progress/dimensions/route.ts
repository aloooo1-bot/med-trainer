import { createClient } from '@/app/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/progress/dimensions?excludeSessionId=<id>
 *
 * This student's own mean on each rubric dimension, so the scorecard can say
 * whether 15/20 is normal for them. Returns the average FRACTION per key —
 * rubric maxima differ by difficulty, so the caller rescales to the max of the
 * case in front of them.
 *
 * Uses the caller's own Supabase client rather than the admin one: the SQL
 * function is SECURITY INVOKER and scopes on auth.uid(), so RLS is the access
 * control and there is no way to ask for someone else's history.
 *
 * Degrades to an empty list rather than an error — a missing comparison line is
 * a cosmetic loss on a screen whose real content is the grade.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ dimensions: [] })

  const excludeSessionId = new URL(req.url).searchParams.get('excludeSessionId')

  const { data, error } = await supabase.rpc('dimension_averages', {
    exclude_session_id: excludeSessionId,
  })
  if (error) {
    console.warn('[progress/dimensions] rpc failed:', error.message)
    return Response.json({ dimensions: [] })
  }

  return Response.json({ dimensions: data ?? [] })
}

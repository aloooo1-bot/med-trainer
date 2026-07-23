import { createClient } from '@/app/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let id: unknown, bookmarked: unknown
  try {
    ({ id, bookmarked } = await req.json())
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof id !== 'string' || typeof bookmarked !== 'boolean') {
    return Response.json({ error: 'id must be a string and bookmarked a boolean' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('case_sessions')
    .update({ bookmarked })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ ok: true })
}

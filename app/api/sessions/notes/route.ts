import { createClient } from '@/app/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let id: unknown, notes: unknown
  try {
    ({ id, notes } = await req.json())
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof id !== 'string' || typeof notes !== 'string') {
    return Response.json({ error: 'id and notes must be strings' }, { status: 400 })
  }
  if (notes.length > 20_000) {
    return Response.json({ error: 'Notes are limited to 20,000 characters' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('case_sessions')
    .update({ notes })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ ok: true })
}

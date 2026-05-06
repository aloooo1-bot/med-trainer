import { createClient } from '@/app/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, notes }: { id: string; notes: string } = await req.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (supabase as any)
    .from('case_sessions')
    .update({ notes })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id', { count: 'exact', head: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (count === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ ok: true })
}

import { createClient } from '@/app/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('profiles')
    .update({ first_case_completed: true })
    .eq('id', user.id)

  return Response.json({ ok: true })
}

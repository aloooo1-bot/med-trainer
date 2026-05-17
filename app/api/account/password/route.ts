import { createClient } from '@/app/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, password }: { currentPassword: string; password: string } = await req.json()

  if (!currentPassword) {
    return Response.json({ error: 'Current password is required' }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Verify current password before allowing change
  const email = user.email
  if (!email) return Response.json({ error: 'Cannot verify identity' }, { status: 400 })

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (verifyError) {
    return Response.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

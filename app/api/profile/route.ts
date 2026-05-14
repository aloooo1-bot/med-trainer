import { createClient } from '@/app/lib/supabase/server'
import type { ProfileRow } from '@/app/lib/types'

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    display_name?: string
    email_case_reminders?: boolean
    email_weekly_summary?: boolean
    rest_days?: string[]
    weekly_volume?: number
    difficulty_mix?: string
    default_system?: string
  }

  const updates: Partial<ProfileRow> = {}
  if (body.display_name        !== undefined) updates.display_name        = body.display_name
  if (body.email_case_reminders !== undefined) updates.email_case_reminders = body.email_case_reminders
  if (body.email_weekly_summary !== undefined) updates.email_weekly_summary = body.email_weekly_summary
  if (body.rest_days            !== undefined) updates.rest_days            = body.rest_days
  if (body.weekly_volume        !== undefined) updates.weekly_volume        = body.weekly_volume
  if (body.difficulty_mix       !== undefined) updates.difficulty_mix       = body.difficulty_mix
  if (body.default_system       !== undefined) updates.default_system       = body.default_system

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

import { createClient } from '@/app/lib/supabase/server'
import type { ProfileRow } from '@/app/lib/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DIFFICULTY_MIXES = ['balanced', 'foundations-heavy', 'clinical-heavy', 'advanced-heavy']
const MAX_NAME_LEN = 60
const PRO_WEEKLY_CAP = 49

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    display_name?: unknown
    email_case_reminders?: unknown
    email_weekly_summary?: unknown
    rest_days?: unknown
    weekly_volume?: unknown
    difficulty_mix?: unknown
    default_system?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Partial<ProfileRow> = {}

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== 'string') return Response.json({ error: 'display_name must be a string' }, { status: 400 })
    updates.display_name = body.display_name.trim().slice(0, MAX_NAME_LEN)
  }
  if (body.email_case_reminders !== undefined) {
    if (typeof body.email_case_reminders !== 'boolean') return Response.json({ error: 'email_case_reminders must be a boolean' }, { status: 400 })
    updates.email_case_reminders = body.email_case_reminders
  }
  if (body.email_weekly_summary !== undefined) {
    if (typeof body.email_weekly_summary !== 'boolean') return Response.json({ error: 'email_weekly_summary must be a boolean' }, { status: 400 })
    updates.email_weekly_summary = body.email_weekly_summary
  }
  if (body.rest_days !== undefined) {
    if (!Array.isArray(body.rest_days) || body.rest_days.some(d => typeof d !== 'string' || !WEEKDAYS.includes(d))) {
      return Response.json({ error: 'rest_days must be an array of weekday names' }, { status: 400 })
    }
    updates.rest_days = [...new Set(body.rest_days as string[])]
  }
  if (body.difficulty_mix !== undefined) {
    if (typeof body.difficulty_mix !== 'string' || !DIFFICULTY_MIXES.includes(body.difficulty_mix)) {
      return Response.json({ error: 'difficulty_mix must be one of: ' + DIFFICULTY_MIXES.join(', ') }, { status: 400 })
    }
    updates.difficulty_mix = body.difficulty_mix
  }
  if (body.default_system !== undefined) {
    if (typeof body.default_system !== 'string') return Response.json({ error: 'default_system must be a string' }, { status: 400 })
    updates.default_system = body.default_system.trim().slice(0, MAX_NAME_LEN)
  }
  if (body.weekly_volume !== undefined) {
    if (typeof body.weekly_volume !== 'number' || !Number.isFinite(body.weekly_volume)) {
      return Response.json({ error: 'weekly_volume must be a number' }, { status: 400 })
    }
    // The free-tier cap (2 cases per active day, max 14/week) is enforced here
    // too — the client-side clamp alone is bypassable via a direct PATCH.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tier, rest_days')
      .eq('id', user.id)
      .single()
    if (profileError || !profile) {
      // Fail closed: without a confirmed tier we can't clamp correctly, and
      // assuming free would silently shrink a Pro user's goal.
      return Response.json({ error: 'Could not verify plan tier — try again' }, { status: 500 })
    }
    const restDays = (updates.rest_days ?? (profile?.rest_days as string[] | null) ?? []).length
    const activeDays = Math.max(0, 7 - restDays)
    const cap = profile?.tier === 'pro' ? PRO_WEEKLY_CAP : Math.min(14, activeDays * 2)
    updates.weekly_volume = Math.min(Math.max(1, Math.floor(body.weekly_volume)), Math.max(1, cap))
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  // Echo what was actually stored so the client can adopt server-side clamps
  // (e.g. weekly_volume) instead of keeping the value it sent.
  return Response.json({ ok: true, stored: updates })
}

import { createClient } from '@/app/lib/supabase/server'
import { cookies } from 'next/headers'

const ANON_COOKIE = 'anon_case_used'
const FREE_DAILY_LIMIT = 2

export async function GET() {
  if (process.env.NEXT_PUBLIC_DEV_TIER === 'pro') {
    return Response.json({ tier: 'pro', firstCaseDone: true })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const cookieStore = await cookies()
    const used = cookieStore.get(ANON_COOKIE)?.value === '1'
    return Response.json({ tier: 'anonymous', casesLeft: used ? 0 : 1, firstCaseDone: false })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('tier, cases_used_today, cases_today_reset_at, first_case_completed')
    .eq('id', user.id)
    .single()

  if (!profile) return Response.json({ tier: 'free', casesLeft: FREE_DAILY_LIMIT, firstCaseDone: false })

  const tier: 'free' | 'pro' = profile.tier ?? 'free'
  if (tier === 'pro') return Response.json({ tier: 'pro', firstCaseDone: true })

  const lastReset = new Date(profile.cases_today_reset_at)
  const now = new Date()
  const sameDay =
    lastReset.getUTCFullYear() === now.getUTCFullYear() &&
    lastReset.getUTCMonth() === now.getUTCMonth() &&
    lastReset.getUTCDate() === now.getUTCDate()

  const usedToday = sameDay ? (profile.cases_used_today ?? 0) : 0

  return Response.json({
    tier: 'free',
    casesLeft: Math.max(0, FREE_DAILY_LIMIT - usedToday),
    firstCaseDone: profile.first_case_completed ?? false,
  })
}

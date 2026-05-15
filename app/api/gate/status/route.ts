import { createClient } from '@/app/lib/supabase/server'
import { ANON_CASE_IDS, ANON_CASE_LIMIT } from '@/app/lib/anonymousCases'
import { cookies } from 'next/headers'

const ANON_COOKIE = 'anon_cases_used'
const FREE_DAILY_LIMIT = 2

export async function GET() {
  const devTier = process.env.NEXT_PUBLIC_DEV_TIER
  if (devTier === 'pro') {
    return Response.json({ tier: 'pro', firstCaseDone: true })
  }
  if (devTier === 'anonymous') {
    const cookieStore = await cookies()
    const used = parseInt(cookieStore.get(ANON_COOKIE)?.value ?? '0', 10)
    const casesLeft = Math.max(0, ANON_CASE_LIMIT - used)
    return Response.json({
      tier: 'anonymous',
      casesLeft,
      firstCaseDone: false,
      ...(used < ANON_CASE_LIMIT ? { nextCaseId: ANON_CASE_IDS[used] } : {}),
    })
  }
  if (devTier === 'free') {
    return Response.json({ tier: 'free', casesLeft: FREE_DAILY_LIMIT, firstCaseDone: false })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const cookieStore = await cookies()
    const used = parseInt(cookieStore.get(ANON_COOKIE)?.value ?? '0', 10)
    const casesLeft = Math.max(0, ANON_CASE_LIMIT - used)
    return Response.json({
      tier: 'anonymous',
      casesLeft,
      firstCaseDone: false,
      ...(used < ANON_CASE_LIMIT ? { nextCaseId: ANON_CASE_IDS[used] } : {}),
    })
  }

  const { data: profile } = await supabase
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

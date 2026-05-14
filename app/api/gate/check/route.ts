import { createClient } from '@/app/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ANON_COOKIE = 'anon_case_used'
const FREE_DAILY_LIMIT = 2

export async function POST() {
  // Dev override — set NEXT_PUBLIC_DEV_TIER=pro in .env.local to bypass gating locally
  if (process.env.NEXT_PUBLIC_DEV_TIER === 'pro') {
    return NextResponse.json({ allowed: true, tier: 'pro', firstCaseDone: true })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Anonymous ─────────────────────────────────────────────────────────────
  if (!user) {
    const cookieStore = await cookies()
    const used = cookieStore.get(ANON_COOKIE)?.value === '1'
    if (used) {
      return NextResponse.json({
        allowed: false,
        reason: 'anon_used',
        tier: 'anonymous',
      })
    }
    const res = NextResponse.json({
      allowed: true,
      tier: 'anonymous',
      casesLeft: 0,   // After this one there are none left
      firstCaseDone: false,
    })
    res.cookies.set(ANON_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return res
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('tier, cases_used_today, cases_today_reset_at, first_case_completed')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ allowed: false, reason: 'profile_missing', tier: 'free' }, { status: 500 })
  }

  const tier: 'free' | 'pro' = profile.tier ?? 'free'

  // Pro users always allowed
  if (tier === 'pro') {
    return NextResponse.json({
      allowed: true,
      tier: 'pro',
      firstCaseDone: profile.first_case_completed ?? false,
    })
  }

  // ── Free tier — check and reset daily counter ──────────────────────────────
  const lastReset = new Date(profile.cases_today_reset_at)
  const now = new Date()
  const sameDay =
    lastReset.getUTCFullYear() === now.getUTCFullYear() &&
    lastReset.getUTCMonth() === now.getUTCMonth() &&
    lastReset.getUTCDate() === now.getUTCDate()

  let usedToday: number = sameDay ? (profile.cases_used_today ?? 0) : 0

  if (usedToday >= FREE_DAILY_LIMIT) {
    return NextResponse.json({
      allowed: false,
      reason: 'daily_limit',
      tier: 'free',
      casesLeft: 0,
      firstCaseDone: profile.first_case_completed ?? false,
    })
  }

  // Increment counter (reset date if new day)
  const updatePayload = sameDay
    ? { cases_used_today: usedToday + 1 }
    : { cases_used_today: 1, cases_today_reset_at: now.toISOString() }

  await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', user.id)

  usedToday += 1

  return NextResponse.json({
    allowed: true,
    tier: 'free',
    casesLeft: FREE_DAILY_LIMIT - usedToday,
    firstCaseDone: profile.first_case_completed ?? false,
  })
}

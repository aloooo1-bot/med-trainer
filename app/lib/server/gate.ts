import 'server-only'
import { createClient } from '../supabase/server'
import type { SessionUser } from './auth'

const FREE_DAILY_LIMIT = 2

export interface GateDecision {
  allowed: boolean
  tier: 'free' | 'pro'
  casesLeft?: number
  firstCaseDone: boolean
  reason?: string
}

/**
 * Consume one case slot for an authenticated user (dev override respected).
 * Session routes require auth, so the anonymous cookie tier never reaches here.
 */
export async function consumeCaseQuota(user: SessionUser): Promise<GateDecision> {
  const devTier = process.env.NEXT_PUBLIC_DEV_TIER
  if (devTier === 'pro') return { allowed: true, tier: 'pro', firstCaseDone: true }
  if (devTier === 'free') return { allowed: true, tier: 'free', casesLeft: FREE_DAILY_LIMIT, firstCaseDone: false }
  if (user.id === 'dev-local-user') return { allowed: true, tier: 'pro', firstCaseDone: true }

  try {
    const supabase = await createClient()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('tier, cases_used_today, cases_today_reset_at, first_case_completed')
      .eq('id', user.id)
      .single()
    if (error || !profile) {
      return { allowed: false, tier: 'free', firstCaseDone: false, reason: 'profile_missing' }
    }

    const tier: 'free' | 'pro' = profile.tier ?? 'free'
    if (tier === 'pro') {
      return { allowed: true, tier: 'pro', firstCaseDone: profile.first_case_completed ?? false }
    }

    const lastReset = new Date(profile.cases_today_reset_at)
    const now = new Date()
    const sameDay =
      lastReset.getUTCFullYear() === now.getUTCFullYear() &&
      lastReset.getUTCMonth() === now.getUTCMonth() &&
      lastReset.getUTCDate() === now.getUTCDate()
    let usedToday: number = sameDay ? (profile.cases_used_today ?? 0) : 0

    if (usedToday >= FREE_DAILY_LIMIT) {
      return {
        allowed: false, tier: 'free', casesLeft: 0,
        firstCaseDone: profile.first_case_completed ?? false, reason: 'daily_limit',
      }
    }

    const updatePayload = sameDay
      ? { cases_used_today: usedToday + 1 }
      : { cases_used_today: 1, cases_today_reset_at: now.toISOString() }
    await supabase.from('profiles').update(updatePayload).eq('id', user.id)
    usedToday += 1

    return {
      allowed: true, tier: 'free', casesLeft: FREE_DAILY_LIMIT - usedToday,
      firstCaseDone: profile.first_case_completed ?? false,
    }
  } catch {
    // Supabase unreachable — fail open in dev, closed otherwise.
    if (process.env.NODE_ENV === 'development') {
      return { allowed: true, tier: 'pro', firstCaseDone: true }
    }
    return { allowed: false, tier: 'free', firstCaseDone: false, reason: 'gate_unavailable' }
  }
}

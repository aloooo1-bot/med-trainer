import { createClient } from '@/app/lib/supabase/server'
import { cookies } from 'next/headers'
import Dashboard from './dashboard'
import LandingPage from './components/landing/LandingPage'
import type { GradingResult } from './grading/types'

const ANON_COOKIE = 'anon_case_used'
const FREE_DAILY_LIMIT = 2

async function getHomeData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const cookieStore = await cookies()
    const anonUsed = cookieStore.get(ANON_COOKIE)?.value === '1'
    return { user: null, profile: null, stats: null, anonUsed }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('display_name, tier, cases_used_today, cases_today_reset_at, first_case_completed')
    .eq('id', user.id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = await (supabase as any)
    .from('case_sessions')
    .select('id, score, correct, system, difficulty, completed_at, user_diagnosis, diagnosis, grading_result')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: false })
    .limit(100)

  // Study streak: consecutive UTC days with at least one session
  const sessionDaySet = new Set(
    (sessions ?? []).map((s: { completed_at: string }) => {
      const d = new Date(s.completed_at)
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    })
  )
  let streakDays = 0
  const now = new Date()
  const checkDay = (offset: number) => {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - offset)
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
  }
  const startOffset = sessionDaySet.has(checkDay(0)) ? 0 : sessionDaySet.has(checkDay(1)) ? 1 : null
  if (startOffset !== null) {
    let i = startOffset
    while (sessionDaySet.has(checkDay(i))) { streakDays++; i++ }
  }

  const lastReset = profile?.cases_today_reset_at ? new Date(profile.cases_today_reset_at) : null
  const sameDay = lastReset &&
    lastReset.getUTCFullYear() === now.getUTCFullYear() &&
    lastReset.getUTCMonth() === now.getUTCMonth() &&
    lastReset.getUTCDate() === now.getUTCDate()
  const usedToday = sameDay ? (profile?.cases_used_today ?? 0) : 0
  const casesLeft = profile?.tier === 'pro' ? null : Math.max(0, FREE_DAILY_LIMIT - usedToday)

  return {
    user,
    profile,
    anonUsed: false,
    casesLeft,
    streakDays,
    sessions: (sessions ?? []) as { id: string; score: number; correct: boolean; system: string; difficulty: string; completed_at: string; user_diagnosis: string | null; diagnosis: string; grading_result: GradingResult | null }[],
  }
}

export default async function HomePage() {
  const { user, profile, anonUsed, casesLeft, streakDays, sessions } = await getHomeData()
  if (!user) return <LandingPage anonUsed={anonUsed} />
  return (
    <Dashboard
      displayName={profile?.display_name ?? user.email?.split('@')[0] ?? 'there'}
      tier={profile?.tier ?? 'free'}
      casesLeft={casesLeft ?? null}
      streakDays={streakDays ?? 0}
      sessions={sessions ?? []}
    />
  )
}



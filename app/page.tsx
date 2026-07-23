import { unstable_cache } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { createAdminClient } from '@/app/lib/supabase/admin'
import { cookies } from 'next/headers'
import Dashboard from './dashboard'
import LandingPage from './components/landing/LandingPage'
import type { GradingResult } from './grading/types'

async function fetchDashboardData(userId: string) {
  const supabase = createAdminClient()
  const [profileRes, sessionsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, tier, cases_used_today, cases_today_reset_at, first_case_completed')
      .eq('id', userId)
      .single(),
    supabase
      .from('case_sessions')
      .select('id, score, correct, system, difficulty, completed_at, user_diagnosis, diagnosis, grading_result')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(100),
  ])
  return {
    profile: profileRes.data,
    sessions: sessionsRes.data ?? [],
  }
}

const ANON_COOKIE = 'anon_case_used'

async function getHomeData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const cookieStore = await cookies()
    const anonUsed = cookieStore.get(ANON_COOKIE)?.value === '1'
    return { user: null, profile: null, stats: null, anonUsed }
  }

  const getCached = unstable_cache(
    fetchDashboardData,
    [`dashboard:${user.id}`],
    { tags: [`session:${user.id}`], revalidate: 300 }
  )
  const { profile, sessions: rawSessions } = await getCached(user.id)
  const sessions = rawSessions as { id: string; score: number; correct: boolean; system: string; difficulty: string; completed_at: string; user_diagnosis: string | null; diagnosis: string; grading_result: GradingResult | null }[]

  // The study streak is computed client-side (Dashboard) from local calendar
  // days so it agrees with the activity calendar and weekly goal.
  return {
    user,
    profile,
    anonUsed: false,
    sessions,
  }
}

export default async function HomePage() {
  const { user, profile, anonUsed, sessions } = await getHomeData()
  if (!user) return <LandingPage anonUsed={anonUsed} />
  return (
    <Dashboard
      displayName={profile?.display_name ?? user.email?.split('@')[0] ?? 'there'}
      tier={profile?.tier ?? 'free'}
      sessions={sessions ?? []}
      firstCaseDone={profile?.first_case_completed ?? false}
    />
  )
}



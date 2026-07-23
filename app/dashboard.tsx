'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import '@/app/dashboard.css'
import type { SystemEntry } from '@/app/lib/dashboardData'
import { localDayKey, localDayKeyOffset } from '@/app/lib/localDay'
import type { GradingResult } from '@/app/grading/types'
import Sidebar from '@/app/components/dashboard/Sidebar'
import Topbar from '@/app/components/dashboard/Topbar'
import NextCaseCard from '@/app/components/dashboard/NextCaseCard'
import DueReviewCard from '@/app/components/dashboard/DueReviewCard'
import RecentActivity from '@/app/components/dashboard/RecentActivity'
import WeeklyGoal from '@/app/components/dashboard/WeeklyGoal'
import ActivityCalendar from '@/app/components/progress/ActivityCalendar'
import OnboardingModal from '@/app/components/dashboard/OnboardingModal'

const ONBOARDING_DISMISSED_KEY = 'medtrainer_onboarding_dismissed'

type SessionSummary = {
  id: string; score: number; correct: boolean; system: string; difficulty: string;
  completed_at: string; user_diagnosis: string | null; diagnosis: string;
  grading_result: GradingResult | null;
}

function computeSystems(sessions: SessionSummary[]): SystemEntry[] {
  const map: Record<string, { scoreSum: number; count: number }> = {}
  for (const s of sessions) {
    if (!map[s.system]) map[s.system] = { scoreSum: 0, count: 0 }
    map[s.system].scoreSum += s.score
    map[s.system].count++
  }
  return Object.entries(map).map(([name, { scoreSum, count }]) => ({
    name, count, score: Math.round(scoreSum / count),
  })).sort((a, b) => a.score - b.score)
}

export default function Dashboard({
  displayName, tier, sessions, firstCaseDone,
}: {
  displayName: string; tier: string
  sessions: SessionSummary[]; firstCaseDone?: boolean
}) {
  const router = useRouter()
  const systems: SystemEntry[] = useMemo(() => computeSystems(sessions), [sessions])

  const [showOnboarding, setShowOnboarding] = useState(false)

  // Streak is computed client-side so "a day" means the user's local calendar
  // day, matching the activity calendar and weekly goal. Mount-gated to avoid
  // an SSR/client hydration mismatch around midnight or server-timezone skew.
  const [streakDays, setStreakDays] = useState(0)
  useEffect(() => {
    const days = new Set(sessions.map(s => localDayKey(s.completed_at)))
    const now = new Date()
    let streak = 0
    let offset = days.has(localDayKey(now)) ? 0 : days.has(localDayKeyOffset(now, 1)) ? 1 : -1
    if (offset >= 0) {
      while (days.has(localDayKeyOffset(now, offset))) { streak++; offset++ }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStreakDays(streak)
  }, [sessions])

  useEffect(() => {
    if (firstCaseDone || sessions.length > 0) return
    try {
      // Onboarding visibility depends on localStorage, only readable after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(ONBOARDING_DISMISSED_KEY)) setShowOnboarding(true)
    } catch {}
  }, [firstCaseDone])

  return (
    <div className="dx-root">
      <Sidebar displayName={displayName} tier={tier} activePage="dashboard" />
      <div className="dx-main">
        <Topbar
          streakDays={streakDays}
          onStartTraining={() => router.push('/trainer')}
        />
        <div className="dx-content">
          <NextCaseCard sessions={sessions} systems={systems} />
          <DueReviewCard />
          <div className="dx-grid2">
            <ActivityCalendar sessions={sessions} />
            <WeeklyGoal sessions={sessions} />
          </div>
          <RecentActivity sessions={sessions} />
        </div>
      </div>
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  )
}

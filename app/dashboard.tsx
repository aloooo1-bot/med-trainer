'use client'

import { useMemo, useState, useEffect } from 'react'
import '@/app/dashboard.css'
import { MOCK_SYSTEMS, type SystemEntry } from '@/app/lib/dashboardData'
import type { GradingResult } from '@/app/grading/types'
import Sidebar from '@/app/components/dashboard/Sidebar'
import Topbar from '@/app/components/dashboard/Topbar'
import NextCaseCard from '@/app/components/dashboard/NextCaseCard'
import DueReviewCard from '@/app/components/dashboard/DueReviewCard'
import WeakestSystems from '@/app/components/dashboard/WeakestSystems'
import RecentActivity from '@/app/components/dashboard/RecentActivity'
import WeeklyGoal from '@/app/components/dashboard/WeeklyGoal'
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
  displayName, tier, streakDays, sessions, firstCaseDone,
}: {
  displayName: string; tier: string; casesLeft: number | null; streakDays: number
  sessions: SessionSummary[]; firstCaseDone?: boolean
}) {
  const useLive = sessions.length > 0
  const systems: SystemEntry[] = useMemo(
    () => useLive ? computeSystems(sessions) : MOCK_SYSTEMS,
    [sessions, useLive]
  )

  const [showOnboarding, setShowOnboarding] = useState(false)

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
          onStartTraining={() => { window.location.href = '/trainer' }}
        />
        <div className="dx-content">
          <NextCaseCard sessions={sessions} systems={systems} />
          <DueReviewCard />
          <div className="dx-grid2">
            <WeakestSystems systems={systems} />
            <WeeklyGoal sessions={sessions} />
          </div>
          <RecentActivity sessions={sessions} />
        </div>
      </div>
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  )
}

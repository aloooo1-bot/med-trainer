import { clearAnalytics, clearAbandonedAnalytics } from '@/app/lib/analytics'
import { clearReviewItems, clearMastery, clearCalibration } from '@/app/lib/reasoning/store'

// Keys not owned by a clear* helper. Theme is intentionally NOT cleared —
// it's a device preference, not account data.
const EXTRA_KEYS = [
  'medtrainer_focus_settings',
  'medtrainer_focus_skips',
  'medtrainer_recall_streak',
  'medtrainer_onboarding_dismissed',
]

/**
 * Remove all account-scoped MedTrainer data from this browser. Called on
 * sign-out and account deletion so the next user of a shared device doesn't
 * inherit the previous user's deck, mastery, streaks, or history — and so the
 * delete-account promise ("deletes all your case history") is actually true.
 *
 * Cloud-synced data (case sessions, profile, reasoning state) is unaffected;
 * signing back in restores it.
 */
export function clearAllLocalData(): void {
  clearAnalytics()
  clearAbandonedAnalytics()
  clearReviewItems()
  clearMastery()
  clearCalibration()
  for (const key of EXTRA_KEYS) {
    try { localStorage.removeItem(key) } catch {}
  }
}

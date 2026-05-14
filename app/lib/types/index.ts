/**
 * Canonical domain types for the med-trainer app.
 * Import from here instead of declaring local interface copies.
 */

import type { GradingResult } from '@/app/grading/types'
import type { Tables } from '@/app/lib/supabase/types'

// ── Re-exports from the Supabase schema ───────────────────────────────────────

export type { Tables }
export type CaseRow        = Tables<'cases'>
export type ProfileRow     = Tables<'profiles'>
export type RatingRow      = Tables<'ratings'>
export type CaseReportRow  = Tables<'case_reports'>

// ── Session ───────────────────────────────────────────────────────────────────

// Full session record shape as returned by Supabase (grading_result typed properly).
export type Session = Omit<Tables<'case_sessions'>, 'grading_result' | 'api_calls'> & {
  grading_result: GradingResult | null
  api_calls: unknown
}

// Minimal subset for chart/list components that only need a few fields.
export type SessionSummary = Pick<
  Session,
  'id' | 'score' | 'correct' | 'system' | 'difficulty' | 'completed_at' | 'grading_result'
>

// Minimal profile shape returned by most pages' profile queries.
export type ProfileSummary = Pick<ProfileRow, 'id' | 'display_name' | 'tier' | 'role'>

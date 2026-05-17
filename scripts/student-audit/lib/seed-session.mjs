/**
 * Seeds a case_sessions row directly via Supabase admin client.
 * Used after each solved case to populate the study-tool tabs (History, Progress)
 * with realistic data for the Playwright inspection phase.
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

let _client = null
function getClient() {
  if (_client) return _client
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return _client
}

// Spread sessions over the past 7 days to make the activity calendar non-trivial
let _sessionOffset = 0
function fakeTimestamps(difficulty, caseIndex, total) {
  const daysBack = Math.floor((caseIndex / total) * 7)
  const base = Date.now() - daysBack * 24 * 60 * 60 * 1000
  const elapsed = difficulty === 'Foundations'
    ? 300 + Math.floor(Math.random() * 300)   // 5-10 min
    : difficulty === 'Clinical'
    ? 480 + Math.floor(Math.random() * 420)   // 8-15 min
    : 600 + Math.floor(Math.random() * 600)   // 10-20 min
  const startedAt  = new Date(base - elapsed * 1000).toISOString()
  const completedAt = new Date(base).toISOString()
  return { startedAt, completedAt, elapsed }
}

/**
 * @param {object} opts
 * @param {string} opts.userId      - Supabase auth.users.id of the test user
 * @param {object} opts.caseData    - The generated case object
 * @param {object} opts.transcript  - The full transcript object
 * @param {object} opts.grading     - The grading result
 * @param {number} opts.caseIndex   - 0-based index of this case in the run
 * @param {number} opts.totalCases  - total cases in the run
 * @param {boolean} opts.bookmark   - whether to bookmark this session
 * @param {string|null} opts.notes  - optional notes string
 */
export async function seedSession({ userId, caseData, transcript, grading, caseIndex, totalCases, bookmark = false, notes = '' }) {
  const supabase = getClient()
  const difficulty = transcript.difficulty
  const { startedAt, completedAt, elapsed } = fakeTimestamps(difficulty, caseIndex, totalCases)
  const questionCount = difficulty === 'Foundations' ? 3 : difficulty === 'Clinical' ? 4 : 5

  const row = {
    id: randomUUID(),
    user_id: userId,
    started_at: startedAt,
    completed_at: completedAt,
    system: transcript.system,
    difficulty,
    diagnosis: caseData.diagnosis,
    user_diagnosis: transcript.diagnosis,
    correct: grading.correct,
    score: grading.score,
    question_count: questionCount,
    elapsed_seconds: elapsed,
    total_cost_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    api_calls: [],
    grading_result: grading,
    bookmarked: bookmark,
    notes: notes ?? '',
    parent_session_id: null,
  }

  const { error } = await supabase.from('case_sessions').insert(row)
  if (error) {
    console.warn(`  ⚠ seed_session failed: ${error.message}`)
    return null
  }
  return row.id
}

/**
 * Seed one ratings row for a case (exercises the ratings table).
 */
export async function seedRating({ userId, caseData, transcript, grading }) {
  const supabase = getClient()
  const overallScore = grading.correct ? (Math.random() > 0.5 ? 5 : 4) : (Math.random() > 0.5 ? 3 : 2)

  const row = {
    user_id: userId,
    case_id: null,
    diagnosis: caseData.diagnosis,
    system: transcript.system,
    difficulty: transcript.difficulty,
    patient_name: caseData.patientInfo?.name ?? 'Unknown',
    overall: overallScore,
    clinical_realism: Math.min(5, overallScore + (Math.random() > 0.5 ? 0 : 1)),
    grading_fairness: Math.min(5, overallScore + (Math.random() > 0.5 ? 0 : -1)),
    patient_communication: Math.min(5, overallScore + (Math.random() > 0.5 ? 1 : 0)),
    difficulty_accuracy: Math.min(5, overallScore),
    comment: grading.correct ? 'Good case, clear discriminating findings.' : 'The case could have surfaced the key finding more clearly.',
  }

  const { error } = await supabase.from('ratings').insert(row)
  if (error) console.warn(`  ⚠ seed_rating failed: ${error.message}`)
}

/**
 * Seed one case_reports row (exercises the case_reports table).
 */
export async function seedCaseReport({ userId, caseData, transcript }) {
  const supabase = getClient()

  const row = {
    user_id: userId,
    session_id: null,
    case_id: null,
    system: transcript.system,
    difficulty: transcript.difficulty,
    diagnosis: caseData.diagnosis,
    category: 'other',
    comment: `Audit note: generated case for ${transcript.system} ${transcript.difficulty} — ${caseData.diagnosis}`,
    status: 'open',
  }

  const { error } = await supabase.from('case_reports').insert(row)
  if (error) console.warn(`  ⚠ seed_case_report failed: ${error.message}`)
}

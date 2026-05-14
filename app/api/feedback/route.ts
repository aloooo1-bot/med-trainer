import { createAdminClient } from '@/app/lib/supabase/admin'
import { createClient } from '@/app/lib/supabase/server'
import { feedbackRatelimit } from '@/app/lib/ratelimit'

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false }, { status: 401 })

  // Rate limit by user id
  let rlSuccess = true
  try {
    const { success } = await feedbackRatelimit.limit(user.id)
    rlSuccess = success
  } catch { /* fail open */ }
  if (!rlSuccess) {
    return Response.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { diagnosis, difficulty, system, patientName, ratings, feedback, caseId } = body

    const ratingStr = Object.entries(ratings ?? {})
      .map(([k, v]) => `${k}: ${v}/5`)
      .join(' | ')
    console.log(`
=== CASE FEEDBACK ===
Diagnosis:  ${diagnosis ?? 'unknown'}
System:     ${system ?? 'unknown'}
Difficulty: ${difficulty ?? 'unknown'}
Patient:    ${patientName ?? 'unknown'}
Ratings:    ${ratingStr || '(none)'}
Feedback:   ${feedback?.trim() ? `"${feedback.trim()}"` : '(none)'}
User:       ${user.id}
Timestamp:  ${new Date().toISOString()}
====================`)

    const admin = createAdminClient()
    if (admin) {
      const { error } = await admin.from('ratings').insert({
        user_id:               user.id,
        case_id:               caseId ?? null,
        diagnosis:             diagnosis ?? '',
        system:                system ?? '',
        difficulty:            difficulty ?? '',
        patient_name:          patientName ?? '',
        overall:               ratings?.overall               ?? null,
        clinical_realism:      ratings?.clinicalRealism       ?? null,
        grading_fairness:      ratings?.gradingFairness       ?? null,
        patient_communication: ratings?.patientCommunication  ?? null,
        difficulty_accuracy:   ratings?.difficultyAccuracy    ?? null,
        comment:               feedback?.trim() ?? '',
      })
      if (error) console.error('Supabase insert error:', error.message)
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('Feedback route error:', e)
    return Response.json({ ok: false }, { status: 400 })
  }
}

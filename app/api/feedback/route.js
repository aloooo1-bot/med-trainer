import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { diagnosis, difficulty, system, patientName, ratings, feedback, userId, caseId } = body

    // Log to server console (always)
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
User:       ${userId ?? 'anonymous'}
Timestamp:  ${new Date().toISOString()}
====================`)

    // Persist to Supabase
    const supabase = getAdminClient()
    if (supabase) {
      const { error } = await supabase.from('ratings').insert({
        user_id:               userId ?? null,
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

export async function POST(request) {
  try {
    const body = await request.json()
    const { diagnosis, difficulty, system, patientName, ratings, feedback } = body

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
Timestamp:  ${new Date().toISOString()}
====================`)

    return Response.json({ ok: true })
  } catch (e) {
    console.error('Feedback route error:', e)
    return Response.json({ ok: false }, { status: 400 })
  }
}

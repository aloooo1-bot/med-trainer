import { createClient } from '@/app/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    session_id?: string | null
    case_id?: string | null
    system: string
    difficulty: string
    diagnosis: string
    category: 'incorrect-grading' | 'inaccurate-content' | 'confusing-ui' | 'other'
    comment?: string
  }

  const { error } = await supabase
    .from('case_reports')
    .insert({
      user_id:    user.id,
      session_id: body.session_id ?? null,
      case_id:    body.case_id ?? null,
      system:     body.system,
      difficulty: body.difficulty,
      diagnosis:  body.diagnosis,
      category:   body.category,
      comment:    body.comment ?? '',
    })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

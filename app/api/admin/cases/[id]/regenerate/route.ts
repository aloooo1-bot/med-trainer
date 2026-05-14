import { createAdminClient } from '../../../../../lib/supabase/admin'
import { createClient } from '../../../../../lib/supabase/server'
import { ADMIN_EMAIL } from '../../../../../lib/generators/shared'
import { generateManifest } from '../../../../../lib/generators/manifest'
import { generateLocal, findCombo } from '../../../../../lib/generators/local'
import { NextRequest, NextResponse } from 'next/server'

async function checkAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (user.email !== ADMIN_EMAIL) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const adminClient = createAdminClient()

  interface CaseBasic { id: string; system: string; difficulty: string; diagnosis: string; variant_index: number }

  // Fetch the existing row
  const { data: row, error: fetchError } = await adminClient
    .from('cases')
    .select('id, system, difficulty, diagnosis, variant_index')
    .eq('id', id)
    .single() as unknown as { data: CaseBasic | null; error: { message: string } | null }

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on the server' }, { status: 500 })
  }

  let caseData: Record<string, unknown>

  try {
    if (id.startsWith('img-')) {
      // Image-anchored cases require re-running scripts/image-first-cases.mjs
      return NextResponse.json(
        { error: 'Image-anchored cases (img-*) must be regenerated via scripts/image-first-cases.mjs from the terminal.' },
        { status: 422 }
      )
    } else if (id.startsWith('local-')) {
      // local-{modality}-{category}-{N}
      const parts = id.split('-')
      const modality  = parts[1]
      const category  = parts.slice(2, -1).join('-')
      const combo = findCombo(modality, category)
      if (!combo) {
        return NextResponse.json({ error: `Unknown local combo: ${modality}/${category}` }, { status: 400 })
      }
      caseData = await generateLocal(combo)
    } else {
      // manifest case
      caseData = await generateManifest({
        system:       row.system,
        difficulty:   row.difficulty,
        diagnosis:    row.diagnosis,
        variantIndex: row.variant_index ?? 0,
      })
    }
  } catch (e) {
    const msg = (e instanceof Error) ? e.message : String(e)
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await (adminClient.from('cases') as any)
    .update({ case_data: caseData, is_generated: true, generated_at: new Date().toISOString() })
    .eq('id', id)

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, diagnosis: caseData.diagnosis })
}

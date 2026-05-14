import { after } from 'next/server'
import { createAdminClient } from '../../../../../lib/supabase/admin'
import { createClient } from '../../../../../lib/supabase/server'
import { isAdmin } from '../../../../../lib/generators/shared'
import { regenerateRatelimit } from '../../../../../lib/ratelimit'
import { generateManifest } from '../../../../../lib/generators/manifest'
import { generateLocal, findCombo } from '../../../../../lib/generators/local'
import { NextRequest, NextResponse } from 'next/server'

async function checkAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isAdmin(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.response

  const key = request.headers.get('x-forwarded-for') ?? 'anon'
  let rlSuccess = true
  try {
    const { success } = await regenerateRatelimit.limit(key)
    rlSuccess = success
  } catch { /* fail open */ }
  if (!rlSuccess) {
    return NextResponse.json({ error: 'Too many regeneration requests — please wait a moment.' }, { status: 429 })
  }

  const { id } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on the server' }, { status: 500 })
  }

  if (id.startsWith('img-')) {
    return NextResponse.json(
      { error: 'Image-anchored cases (img-*) must be regenerated via scripts/image-first-cases.mjs from the terminal.' },
      { status: 422 }
    )
  }

  const adminClient = createAdminClient()

  interface CaseBasic { id: string; system: string; difficulty: string; diagnosis: string; variant_index: number }

  const { data: row, error: fetchError } = await adminClient
    .from('cases')
    .select('id, system, difficulty, diagnosis, variant_index')
    .eq('id', id)
    .single() as unknown as { data: CaseBasic | null; error: { message: string } | null }

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  // Insert a pending job row and return immediately — generation runs in the background.
  const { data: job, error: jobErr } = await adminClient
    .from('case_regeneration_jobs')
    .insert({ case_id: id })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Failed to create regeneration job' }, { status: 500 })
  }

  const jobId = job.id as string

  // after() fires after the response is sent. Fluid Compute keeps the function
  // instance alive so this completes even if the client tab closes.
  after(async () => {
    const db = createAdminClient()

    await db.from('case_regeneration_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId)

    try {
      let caseData: Record<string, unknown>

      if (id.startsWith('local-')) {
        const parts = id.split('-')
        const modality = parts[1]
        const category = parts.slice(2, -1).join('-')
        const combo = findCombo(modality, category)
        if (!combo) throw new Error(`Unknown local combo: ${modality}/${category}`)
        caseData = await generateLocal(combo)
      } else {
        caseData = await generateManifest({
          system:       row.system,
          difficulty:   row.difficulty,
          diagnosis:    row.diagnosis,
          variantIndex: row.variant_index ?? 0,
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.from('cases') as any)
        .update({ case_data: caseData, is_generated: true, generated_at: new Date().toISOString() })
        .eq('id', id)

      await db.from('case_regeneration_jobs')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
          result_diagnosis: String(caseData.diagnosis ?? ''),
        })
        .eq('id', jobId)
    } catch (e) {
      await db.from('case_regeneration_jobs')
        .update({
          status: 'error',
          completed_at: new Date().toISOString(),
          error: e instanceof Error ? e.message : String(e),
        })
        .eq('id', jobId)
    }
  })

  return NextResponse.json({ jobId }, { status: 202 })
}

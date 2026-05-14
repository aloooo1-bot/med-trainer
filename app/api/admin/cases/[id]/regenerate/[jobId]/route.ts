import { createAdminClient } from '../../../../../../lib/supabase/admin'
import { createClient } from '../../../../../../lib/supabase/server'
import { isAdmin } from '../../../../../../lib/generators/shared'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, jobId } = await params
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('case_regeneration_jobs')
    .select('status, error, result_diagnosis, started_at')
    .eq('id', jobId)
    .eq('case_id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: data.status,
    error: data.error ?? undefined,
    diagnosis: data.result_diagnosis ?? undefined,
    startedAt: data.started_at ?? undefined,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isAdmin } from '@/app/lib/generators/shared'
import {
  listImages, applyVerdict,
  DATASET_NAMES, type DatasetName, type ReviewAction,
} from '@/app/lib/server/imageReviewStore'
import { VALID_LATERALITY_VALUES, type Laterality } from '@/app/lib/imageAttributes'

export const dynamic = 'force-dynamic'

async function checkAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!isAdmin(user.email)) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { ok: true }
  } catch {
    // Supabase unreachable — allow in dev so the review tool works offline.
    if (process.env.NODE_ENV === 'development') return { ok: true }
    return { ok: false, response: NextResponse.json({ error: 'Auth unavailable' }, { status: 503 }) }
  }
}

function isDataset(v: string | null): v is DatasetName {
  return !!v && (DATASET_NAMES as string[]).includes(v)
}

/** GET /api/admin/images/review?dataset=chest — list images + current review state. */
export async function GET(req: NextRequest) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.response

  const dataset = req.nextUrl.searchParams.get('dataset')
  if (!isDataset(dataset)) {
    return NextResponse.json({ datasets: DATASET_NAMES, images: [] })
  }
  const images = await listImages(dataset)
  return NextResponse.json({ datasets: DATASET_NAMES, dataset, images })
}

/** POST /api/admin/images/review — apply a reviewer verdict. */
export async function POST(req: NextRequest) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null) as
    { dataset?: string; key?: string; action?: string; laterality?: string } | null
  if (!body || !isDataset(body.dataset ?? null) || !body.key) {
    return NextResponse.json({ error: 'dataset and key are required' }, { status: 400 })
  }
  const dataset = body.dataset as DatasetName

  let verdict: ReviewAction
  if (body.action === 'reject') verdict = { action: 'reject' }
  else if (body.action === 'confirm') verdict = { action: 'confirm' }
  else if (body.action === 'edit') {
    if (!VALID_LATERALITY_VALUES.includes(body.laterality as Laterality)) {
      return NextResponse.json({ error: 'edit requires a valid laterality' }, { status: 400 })
    }
    verdict = { action: 'edit', laterality: body.laterality as Laterality }
  } else {
    return NextResponse.json({ error: 'action must be confirm | edit | reject' }, { status: 400 })
  }

  try {
    await applyVerdict(dataset, body.key, verdict)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

import { createClient } from '@/app/lib/supabase/server'
import type { Json } from '@/app/lib/supabase/types'

const KINDS = ['review_items', 'mastery', 'calibration', 'streak'] as const
type Kind = typeof KINDS[number]

// Generous per-kind size ceiling; the deck is capped at 2000 cards client-side.
const MAX_BYTES = 1_500_000

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('reasoning_state')
    .select('kind, data')
    .eq('user_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const states: Partial<Record<Kind, unknown>> = {}
  for (const row of data ?? []) {
    if (KINDS.includes(row.kind as Kind)) states[row.kind as Kind] = row.data
  }
  return Response.json({ states })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { states?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.states || typeof body.states !== 'object') {
    return Response.json({ error: 'states object required' }, { status: 400 })
  }

  const rows: { user_id: string; kind: Kind; data: Json; updated_at: string }[] = []
  for (const [kind, data] of Object.entries(body.states)) {
    if (!KINDS.includes(kind as Kind)) {
      return Response.json({ error: `unknown kind: ${kind}` }, { status: 400 })
    }
    // List kinds are arrays; streak is an object.
    const shapeOk = kind === 'streak'
      ? !!data && typeof data === 'object' && !Array.isArray(data)
      : Array.isArray(data)
    if (!shapeOk) return Response.json({ error: `invalid shape for ${kind}` }, { status: 400 })
    if (JSON.stringify(data).length > MAX_BYTES) {
      return Response.json({ error: `${kind} payload too large` }, { status: 400 })
    }
    rows.push({ user_id: user.id, kind: kind as Kind, data: data as Json, updated_at: new Date().toISOString() })
  }
  if (rows.length === 0) return Response.json({ error: 'No states to store' }, { status: 400 })

  const { error } = await supabase
    .from('reasoning_state')
    .upsert(rows, { onConflict: 'user_id,kind' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/lib/supabase/admin'

// Merges a single test's image results into the case's imaging_cache column.
// Called fire-and-forget from the trainer after Open-i returns results at runtime.
// Silently no-ops if Supabase isn't configured or the case doesn't exist.
export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false })
  }

  try {
    const { id, testName, results } = await req.json() as {
      id: string
      testName: string
      results: unknown[]
    }

    if (!id || !testName || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ ok: false })
    }

    const supabase = createAdminClient()

    // Read-merge-write: add the new test results to the existing cache without
    // overwriting other tests that may have been cached in a concurrent request.
    const { data, error: readErr } = await supabase
      .from('cases')
      .select('imaging_cache')
      .eq('id', id)
      .single() as unknown as {
        data: { imaging_cache: Record<string, unknown> } | null
        error: { message: string } | null
      }

    if (readErr || !data) return NextResponse.json({ ok: false })

    const merged = { ...(data.imaging_cache ?? {}), [testName]: results }

    const { error: writeErr } = await (supabase
      .from('cases')
      .update({ imaging_cache: merged } as never)
      .eq('id', id) as unknown as Promise<{ error: { message: string } | null }>)

    if (writeErr) {
      console.error('cache-imaging write:', writeErr.message)
      return NextResponse.json({ ok: false })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('cache-imaging error:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false })
  }
}

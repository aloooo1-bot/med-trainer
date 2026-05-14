import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/lib/supabase/admin'
import { createClient } from '@/app/lib/supabase/server'

// Merges a single test's image results into the case's imaging_cache column.
// Called fire-and-forget from the trainer after Open-i returns results at runtime.
// Uses a Postgres function (cache_imaging_test) for an atomic single-UPDATE so
// concurrent calls for the same case don't clobber each other's keys.
export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false })
  }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    const { id, testName, results } = await req.json() as {
      id: string
      testName: string
      results: import('@/app/lib/supabase/types').Json[]
    }

    if (!id || !testName || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ ok: false })
    }

    const supabase = createAdminClient()

    const { error } = await supabase.rpc('cache_imaging_test', {
      p_case_id: id,
      p_test_name: testName,
      p_results: results,
    })

    if (error) {
      console.error('cache-imaging rpc:', error.message)
      return NextResponse.json({ ok: false })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('cache-imaging error:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false })
  }
}

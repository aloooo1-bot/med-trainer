import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/lib/supabase/admin'
import { createClient } from '@/app/lib/supabase/server'

// status: 'hit'  = cached case found and returned
// status: 'miss' = slot exists but not yet generated (proceed to Claude)
// status: 'error' = Supabase unreachable or query failed (do NOT fall back to Claude)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  console.log('[/api/cases/lookup] id=', id)
  if (!id) return NextResponse.json({ status: 'miss' })

  // If Supabase isn't configured, treat as miss so the app still works without it
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ status: 'miss' })

  // Cookie-only session check (no network verify) — middleware already refreshed
  // the session, and case_data is not user-specific so a forged cookie can't escalate.
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ status: 'miss' }, { status: 401 })

  try {
    const supabase = createAdminClient()
    const queryPromise = supabase
      .from('cases')
      .select('case_data, is_generated, imaging_cache, verified_images')
      .eq('id', id)
      .single()
    const { data, error } = await Promise.race([
      queryPromise,
      new Promise<{ data: null; error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'lookup-timeout' } }), 8_000)
      ),
    ]) as unknown as {
        data: {
          case_data: Record<string, unknown> | null
          is_generated: boolean
          imaging_cache: Record<string, unknown[]> | null
          verified_images: Record<string, unknown> | null
        } | null
        error: { message: string } | null
      }

    if (error) {
      // Row not found (PGRST116) means the slot was never seeded — treat as miss
      if (error.message.includes('PGRST116') || error.message.toLowerCase().includes('no rows')) {
        return NextResponse.json({ status: 'miss' })
      }
      // Timeout — fall through to live generation
      if (error.message === 'lookup-timeout') {
        console.warn('cases/lookup timed out — returning miss')
        return NextResponse.json({ status: 'miss' })
      }
      console.error('cases/lookup:', error.message)
      return NextResponse.json({ status: 'error', message: error.message }, { status: 500 })
    }

    if (data?.is_generated && data.case_data) {
      // Merge verified_images into imagingCache — verified images take priority (placed first)
      const mergedCache: Record<string, unknown[]> = {}
      for (const [k, v] of Object.entries(data.imaging_cache ?? {})) {
        if (Array.isArray(v)) mergedCache[k] = v
      }
      for (const [testName, img] of Object.entries(data.verified_images ?? {})) {
        const existing = mergedCache[testName] ?? []
        const withoutDup = existing.filter((r: unknown) => (r as Record<string, unknown>).uid !== (img as Record<string, unknown>).uid)
        mergedCache[testName] = [img, ...withoutDup]
      }

      return NextResponse.json({
        status: 'hit',
        caseData: data.case_data,
        imagingCache: mergedCache,
      })
    }
    return NextResponse.json({ status: 'miss' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('cases/lookup threw:', message)
    return NextResponse.json({ status: 'error', message }, { status: 500 })
  }
}

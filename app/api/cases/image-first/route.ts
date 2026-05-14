import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/lib/supabase/admin'
import { createClient } from '@/app/lib/supabase/server'
import type { OpenIResult } from '@/app/lib/imagingSearch'

// Returns a random image-anchored case for the given system + difficulty.
// These cases were generated with image-first-cases.mjs — every one has
// verified_images pre-populated, so the trainer gets a confirmed image immediately.
export async function GET(req: NextRequest) {
  const system     = req.nextUrl.searchParams.get('system')
  const difficulty = req.nextUrl.searchParams.get('difficulty')
  if (!system || !difficulty) return NextResponse.json({ status: 'miss' })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ status: 'miss' })

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ status: 'miss' }, { status: 401 })

  try {
    const supabase = createAdminClient()

    // Fetch a pool of up to 20 matching image-first cases, then pick randomly.
    // This avoids exposing ORDER BY RANDOM() to Postgres on every request.
    const { data, error } = await supabase
      .from('cases')
      .select('id, case_data, verified_images')
      .eq('system', system)
      .eq('difficulty', difficulty)
      .like('id', 'img-%')
      .not('verified_images', 'is', null)
      .eq('is_generated', true)
      .limit(20) as unknown as {
        data: Array<{
          id: string
          case_data: Record<string, unknown>
          verified_images: Record<string, unknown>
        }> | null
        error: { message: string } | null
      }

    if (error) {
      console.error('cases/image-first:', error.message)
      return NextResponse.json({ status: 'miss' })
    }
    if (!data?.length) return NextResponse.json({ status: 'miss' })

    // Random pick from the pool
    const picked = data[Math.floor(Math.random() * data.length)]

    // Build imagingCache from verified_images so the trainer can seed directly
    const imagingCache: Record<string, OpenIResult[]> = {}
    for (const [testName, img] of Object.entries(picked.verified_images ?? {})) {
      imagingCache[testName] = [img as OpenIResult]
    }

    return NextResponse.json({
      status:      'hit',
      caseId:      picked.id,
      caseData:    picked.case_data,
      imagingCache,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('cases/image-first threw:', message)
    return NextResponse.json({ status: 'miss' })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/lib/supabase/admin'

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: false })

  try {
    const { id, system, difficulty, diagnosis, variantIndex, caseData } = await req.json() as {
      id: string
      system?: string
      difficulty?: string
      diagnosis?: string
      variantIndex?: number
      caseData: Record<string, unknown>
    }
    if (!id || !caseData) return NextResponse.json({ ok: false })

    const enrichedCaseData = difficulty && !caseData.nativeDifficulty
      ? { ...caseData, nativeDifficulty: difficulty }
      : caseData

    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('cases')
      .upsert({
        id,
        system:        system ?? '',
        difficulty:    difficulty ?? '',
        diagnosis:     diagnosis ?? '',
        variant_index: variantIndex ?? 0,
        case_data:     enrichedCaseData,
        is_generated:  true,
        generated_at:  new Date().toISOString(),
      }, { onConflict: 'id' })

    if (error) {
      console.error('cases/save:', error.message)
      return NextResponse.json({ ok: false, error: error.message })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}

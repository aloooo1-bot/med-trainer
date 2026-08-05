import { createAdminClient } from '@/app/lib/supabase/admin'
import { sendEmail, activeDriver, canSendEmail } from '@/app/lib/server/email/send'
import { createUnsubscribeToken } from '@/app/lib/server/email/tokens'
import { buildWeeklySummary, buildReminder, type WeeklyStats } from '@/app/lib/server/email/digest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY = 86_400_000

/**
 * POST /api/cron/notifications
 *
 * Scheduler-agnostic: any caller presenting CRON_SECRET works (Vercel Cron
 * sends it as a Bearer token; so can GitHub Actions, Supabase pg_cron, or
 * curl). Nothing here is Vercel-specific.
 *
 * Safety posture, in order:
 *   1. Without CRON_SECRET set, the route refuses to run at all — an
 *      unprotected endpoint that emails your users is not a thing to leave
 *      lying around.
 *   2. Without a mail provider configured, sendEmail's log driver records
 *      instead of sending, so the job can be scheduled and watched first.
 *   3. ?dryRun=1 reports exactly who WOULD be mailed and why, sending nothing
 *      even when a provider is live.
 *
 * Preferences are honoured per kind, and every message carries a signed
 * one-click unsubscribe.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return Response.json(
      { error: 'CRON_SECRET is not configured; refusing to run.' },
      { status: 503 },
    )
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'
  const db = createAdminClient()

  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('id, display_name, email_case_reminders, email_weekly_summary')
    .or('email_case_reminders.eq.true,email_weekly_summary.eq.true')
  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500 })
  }
  if (!profiles?.length) {
    return Response.json({ ok: true, driver: activeDriver(), considered: 0, sent: 0, skipped: 0 })
  }

  // Addresses live in auth.users, not profiles.
  const emailById = new Map<string, string>()
  try {
    const { data: userPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const u of userPage?.users ?? []) if (u.email) emailById.set(u.id, u.email)
  } catch (e) {
    return Response.json({ error: `Could not resolve addresses: ${(e as Error).message}` }, { status: 500 })
  }

  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY).toISOString()
  const twoWeeksAgo = new Date(now - 14 * DAY).toISOString()

  let sent = 0, failed = 0
  const skipped: Record<string, number> = {}
  const wouldSend: Array<{ kind: string; subject: string }> = []
  const bump = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1 }

  for (const p of profiles) {
    const to = emailById.get(p.id)
    if (!to) { bump('no-address'); continue }
    const firstName = (p.display_name ?? '').trim().split(/\s+/)[0] || 'there'

    // Two weeks of rows: enough for this week, last week, and recency.
    const { data: recent } = await db
      .from('case_sessions')
      .select('score, system, completed_at')
      .eq('user_id', p.id)
      .gte('completed_at', twoWeeksAgo)
      .order('completed_at', { ascending: false })

    const { data: lastEver } = await db
      .from('case_sessions')
      .select('completed_at')
      .eq('user_id', p.id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const thisWeek = (recent ?? []).filter(r => r.completed_at >= weekAgo)
    const lastWeek = (recent ?? []).filter(r => r.completed_at < weekAgo)

    // Due recall cards come from the synced reasoning state (migration 0004).
    let dueCards = 0
    try {
      const { data: deck } = await db
        .from('reasoning_state')
        .select('data')
        .eq('user_id', p.id)
        .eq('kind', 'review_items')
        .maybeSingle()
      const items = (deck?.data ?? []) as Array<{ dueAt?: number }>
      if (Array.isArray(items)) dueCards = items.filter(i => typeof i.dueAt === 'number' && i.dueAt <= now).length
    } catch { /* deck is optional context, never a reason to skip the mail */ }

    const bySystem = new Map<string, number[]>()
    for (const r of thisWeek) {
      if (!r.system) continue
      if (!bySystem.has(r.system)) bySystem.set(r.system, [])
      bySystem.get(r.system)!.push(r.score)
    }
    const weakest = [...bySystem.entries()]
      .map(([system, scores]) => ({ system, avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
      .sort((a, b) => a.avgScore - b.avgScore)[0] ?? null

    const stats: WeeklyStats = {
      casesThisWeek: thisWeek.length,
      casesLastWeek: lastWeek.length,
      avgScore: thisWeek.length
        ? Math.round(thisWeek.reduce((a, r) => a + r.score, 0) / thisWeek.length)
        : null,
      weakestSystem: weakest,
      dueCards,
    }

    const daysSince = lastEver?.completed_at
      ? Math.floor((now - new Date(lastEver.completed_at).getTime()) / DAY)
      : null

    // At most ONE message per user per run: a summary if there is one to give,
    // otherwise a nudge. Never both — two emails in a minute reads as broken.
    const candidates: Array<{ kind: 'summary' | 'reminders'; msg: ReturnType<typeof buildWeeklySummary> }> = []
    if (p.email_weekly_summary) {
      candidates.push({
        kind: 'summary',
        msg: buildWeeklySummary(firstName, stats, createUnsubscribeToken(p.id, 'summary')
          ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/notifications/unsubscribe?token=${createUnsubscribeToken(p.id, 'summary')}`
          : undefined),
      })
    }
    if (p.email_case_reminders) {
      candidates.push({
        kind: 'reminders',
        msg: buildReminder(firstName, daysSince, dueCards, createUnsubscribeToken(p.id, 'reminders')
          ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/notifications/unsubscribe?token=${createUnsubscribeToken(p.id, 'reminders')}`
          : undefined),
      })
    }

    const chosen = candidates.find(c => c.msg !== null)
    if (!chosen?.msg) { bump('nothing-worth-sending'); continue }

    if (dryRun) {
      wouldSend.push({ kind: chosen.kind, subject: chosen.msg.subject })
      continue
    }

    const result = await sendEmail({ ...chosen.msg, to })
    if (result.ok) sent++
    else { failed++; console.error(`[cron:notifications] send failed: ${result.error}`) }
  }

  return Response.json({
    ok: true,
    driver: activeDriver(),
    deliveryEnabled: canSendEmail(),
    dryRun,
    considered: profiles.length,
    sent,
    failed,
    skipped,
    ...(dryRun ? { wouldSend } : {}),
  })
}

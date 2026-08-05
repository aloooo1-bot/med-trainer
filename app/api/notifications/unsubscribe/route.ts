import { createAdminClient } from '@/app/lib/supabase/admin'
import { verifyUnsubscribeToken } from '@/app/lib/server/email/tokens'

export const dynamic = 'force-dynamic'

const LABEL = { reminders: 'case reminders', summary: 'weekly summaries' } as const

function page(title: string, body: string, ok: boolean): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:14vh auto;padding:0 24px;color:#16201F;line-height:1.6">
  <div style="font-size:26px;margin-bottom:10px">${ok ? '✓' : '⚠'}</div>
  <h1 style="font-size:18px;margin:0 0 8px">${title}</h1>
  <p style="font-size:14px;color:#4A5856;margin:0">${body}</p>
  <p style="margin-top:22px"><a href="/settings" style="color:#131C28;font-weight:600;font-size:14px">Manage all notification settings →</a></p>
</div>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

/**
 * Unsubscribe via a signed link — GET for the click, POST for RFC 8058
 * one-click clients. Deliberately requires no session: making someone sign in
 * to stop receiving mail is both hostile and non-compliant.
 *
 * The token names the single preference it disables, so a link cannot be
 * replayed to turn off a different one, and it grants nothing else.
 */
async function unsubscribe(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token')
  const claims = verifyUnsubscribeToken(token)
  if (!claims) {
    return page(
      'This link is not valid',
      'It may have been altered or truncated by your mail client. You can turn notifications off directly in settings.',
      false,
    )
  }

  // Written with literal keys rather than a computed one: a computed key
  // widens to { [x: string]: boolean }, which the typed client rejects — and
  // widening it away would also drop the guarantee that only these two columns
  // can ever be touched from an unauthenticated request.
  const patch = claims.kind === 'reminders'
    ? { email_case_reminders: false }
    : { email_weekly_summary: false }

  try {
    const db = createAdminClient()
    const { error } = await db
      .from('profiles')
      .update(patch)
      .eq('id', claims.userId)
    if (error) throw new Error(error.message)
  } catch {
    return page(
      'Something went wrong',
      'We could not update your preferences just now. Please try again, or change them in settings.',
      false,
    )
  }

  return page(
    'Unsubscribed',
    `You will no longer receive ${LABEL[claims.kind]}. Your other notification settings are unchanged.`,
    true,
  )
}

export async function GET(req: Request) { return unsubscribe(req) }
export async function POST(req: Request) { return unsubscribe(req) }

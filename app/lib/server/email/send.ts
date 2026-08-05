import 'server-only'

/**
 * Outbound email, behind a driver so no provider is baked in.
 *
 * Driver selection is by environment, and the DEFAULT IS 'log' — with no
 * provider configured nothing leaves the building, it is only recorded. That
 * is deliberate: the notification job can be deployed, scheduled and observed
 * before a single real message is capable of being sent, so a scheduling or
 * targeting bug cannot turn into mail to real people.
 *
 * Adding a provider means one more branch in `deliver()` and its env var;
 * callers never change. Providers are hit over their REST API rather than an
 * SDK so this stays dependency-free.
 */

export interface EmailMessage {
  to: string
  subject: string
  /** Plain-text body. Always required — some clients never render the HTML. */
  text: string
  html?: string
  /** Surfaced as List-Unsubscribe where the provider supports it. */
  unsubscribeUrl?: string
}

export type EmailDriver = 'log' | 'resend'

export interface SendResult {
  ok: boolean
  driver: EmailDriver
  error?: string
}

export function activeDriver(): EmailDriver {
  return process.env.RESEND_API_KEY ? 'resend' : 'log'
}

/** Whether real delivery is possible right now. */
export function canSendEmail(): boolean {
  return activeDriver() !== 'log' && !!process.env.EMAIL_FROM
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const driver = activeDriver()

  if (driver === 'log' || !process.env.EMAIL_FROM) {
    // Recipient is not logged — an address in application logs is a leak.
    console.log(`[email:log] would send "${msg.subject}" (${msg.text.length} chars body)`)
    return { ok: true, driver: 'log' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.unsubscribeUrl
          ? { headers: { 'List-Unsubscribe': `<${msg.unsubscribeUrl}>` } }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, driver, error: `${res.status} ${detail.slice(0, 200)}` }
    }
    return { ok: true, driver }
  } catch (e) {
    return { ok: false, driver, error: (e as Error).message }
  }
}

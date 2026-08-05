# Notification emails

Built but **inert by default**. With no provider configured, `sendEmail()` uses
its `log` driver: it records what it would have sent and returns success.
Nothing reaches a real inbox until the environment below is set, so the job can
be deployed, scheduled and watched before it can mail anyone.

## Activating

| Variable | Needed for | Notes |
|---|---|---|
| `CRON_SECRET` | the job to run at all | Without it `/api/cron/notifications` returns 503 and does nothing. |
| `NOTIFICATION_SECRET` | unsubscribe links | Any long random string. Without it links are omitted — so is compliance. |
| `NEXT_PUBLIC_APP_URL` | absolute links in email | e.g. `https://medtrainer.app`. |
| `RESEND_API_KEY` | real delivery | Absent → log driver. |
| `EMAIL_FROM` | real delivery | Must be on a domain you have verified with the provider. |

`RESEND_API_KEY` and `EMAIL_FROM` must **both** be present before anything
sends; either alone leaves the log driver in place.

## Order of operations

1. Set `CRON_SECRET` and `NOTIFICATION_SECRET`. Leave the provider unset.
2. Schedule the job (below) and let it run. It reports `driver: "log"` and
   `deliveryEnabled: false`, and mails nobody.
3. Read the `wouldSend` output from a dry run until the targeting looks right.
4. Verify a sending domain with the provider, then set `RESEND_API_KEY` and
   `EMAIL_FROM`. Delivery begins on the next run.

## Scheduling

Any scheduler works — nothing here is host-specific. It only needs to POST with
the secret:

```bash
curl -X POST https://YOUR_APP/api/cron/notifications \
  -H "Authorization: Bearer $CRON_SECRET"
```

Dry run — reports exactly who would be mailed and why, sending nothing even
when a provider is live:

```bash
curl -X POST "https://YOUR_APP/api/cron/notifications?dryRun=1" \
  -H "Authorization: Bearer $CRON_SECRET"
```

On Vercel, add a `vercel.json` (or `vercel.ts`) cron entry pointing at the
path; Vercel supplies the `Authorization: Bearer $CRON_SECRET` header itself.
Weekly is the intended cadence — the summary compares this week with last, and
the reminder threshold is measured in days.

## Using a different provider

Add a branch to `deliver()` in `send.ts` keyed on its env var, and extend
`activeDriver()`. Providers are called over their REST API rather than an SDK,
so there is no dependency to add. Callers never change.

## What is deliberately conservative

- **One message per user per run.** A summary if there is one worth sending,
  otherwise a reminder — never both.
- **No mail to dormant users.** A "summary" of a week in which nothing happened
  is spam; `buildWeeklySummary()` returns null for it.
- **Reminders stop after 45 days.** Past that the person has moved on.
- **Recipients are never logged.** Addresses in application logs are a leak.
- **Unsubscribe needs no sign-in.** The link is HMAC-signed and names the single
  preference it disables, so it cannot be replayed against the other one.

import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { claudeRatelimit } from "@/app/lib/ratelimit";

export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 75_000 });

export async function POST(req: Request) {
  console.log('[/api/claude] request received');
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anonymous';
  const { success, limit, reset, remaining } = await claudeRatelimit.limit(ip);

  if (!success) {
    return Response.json(
      { error: 'Too many requests — please wait a moment before trying again.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
        },
      }
    );
  }

  try {
    const { messages, system, max_tokens } = await req.json();
    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: max_tokens || 1000,
        system,
        messages,
      },
      { signal: AbortSignal.timeout(75_000) }
    );
    return Response.json(response);
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/claude' } });
    const e = err as { message?: string; status?: number } | null
    const message = e?.message ?? 'Unknown error'
    const status = e?.status ?? 500
    console.error('[/api/claude] error:', message);
    return Response.json({ error: message, status }, { status });
  }
}

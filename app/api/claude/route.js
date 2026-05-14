import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { claudeRatelimit } from "@/app/lib/ratelimit";

export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req) {
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
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: max_tokens || 1000,
      system,
      messages,
    });
    return Response.json(response);
  } catch (err) {
    Sentry.captureException(err, { extra: { route: '/api/claude' } });
    console.error('[/api/claude] error:', err?.message ?? err);
    return Response.json(
      { error: err?.message ?? 'Unknown error', status: err?.status },
      { status: err?.status ?? 500 }
    );
  }
}

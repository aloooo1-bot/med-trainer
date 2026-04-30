import Anthropic from "@anthropic-ai/sdk";

export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req) {
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
    console.error('[/api/claude] error:', err?.message ?? err);
    return Response.json(
      { error: err?.message ?? 'Unknown error', status: err?.status },
      { status: err?.status ?? 500 }
    );
  }
}

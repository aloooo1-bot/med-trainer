import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req) {
  const { messages, system, max_tokens } = await req.json();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: max_tokens || 1000,
    system,
    messages,
  });
  return Response.json(response);
}

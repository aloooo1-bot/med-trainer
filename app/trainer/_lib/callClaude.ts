import type { RawUsage } from '@/app/lib/analytics'

export async function callClaude(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens = 1000,
  onUsage?: (usage: RawUsage) => void
): Promise<string> {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`)
  if (onUsage && data.usage) onUsage(data.usage as RawUsage)
  return data.content[0].text as string
}

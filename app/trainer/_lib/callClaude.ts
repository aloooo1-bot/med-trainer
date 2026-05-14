import type { RawUsage } from '@/app/lib/analytics'

export async function callClaude(
  system: string,
  messages: { role: string; content: string }[],
  maxTokens = 1000,
  onUsage?: (usage: RawUsage) => void
): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    const err = e as { name?: string } | null
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error('Generation timed out — please try again.')
    }
    throw e
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`)
  if (onUsage && data.usage) onUsage(data.usage as RawUsage)
  return data.content[0].text as string
}

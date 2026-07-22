import { Ratelimit, type Duration } from '@upstash/ratelimit'
import { redis } from './redis'

type LimitResult = { success: boolean; limit: number; reset: number; remaining: number }
type SafeRatelimit = { limit: (id: string) => Promise<LimitResult> }

function makeRatelimit(max: number, window: Duration, prefix: string): SafeRatelimit {
  const r = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window),
    analytics: true,
    prefix,
  })
  const fallback: LimitResult = { success: true, limit: max, reset: 0, remaining: max - 1 }
  return {
    limit: async (id: string) => {
      try {
        // Hard cap each call so a slow/unreachable Upstash can never add more
        // than 800ms of latency to a request — fail open past that.
        return await Promise.race([
          r.limit(id),
          new Promise<LimitResult>((_, reject) => setTimeout(() => reject(new Error('ratelimit timeout')), 800)),
        ])
      } catch {
        // Redis unavailable/slow — fail open so a misconfigured/missing Upstash
        // credential doesn't take down the route or add latency.
        console.warn(`[ratelimit] Redis error for prefix=${prefix} — allowing request`)
        return fallback
      }
    },
  }
}

// 30 req/min per user — /api/session/* actions (chat, exam, orders, grading).
export const sessionRatelimit = makeRatelimit(30, '1 m', 'med-trainer:session')

// 3 case starts/min per user — each start may trigger a full case generation.
export const sessionStartRatelimit = makeRatelimit(3, '1 m', 'med-trainer:session-start')

// 30 req/min per IP — Open-i proxy; generous because images load in parallel.
export const imagingRatelimit = makeRatelimit(30, '1 m', 'med-trainer:imaging')

// 10 req/min per user/IP — feedback submissions; prevents spam inserts.
export const feedbackRatelimit = makeRatelimit(10, '1 m', 'med-trainer:feedback')

// 5 req/min per user — admin case regeneration; each call hits Anthropic server-side.
export const regenerateRatelimit = makeRatelimit(5, '1 m', 'med-trainer:regenerate')

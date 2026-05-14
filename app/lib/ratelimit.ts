import { Ratelimit } from '@upstash/ratelimit'
import { redis } from './redis'

// 20 req/min per IP — prevents a single client from monopolizing Anthropic budget.
export const claudeRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  analytics: true,
  prefix: 'med-trainer:claude',
})

// 30 req/min per IP — Open-i proxy; generous because images load in parallel.
export const imagingRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  analytics: true,
  prefix: 'med-trainer:imaging',
})

// 10 req/min per user/IP — feedback submissions; prevents spam inserts.
export const feedbackRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
  prefix: 'med-trainer:feedback',
})

// 5 req/min per user — admin case regeneration; each call hits Anthropic server-side.
export const regenerateRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix: 'med-trainer:regenerate',
})

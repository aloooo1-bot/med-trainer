import { Ratelimit } from '@upstash/ratelimit'
import { redis } from './redis'

// 20 requests per minute per IP on the Claude endpoint.
// Anthropic's hard limit is 8k output tokens/min; this soft limit
// prevents a single client from monopolizing the budget.
export const claudeRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  analytics: true,
  prefix: 'med-trainer:claude',
})

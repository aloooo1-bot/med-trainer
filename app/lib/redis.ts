import { Redis } from '@upstash/redis'

// `retry: false` — do NOT retry failed commands. The default retries 5× with
// exponential backoff (~4s total), which added ~4s to every rate-limited
// request when Upstash was unreachable. Rate limiting is fail-open and
// non-critical, so a single failed attempt should give up immediately (the
// ratelimit wrapper then allows the request). See app/lib/ratelimit.ts, which
// also bounds each call with a hard timeout.
export const redis = Redis.fromEnv({ retry: false })

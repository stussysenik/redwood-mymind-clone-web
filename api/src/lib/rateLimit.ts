// Tiny in-memory sliding-window rate limiter. Single-instance only —
// rethink if we ever horizontally scale the api side.
//
// Used by /functions/capture to cap per-token request rate.

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfter: number }

export type RateLimiterOptions = {
  windowMs: number
  max: number
}

export type RateLimiter = {
  check: (key: string, nowMs?: number) => RateLimitResult
  reset: () => void
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = options
  const hits = new Map<string, number[]>()

  return {
    check(key: string, nowMs: number = Date.now()): RateLimitResult {
      const windowStart = nowMs - windowMs
      const existing = hits.get(key) ?? []
      const fresh = existing.filter((t) => t > windowStart)

      if (fresh.length >= max) {
        const oldest = fresh[0]
        const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000))
        hits.set(key, fresh)
        return { allowed: false, remaining: 0, retryAfter }
      }

      fresh.push(nowMs)
      hits.set(key, fresh)
      return { allowed: true, remaining: max - fresh.length }
    },
    reset() {
      hits.clear()
    },
  }
}

// Shared singleton for /functions/capture: 120 req/min per token.
export const captureRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
})

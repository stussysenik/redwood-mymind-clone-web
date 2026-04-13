import { captureRateLimiter, createRateLimiter } from './rateLimit'

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 })
    const now = 1_000_000

    expect(limiter.check('token_1', now)).toEqual({ allowed: true, remaining: 2 })
    expect(limiter.check('token_1', now + 1)).toEqual({ allowed: true, remaining: 1 })
    expect(limiter.check('token_1', now + 2)).toEqual({ allowed: true, remaining: 0 })
  })

  it('rejects the (max+1)th request with a retryAfter in seconds', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 })
    const now = 1_000_000

    limiter.check('token_1', now)
    limiter.check('token_1', now + 1)
    limiter.check('token_1', now + 2)

    const result = limiter.check('token_1', now + 3)
    expect(result.allowed).toBe(false)
    // `=== false` (not `!result.allowed`) — project tsconfig has no
    // `strictNullChecks`, so truthy-based narrowing doesn't discriminate
    // union branches.
    if (result.allowed === false) {
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.retryAfter).toBeLessThanOrEqual(60)
      expect(result.remaining).toBe(0)
    }
  })

  it('slides the window — old requests age out', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 })
    const now = 1_000_000

    limiter.check('token_1', now)
    limiter.check('token_1', now + 1)
    expect(limiter.check('token_1', now + 2).allowed).toBe(false)

    // Move past the window — first two requests age out
    expect(limiter.check('token_1', now + 60_001).allowed).toBe(true)
  })

  it('isolates per-key — token_1 at limit does not affect token_2', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
    const now = 1_000_000

    expect(limiter.check('token_1', now).allowed).toBe(true)
    expect(limiter.check('token_1', now + 1).allowed).toBe(false)

    expect(limiter.check('token_2', now + 2).allowed).toBe(true)
  })

  it('reset() clears all state so tests can share a singleton', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
    const now = 1_000_000

    expect(limiter.check('token_1', now).allowed).toBe(true)
    expect(limiter.check('token_1', now + 1).allowed).toBe(false)

    limiter.reset()

    expect(limiter.check('token_1', now + 2).allowed).toBe(true)
  })

  it('exports a shared captureRateLimiter singleton', () => {
    expect(captureRateLimiter).toBeDefined()
    expect(typeof captureRateLimiter.check).toBe('function')
    expect(typeof captureRateLimiter.reset).toBe('function')
  })
})

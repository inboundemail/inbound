import { Ratelimit } from '@upstash/ratelimit'
import { redis } from './client'

export const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(3, '1 s'),
  analytics: true,
  prefix: '@inbound/ratelimit',
})

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
  retryAfter?: number
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const result = await rateLimiter.limit(identifier)

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfter: result.success ? undefined : Math.ceil((result.reset - Date.now()) / 1000),
  }
}

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Only initialize if credentials are available
let redis: Redis | null = null
let ratelimit: Ratelimit | null = null

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  })

  // 5 requests per second per user
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1s"),
    analytics: true,
    prefix: "ratelimit:v3"
  })
} else {
  console.warn('⚠️ Upstash Redis credentials not found. Rate limiting disabled.')
}

export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
}

export async function checkRateLimit(userId: string): Promise<RateLimitInfo> {
  // If rate limiting is not configured, allow all requests
  if (!ratelimit) {
    return {
      limit: 999999,
      remaining: 999999,
      reset: Date.now() + 1000
    }
  }

  const { success, limit, remaining, reset } = await ratelimit.limit(userId)
  
  if (!success) {
    const error = new Error('Rate limit exceeded')
    error.name = 'RATE_LIMIT_EXCEEDED'
    ;(error as any).limit = limit
    ;(error as any).remaining = remaining
    ;(error as any).reset = reset
    throw error
  }

  return { limit, remaining, reset }
}



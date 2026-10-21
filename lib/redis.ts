import { Redis } from "@upstash/redis"

/**
 * Shared Redis instance for the application
 * Used by rate limiting and caching
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})


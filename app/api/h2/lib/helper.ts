"use server"

import { auth } from '@/lib/auth/auth'
import { headers } from 'next/headers'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Configure rate limiter: 4 requests per second per user
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(4, '1 s'),
  analytics: true,
  prefix: 'h2-api',
})

export async function validateRequest(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '') || ''

    const apiSession = await auth.api.verifyApiKey({
      body: {
        key: apiKey,
      },
    })

    let userId: string | undefined

    if (session?.user?.id) {
      userId = session.user.id
    } else if (apiSession?.key?.userId) {
      userId = apiSession.key.userId
    } else {
      return { error: 'Unauthorized' }
    }

    // Apply rate limiting (userId is guaranteed to be defined here)
    const { success, limit, reset, remaining } = await ratelimit.limit(userId!)

    if (!success) {
      return {
        error: 'Rate limit exceeded',
        rateLimit: {
          limit,
          remaining: 0,
          reset: new Date(reset).toISOString(),
        },
      }
    }

    return {
      userId,
      rateLimit: {
        limit,
        remaining,
        reset: new Date(reset).toISOString(),
      },
    }
  } catch (error) {
    console.error('Error validating request: ' + error)
    return { error: 'Unauthorized' }
  }
}

import { ORPCError, os } from '@orpc/server'
import { auth } from '@/lib/auth/auth'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { BaseContext, AuthenticatedContext } from './context'

// Initialize Upstash Redis for rate limiting
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
})

// Configure rate limiters based on auth type
const sessionRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute for sessions
  prefix: 'v3:session',
})

const apiKeyRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '1 m'), // 50 requests per minute for API keys
  prefix: 'v3:apikey',
})

/**
 * Authentication context type
 * Output of authentication middleware
 */
export type AuthContext = {
  userId: string
  sessionId: string | undefined
  authMethod: 'session' | 'api-key'
}

/**
 * Authentication middleware
 * Checks better-auth session first, falls back to API key
 * Throws UNAUTHORIZED if neither is valid
 */
export const authMiddleware = os
  .$context<BaseContext>()
  .middleware<AuthContext, unknown>(async ({ context, next }) => {
    console.log('🔐 v3: Starting authentication')
    // console.debug('📋 v3: Headers received:', Object.keys(context.headers))
    // console.debug('🔑 v3: Authorization header:', context.headers['authorization'])

    // Try better-auth session first
    try {
      // Better-auth expects a Headers object, so we need to reconstruct it
      const headersObj = new Headers()
      Object.entries(context.headers).forEach(([key, value]) => {
        if (value) {
          headersObj.set(key, Array.isArray(value) ? value[0] : value)
        }
      })
      
      const session = await auth.api.getSession({ headers: headersObj })
      
      if (session?.user?.id) {
        console.log('✅ v3: Authenticated via session:', session.user.id)
        return next({
          context: {
            userId: session.user.id,
            sessionId: session.session.id || undefined,
            authMethod: 'session' as const,
          },
        })
      }
    } catch (error) {
      console.log('⚠️ v3: Session auth failed, trying API key')
    }

    // Fallback to API key authentication
    const authHeader = context.headers['authorization'] as string | undefined
    if (!authHeader) {
      console.log('❌ v3: No authorization header found')
      throw new ORPCError('UNAUTHORIZED', {
        message: 'Authentication required. Provide a valid session or API key.',
      })
    }

    // Extract API key from Bearer token
    const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!apiKey) {
      console.log('❌ v3: Invalid authorization header format')
      throw new ORPCError('UNAUTHORIZED', {
        message: 'Invalid authorization format. Use: Authorization: Bearer <api-key>',
      })
    }

    // Verify API key using better-auth
    try {
      // @ts-ignore - better-auth 'verifyApiKey' doesn't have a type definition for some reason
      const { valid, error: verifyError, key } = await auth.api.verifyApiKey({
        body: { key: apiKey },
      })

      if (!valid || verifyError || !key?.userId) {
        console.log('❌ v3: Invalid or inactive API key')
        throw new ORPCError('UNAUTHORIZED', {
          message: verifyError?.message || 'Invalid or inactive API key',
        })
      }

      console.log('✅ v3: Authenticated via API key for userId:', key.userId)
      
      return next({
        context: {
          userId: key.userId,
          sessionId: undefined, // No session ID for API keys
          authMethod: 'api-key' as const,
        },
      })
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error
      }
      
      console.error('❌ v3: API key verification error:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Authentication verification failed',
      })
    }
  })

/**
 * Rate limiting middleware
 * Uses Upstash Redis to enforce rate limits
 * Returns RFC-compliant headers and error responses
 */
export const rateLimitMiddleware = os
  .$context<BaseContext>()
  .middleware(async ({ context, next }) => {
    // Determine identifier and rate limiter
    let identifier: string
    let limiter: typeof sessionRateLimit

    if ('userId' in context) {
      // Authenticated user - use userId
      identifier = (context as AuthenticatedContext).userId
      limiter = (context as AuthenticatedContext).authMethod === 'api-key' ? apiKeyRateLimit : sessionRateLimit
    } else {
      // Unauthenticated - use IP address
      identifier = context.ip || 'unknown'
      limiter = apiKeyRateLimit // Use stricter limit for unauthenticated
    }

    console.log('🚦 v3: Checking rate limit for:', identifier)

    try {
      const { success, limit, remaining, reset } = await limiter.limit(identifier)

      // Attach rate limit info to context for response headers
      const rateLimitInfo = {
        limit,
        remaining: Math.max(0, remaining),
        reset: new Date(reset),
      }

      if (!success) {
        console.log('❌ v3: Rate limit exceeded for:', identifier)
        
        throw new ORPCError('TOO_MANY_REQUESTS', {
          message: 'Rate limit exceeded. Please try again later.',
          data: {
            limit,
            remaining: 0,
            resetAt: rateLimitInfo.reset.toISOString(),
            retryAfter: Math.ceil((reset - Date.now()) / 1000),
          },
        })
      }

      console.log('✅ v3: Rate limit check passed:', {
        remaining: rateLimitInfo.remaining,
        limit: rateLimitInfo.limit,
      })

      // Continue with rate limit info attached
      return next({ 
        context: {
          rateLimit: rateLimitInfo,
        },
      })
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error
      }

      console.error('❌ v3: Rate limit check error:', error)
      // On rate limit check failure, allow the request but log the error
      return next({ context: {} })
    }
  })


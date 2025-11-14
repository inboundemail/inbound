import { os } from '@orpc/server'
import * as Sentry from '@sentry/nextjs'
import { createContext, createAuthenticatedContext, type BaseContext, type AuthenticatedContext } from './context'
import { checkRateLimit } from './rate-limiter'
import { APIError, ErrorCodes } from './error-handler'

// Base middleware for logging and error tracking
const baseMiddleware = os.middleware(async ({ context, next, meta }) => {
  const span = Sentry.startSpan({ name: 'orpc.base' })
  try {
    return await next({ context })
  } catch (error) {
    Sentry.captureException(error)
    throw error
  } finally {
    span?.end()
  }
})

// Authentication middleware
const authMiddleware = os.middleware(async ({ context, next, meta }) => {
  const span = Sentry.startSpan({ name: 'orpc.auth' })
  
  try {
    // Get the request from context
    const req = (context as any).req as Request
    
    if (!req) {
      throw new APIError(ErrorCodes.INTERNAL_ERROR, 'Request not available in context', 500)
    }

    // Authenticate
    const authContext = await createAuthenticatedContext(req)
    
    if ('error' in authContext) {
      throw new APIError(ErrorCodes.UNAUTHORIZED, authContext.error, 401)
    }

    span?.setAttribute('userId', authContext.userId)
    span?.setAttribute('authMethod', authContext.authMethod)

    // Continue with authenticated context
    return await next({ context: authContext })
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    
    Sentry.captureException(error)
    throw new APIError(
      ErrorCodes.INTERNAL_ERROR,
      'Authentication failed',
      500
    )
  } finally {
    span?.end()
  }
})

// Rate limiting middleware
const rateLimitMiddleware = os.middleware(async ({ context, next, meta }) => {
  const authContext = context as AuthenticatedContext
  
  try {
    const rateLimitInfo = await checkRateLimit(authContext.userId)
    
    // Continue with request
    const result = await next({ context })
    
    // Attach rate limit info to result metadata
    if (typeof result === 'object' && result !== null) {
      return {
        ...result,
        _meta: {
          ...(result as any)._meta,
          rateLimit: rateLimitInfo
        }
      }
    }
    
    return result
  } catch (error: any) {
    if (error.name === 'RATE_LIMIT_EXCEEDED') {
      throw new APIError(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        'Too many requests',
        429,
        {
          limit: error.limit,
          remaining: error.remaining,
          reset: error.reset
        }
      )
    }
    throw error
  }
})

// Base procedure (no auth required)
export const baseProcedure = os
  .use(baseMiddleware)

// Authenticated procedure (requires auth + rate limiting)
export const authenticatedProcedure = os
  .use(baseMiddleware)
  .use(authMiddleware)
  .use(rateLimitMiddleware)


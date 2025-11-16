import { os } from '@orpc/server'
import type { BaseContext } from './context'
import { authMiddleware, rateLimitMiddleware } from './middleware'

/**
 * Base procedure builder with context type
 * All v3 procedures start from here
 */
const base = os.$context<BaseContext>()

/**
 * Logging middleware for all procedures
 * Logs the start and end of each procedure call
 */
const loggingMiddleware = base.middleware(async ({ path, next }) => {
  const start = Date.now()
  const procedurePath = path.join('.')
  
  console.log(`[v3] ${procedurePath} START`)

  try {
    const result = await next()
    const duration = Date.now() - start
    console.log(`[v3] ${procedurePath} SUCCESS (${duration}ms)`)
    return result
  } catch (error) {
    const duration = Date.now() - start
    console.error(`[v3] ${procedurePath} ERROR (${duration}ms)`, error)
    throw error
  }
})

/**
 * Public procedure
 * Available to all requests (authenticated or not)
 * Includes: logging + rate limiting
 */
export const publicProcedure = base
  .use(loggingMiddleware)
  .use(rateLimitMiddleware)

/**
 * Authenticated procedure
 * Requires valid authentication (session or API key)
 * Includes: logging + authentication + rate limiting
 * Context will include userId, authMethod, etc.
 * 
 * Note: authMiddleware runs BEFORE rateLimitMiddleware so that
 * userId is available for auth-type-specific rate limiting
 * (100 RPS for sessions, 50 RPS for API keys)
 */
export const authenticatedProcedure = base
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(rateLimitMiddleware)


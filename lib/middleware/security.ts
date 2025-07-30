import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitConfigs } from './rate-limit'
import { validateRequestBody, validateQueryParams } from '@/lib/validation/api-schemas'
import { z } from 'zod'

/**
 * Comprehensive security middleware for API routes
 * Combines rate limiting, input validation, and other security features
 */

export interface SecurityMiddlewareConfig {
  rateLimit?: keyof typeof rateLimitConfigs | false
  bodySchema?: z.ZodSchema
  querySchema?: z.ZodSchema
  requireAuth?: boolean
  allowedMethods?: string[]
  customHeaders?: Record<string, string>
}

/**
 * Security middleware wrapper
 */
export function withSecurity<T = any>(
  handler: (req: NextRequest, context?: T) => Promise<NextResponse>,
  config: SecurityMiddlewareConfig = {}
) {
  return async (req: NextRequest, context?: T): Promise<NextResponse> => {
    try {
      // 1. Check allowed methods
      if (config.allowedMethods && !config.allowedMethods.includes(req.method)) {
        return NextResponse.json(
          { error: `Method ${req.method} not allowed` },
          { 
            status: 405,
            headers: {
              'Allow': config.allowedMethods.join(', ')
            }
          }
        )
      }

      // 2. Apply rate limiting
      if (config.rateLimit !== false) {
        const rateLimitConfig = config.rateLimit 
          ? rateLimitConfigs[config.rateLimit]
          : rateLimitConfigs.api
          
        const rateLimitResponse = await rateLimit(req, rateLimitConfig)
        if (rateLimitResponse && rateLimitResponse.status === 429) {
          return rateLimitResponse
        }
      }

      // 3. Validate query parameters
      if (config.querySchema) {
        const { searchParams } = new URL(req.url)
        const validation = validateQueryParams(config.querySchema, searchParams)
        
        if (!validation.success) {
          return NextResponse.json(
            { 
              error: 'Invalid query parameters',
              details: validation.error
            },
            { status: 400 }
          )
        }
      }

      // 4. Validate request body
      if (config.bodySchema && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          const body = await req.json()
          const validation = validateRequestBody(config.bodySchema, body)
          
          if (!validation.success) {
            return NextResponse.json(
              { 
                error: 'Invalid request body',
                details: validation.error
              },
              { status: 400 }
            )
          }
          
          // Store validated body for handler use
          (req as any).validatedBody = validation.data
        } catch (error) {
          return NextResponse.json(
            { error: 'Invalid JSON in request body' },
            { status: 400 }
          )
        }
      }

      // 5. Execute the handler
      const response = await handler(req, context)

      // 6. Add custom security headers
      if (config.customHeaders) {
        Object.entries(config.customHeaders).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
      }

      // 7. Add standard security headers for API responses
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      
      return response
    } catch (error) {
      console.error('Security middleware error:', error)
      
      // Don't expose internal errors
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Get validated body from request
 * Must be used with withSecurity middleware that validates the body
 */
export function getValidatedBody<T>(req: NextRequest): T {
  return (req as any).validatedBody as T
}

/**
 * Common security configurations
 */
export const securityPresets = {
  // Public read-only endpoint
  publicRead: {
    rateLimit: 'api' as const,
    allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
  },
  
  // Authenticated API endpoint
  authenticated: {
    rateLimit: 'api' as const,
    requireAuth: true,
  },
  
  // Webhook endpoint
  webhook: {
    rateLimit: 'webhook' as const,
    allowedMethods: ['POST'],
    customHeaders: {
      'X-Webhook-Processed': 'true'
    }
  },
  
  // Authentication endpoint
  auth: {
    rateLimit: 'auth' as const,
    allowedMethods: ['POST'],
  },
  
  // Email sending endpoint
  email: {
    rateLimit: 'email' as const,
    requireAuth: true,
    allowedMethods: ['POST'],
  }
} as const
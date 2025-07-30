import { NextRequest, NextResponse } from 'next/server'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string // Custom key generator
  message?: string // Custom error message
}

// In-memory store for rate limit tracking
// In production, you should use Redis or a database
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean up every minute

// Default configurations for different endpoints
export const rateLimitConfigs = {
  // Strict rate limit for authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later'
  },
  // Moderate rate limit for API endpoints
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many requests, please slow down'
  },
  // Lenient rate limit for webhook endpoints
  webhook: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Webhook rate limit exceeded'
  },
  // Very strict for email sending
  email: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Email sending limit exceeded'
  }
} as const

/**
 * Get client identifier from request
 */
function getClientId(req: NextRequest, customKeyGenerator?: (req: NextRequest) => string): string {
  if (customKeyGenerator) {
    return customKeyGenerator(req)
  }

  // Try to get API key first
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return `api:${authHeader.substring(7).substring(0, 16)}` // Use first 16 chars of API key
  }

  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return `ip:${ip}`
}

/**
 * Rate limiting middleware
 */
export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const clientId = getClientId(req, config.keyGenerator)
  const now = Date.now()
  const resetTime = now + config.windowMs

  // Get or create rate limit entry
  let entry = rateLimitStore.get(clientId)
  
  if (!entry || entry.resetTime < now) {
    // Create new entry or reset expired one
    entry = { count: 1, resetTime }
    rateLimitStore.set(clientId, entry)
  } else {
    // Increment count
    entry.count++
  }

  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    
    return NextResponse.json(
      {
        error: config.message || 'Too many requests',
        retryAfter
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
          'Retry-After': retryAfter.toString()
        }
      }
    )
  }

  // Add rate limit headers to help clients
  const remaining = Math.max(0, config.maxRequests - entry.count)
  
  return new NextResponse(null, {
    headers: {
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
    }
  })
}

/**
 * Create a rate-limited API route handler
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const rateLimitResponse = await rateLimit(req, config)
    if (rateLimitResponse && rateLimitResponse.status === 429) {
      return rateLimitResponse
    }
    
    // Pass rate limit headers to the actual response
    const response = await handler(req)
    if (rateLimitResponse) {
      rateLimitResponse.headers.forEach((value, key) => {
        response.headers.set(key, value)
      })
    }
    
    return response
  }
}
/**
 * V2 API Authentication Utility
 * 
 * Provides unified authentication for v2 API routes supporting both:
 * 1. Session-based authentication (for web app users)
 * 2. API key authentication (for programmatic access)
 * 
 * Following the API management rules, this utility checks session first,
 * then falls back to API key authentication if no session is found.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { headers } from 'next/headers'

export interface AuthenticationResult {
  success: boolean
  user?: {
    id: string
    email: string
    name: string | null
  }
  authType?: 'session' | 'api_key'
  error?: string
}

/**
 * Unified authentication for v2 API routes
 * Checks session first, then API key if no session found
 */
export async function authenticateV2Request(request: NextRequest): Promise<AuthenticationResult> {
  try {
    // Step 1: Try session-based authentication first
    const sessionResult = await trySessionAuth()
    if (sessionResult.success) {
      return {
        ...sessionResult,
        authType: 'session'
      }
    }

    // Step 2: If no session, try API key authentication
    const apiKeyResult = await tryApiKeyAuth(request)
    if (apiKeyResult.success) {
      return {
        ...apiKeyResult,
        authType: 'api_key'
      }
    }

    // Step 3: Both authentication methods failed
    return {
      success: false,
      error: 'Authentication required. Please provide a valid session or API key.'
    }
  } catch (error) {
    console.error('V2 API authentication error:', error)
    return {
      success: false,
      error: 'Internal authentication error'
    }
  }
}

/**
 * Try session-based authentication
 */
async function trySessionAuth(): Promise<AuthenticationResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'No valid session found'
      }
    }

    return {
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.name || null
      }
    }
  } catch (error) {
    return {
      success: false,
      error: 'Session validation failed'
    }
  }
}

/**
 * Try API key authentication
 */
async function tryApiKeyAuth(request: NextRequest): Promise<AuthenticationResult> {
  try {
    // Get the Authorization header
    const authHeader = request.headers.get('Authorization')
    
    if (!authHeader) {
      return {
        success: false,
        error: 'No Authorization header found'
      }
    }

    // Extract the API key (support both "Bearer <key>" and just "<key>")
    let apiKey: string
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7)
    } else {
      apiKey = authHeader
    }

    if (!apiKey) {
      return {
        success: false,
        error: 'Invalid Authorization header format'
      }
    }

    // Verify the API key using Better Auth
    const { valid, error, key } = await auth.api.verifyApiKey({
      body: {
        key: apiKey
      }
    })

    if (!valid || error || !key) {
      return {
        success: false,
        error: error?.message || 'Invalid API key'
      }
    }

    // Check if the API key is enabled
    if (!key.enabled) {
      return {
        success: false,
        error: 'API key is disabled'
      }
    }

    // Check if the API key has expired
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return {
        success: false,
        error: 'API key has expired'
      }
    }

    return {
      success: true,
      user: {
        id: key.userId,
        email: key.userId, // We don't have email from API key, use userId as fallback
        name: null // We don't have name from API key
      }
    }
  } catch (error) {
    console.error('API key authentication error:', error)
    return {
      success: false,
      error: 'API key validation failed'
    }
  }
}

/**
 * Get authentication error response with proper status code
 */
export function getAuthErrorResponse(authResult: AuthenticationResult): {
  error: string
  details?: string
  status: number
} {
  if (authResult.error?.includes('expired')) {
    return {
      error: authResult.error,
      status: 401
    }
  }

  if (authResult.error?.includes('disabled')) {
    return {
      error: authResult.error,
      status: 403
    }
  }

  return {
    error: authResult.error || 'Authentication failed',
    details: 'Please provide a valid session or API key in the Authorization header',
    status: 401
  }
} 
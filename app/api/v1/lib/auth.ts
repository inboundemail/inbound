import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export interface ApiKeyValidationResult {
  valid: boolean
  user?: {
    id: string
    email: string
    name: string | null
  }
  error?: string
}

/**
 * Validates an API key from the Authorization header
 * Expected format: "Bearer <api_key>" or just "<api_key>"
 */
export async function validateApiKey(request: NextRequest): Promise<ApiKeyValidationResult> {
  try {
    // Get the Authorization header
    const authHeader = request.headers.get('Authorization')
    
    if (!authHeader) {
      return {
        valid: false,
        error: 'Missing Authorization header'
      }
    }

    // Extract the API key (support both "Bearer <key>" and just "<key>")
    let apiKey: string
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7)
    } else {
      apiKey = authHeader
    }

    console.log("API KEY: " + apiKey)

    if (!apiKey) {
      return {
        valid: false,
        error: 'Invalid Authorization header format'
      }
    }

    // Verify the API key using Better Auth
    const { valid, error, key } = await auth.api.verifyApiKey({
      body: {
        key: apiKey
      }
    })

    console.log("VALID: " + valid)
    console.log("ERROR: " + error)
    console.log("KEY: " + key?.userId)

    if (!valid || error || !key) {
      return {
        valid: false,
        error: error?.message || 'Invalid API key'
      }
    }

    // Check if the API key is enabled
    if (!key.enabled) {
      return {
        valid: false,
        error: 'API key is disabled'
      }
    }

    // Check if the API key has expired
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return {
        valid: false,
        error: 'API key has expired'
      }
    }

    // Use the userId from the API key directly
    return {
      valid: true,
      user: {
        id: key.userId,
        email: key.userId, // We don't have email from API key, use userId as fallback
        name: null // We don't have name from API key
      }
    }
  } catch (error) {
    console.error('API key validation error:', error)
    return {
      valid: false,
      error: 'Internal server error during API key validation'
    }
  }
}

/**
 * Middleware function to validate API key and return standardized error responses
 */
export function createApiKeyMiddleware() {
  return async (request: NextRequest) => {
    const validation = await validateApiKey(request)
    
    if (!validation.valid) {
      return {
        error: validation.error,
        status: 401
      }
    }

    return {
      user: validation.user!
    }
  }
} 
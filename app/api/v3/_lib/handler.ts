import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { CORSPlugin } from '@orpc/server/plugins'
import { onError } from '@orpc/server'

/**
 * Creates an OpenAPI handler for the v3 API
 * Configured with:
 * - CORS support
 * - Error logging
 * - Request handling
 */
export function createV3Handler(router: any) {
  return new OpenAPIHandler(router, {
    // Plugins
    plugins: [
      new CORSPlugin({
        origin: [process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://inbound.new'],
        credentials: true,
      }),
    ],
    
    // Interceptors
    interceptors: [
      onError((error: unknown) => {
        console.error('❌ v3 API Error:', error)
      }),
    ],
  })
}

/**
 * Error response codes used across the v3 API
 */
export const API_ERROR_CODES = {
  // 4xx Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  
  // 5xx Server Errors
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

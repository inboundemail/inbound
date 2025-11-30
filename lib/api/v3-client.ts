/**
 * v3 API Client
 * 
 * This file will be updated once the routers are created.
 * For now, it exports a placeholder that can be configured later.
 */

// This will be properly typed once we have the AppRouter
export type AppRouter = typeof import('@/app/api/v3/[[...rest]]/route').router

// Client configuration
export const v3ClientConfig = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || (
    process.env.NODE_ENV === 'development' 
      ? 'https://dev.inbound.new' 
      : 'https://inbound.new'
  ),
  headers: {
    'Content-Type': 'application/json'
  }
}

// Placeholder - will be replaced with actual client once routers are created
export const v3Client = {
  // domains: {},
  // emails: {},
  // endpoints: {},
  // emailAddresses: {}
}

/**
 * Once routers are created, this file will be updated to:
 * 
 * import { createClient } from '@orpc/client'
 * import type { AppRouter } from '@/app/api/v3/route'
 * 
 * export const v3Client = createClient<AppRouter>(v3ClientConfig)
 */



/**
 * @inboundemail/sdk
 * Official SDK for Inbound Email API
 * Version 2.0.0
 */

// Main SDK client
export { InboundEmailClient } from './client'
export { InboundEmailClient as Inbound } from './client'
export type { InboundEmailConfigExtended } from './client'

// Type definitions
export * from './types'

// Webhook types for incoming requests
export * from './webhook-types'

// Utilities
export * from './utils'

// Version
export const VERSION = '2.0.0'

// Default export for convenience
export { InboundEmailClient as default } from './client' 
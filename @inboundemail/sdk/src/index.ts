/**
 * @inboundemail/sdk
 * Official SDK for Inbound Email API
 * Version 3.0.0
 */

// Main SDK client
export { InboundEmailClient } from './client'
export { InboundEmailClient as Inbound } from './client'
// Removed InboundEmailConfigExtended as part of v3.0.0 refactor

// Type definitions
export * from './types'

// Webhook types for incoming requests
export * from './webhook-types'

// Utilities
export * from './utils'

// Version
export const VERSION = '3.0.0'

// Default export for convenience
export { InboundEmailClient as default } from './client' 
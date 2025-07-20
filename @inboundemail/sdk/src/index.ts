/**
 * @inboundemail/sdk
 * Official SDK for Inbound Email API
 * Version 2.0.0
 */

// Main SDK client
export { InboundEmailClient } from './client'
export { InboundEmailClient as Inbound } from './client'

// Type definitions
export * from './types'

// Utilities
export * from './utils'

// Version
export const VERSION = '2.0.0'

// Default export for convenience
export { InboundEmailClient as default } from './client' 
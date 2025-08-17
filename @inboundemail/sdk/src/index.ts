/**
 * @inboundemail/sdk
 * Official SDK for Inbound Email API
 * Version 3.1.0 - Enhanced with attachment support and { data, error } responses
 */

// Main SDK client
export { InboundEmailClient } from './client'
export { InboundEmailClient as Inbound } from './client'

// Core types
export type { 
  ApiResponse, 
  SuccessResponse, 
  ErrorResponse,
  AttachmentData,
  PostEmailsRequest,
  PostEmailsResponse,
  PostEmailReplyRequest,
  PostEmailReplyResponse
} from './types'

// Webhook types
export type { 
  InboundWebhookEmail,
  InboundWebhookPayload,
  InboundWebhookHeaders,
  InboundEmailAttachment
} from './webhook-types'

// Webhook utilities
export { 
  isInboundWebhook,
  getEmailText,
  getEmailHtml,
  getSenderInfo,
  getRecipientAddresses
} from './webhook-types'

// Webhook types for incoming requests
export * from './webhook-types'

// Utilities
export * from './utils'

// Version
export const VERSION = '3.1.0'

// Default export for convenience
export { InboundEmailClient as default } from './client' 
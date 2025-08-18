/**
 * @inboundemail/sdk
 * Official SDK for Inbound Email API
 * Version 4.0.0 - Hierarchical API structure with email.address.* methods
 */

// Main SDK client
export { InboundEmailClient } from './client'
export { InboundEmailClient as Inbound } from './client'

// Core types
export type { 
  ApiResponse, 
  SuccessResponse, 
  ErrorResponse,
  IdempotencyOptions,
  AttachmentData,
  ReactEmailComponent,
  PostEmailsRequest,
  PostEmailsResponse,
  PostEmailReplyRequest,
  PostEmailReplyResponse,
  // Scheduling types
  PostScheduleEmailRequest,
  PostScheduleEmailResponse,
  GetScheduledEmailsRequest,
  GetScheduledEmailsResponse,
  ScheduledEmailItem,
  GetScheduledEmailResponse,
  DeleteScheduledEmailResponse
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
export const VERSION = '4.0.0'

// Default export for convenience
export { InboundEmailClient as default } from './client' 
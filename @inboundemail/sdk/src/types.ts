/**
 * Type definitions for the Inbound Email SDK
 */

import * as React from 'react'

// Base configuration
export interface InboundEmailConfig {
  apiKey: string
  baseUrl?: string
}

// Standard response pattern - { data, error }
export interface ApiResponse<T = any> {
  data?: T
  error?: string
}

// Success response helper
export interface SuccessResponse<T> {
  data: T
  error?: never
}

// Error response helper  
export interface ErrorResponse {
  data?: never
  error: string
}

// Pagination interface
export interface Pagination {
  limit: number
  offset: number
  total: number
  hasMore?: boolean
}

// Idempotency options for email sending
export interface IdempotencyOptions {
  idempotencyKey?: string
}

// Mail API Types
export interface EmailItem {
  id: string
  emailId: string
  messageId: string | null
  subject: string
  from: string
  fromName: string | null
  recipient: string
  preview: string
  receivedAt: Date
  isRead: boolean
  readAt: Date | null
  isArchived: boolean
  archivedAt: Date | null
  hasAttachments: boolean
  attachmentCount: number
  parseSuccess: boolean | null
  parseError: string | null
  createdAt: Date
}

export interface GetMailRequest {
  limit?: number
  offset?: number
  search?: string
  status?: 'all' | 'processed' | 'failed'
  domain?: string
  timeRange?: '24h' | '7d' | '30d' | '90d'
  includeArchived?: boolean
  emailAddress?: string
  emailId?: string
}

export interface GetMailResponse {
  emails: EmailItem[]
  pagination: Pagination
}

export interface PostMailRequest {
  emailId: string
  to: string
  subject: string
  textBody: string
  htmlBody?: string
}

export interface PostMailResponse {
  message: string
}

export interface GetMailByIdResponse {
  id: string
  emailId: string
  subject: string
  from: string
  to: string
  textBody: string
  htmlBody: string
  receivedAt: Date
  attachments: any[]
}

// Endpoints API Types
export interface WebhookConfig {
  url: string
  timeout: number
  retryAttempts: number
  headers?: Record<string, string>
}

export interface EmailConfig {
  email: string
}

export interface EmailGroupConfig {
  emails: string[]
}

export type EndpointConfig = WebhookConfig | EmailConfig | EmailGroupConfig

export interface EndpointWithStats {
  id: string
  name: string
  type: 'webhook' | 'email' | 'email_group'
  config: EndpointConfig
  isActive: boolean
  description: string | null
  userId: string
  createdAt: Date
  updatedAt: Date
  groupEmails: string[] | null
  deliveryStats: {
    total: number
    successful: number
    failed: number
    lastDelivery: string | null
  }
}

export interface GetEndpointsRequest {
  limit?: number
  offset?: number
  type?: 'webhook' | 'email' | 'email_group'
  active?: 'true' | 'false'
}

export interface GetEndpointsResponse {
  data: EndpointWithStats[]
  pagination: Pagination
}

export interface PostEndpointsRequest {
  name: string
  type: 'webhook' | 'email' | 'email_group'
  description?: string
  config: EndpointConfig
}

export interface PostEndpointsResponse {
  id: string
  name: string
  type: string
  config: EndpointConfig
  isActive: boolean
  description: string | null
  createdAt: Date
}

export interface GetEndpointByIdResponse {
  id: string
  name: string
  type: string
  config: EndpointConfig
  isActive: boolean
  description: string | null
  deliveryStats: {
    total: number
    successful: number
    failed: number
  }
  recentDeliveries: any[]
  associatedEmails: any[]
  catchAllDomains: any[]
  createdAt: Date
  updatedAt: Date
}

export interface PutEndpointByIdRequest {
  name?: string
  description?: string
  isActive?: boolean
  config?: EndpointConfig
}

export interface PutEndpointByIdResponse {
  id: string
  name: string
  description: string | null
  isActive: boolean
  config: EndpointConfig
  updatedAt: Date
}

export interface DeleteEndpointByIdResponse {
  message: string
  cleanup: {
    emailAddressesUpdated: number
    domainsUpdated: number
    groupEmailsDeleted: number
    deliveriesDeleted: number
    emailAddresses: any[]
    domains: any[]
  }
}

// Domains API Types
export interface DomainWithStats {
  id: string
  domain: string
  status: string
  canReceiveEmails: boolean
  hasMxRecords: boolean
  domainProvider: string | null
  providerConfidence: string | null
  lastDnsCheck: Date | null
  lastSesCheck: Date | null
  isCatchAllEnabled: boolean
  catchAllEndpointId: string | null
  receiveDmarcEmails: boolean
  createdAt: Date
  updatedAt: Date
  userId: string
  stats: {
    totalEmailAddresses: number
    activeEmailAddresses: number
    hasCatchAll: boolean
  }
  catchAllEndpoint?: {
    id: string
    name: string
    type: string
    isActive: boolean
  } | null
  verificationCheck?: {
    dnsRecords?: Array<{
      type: string
      name: string
      value: string
      status: string
      lastChecked: Date
    }>
    sesStatus?: string
    isFullyVerified?: boolean
    lastChecked?: Date
  }
}

export interface GetDomainsRequest {
  limit?: number
  offset?: number
  status?: 'pending' | 'verified' | 'failed'
  canReceive?: 'true' | 'false'
  check?: 'true' | 'false'
}

export interface GetDomainsResponse {
  data: DomainWithStats[]
  pagination: Pagination
  meta: {
    totalCount: number
    verifiedCount: number
    statusBreakdown: Record<string, number>
  }
}

export interface PostDomainsRequest {
  domain: string
}

export interface PostDomainsResponse {
  id: string
  domain: string
  status: string
  dnsRecords: Array<{
    type: string
    name: string
    value: string
  }>
  createdAt: Date
}

export interface GetDomainByIdResponse {
  id: string
  domain: string
  status: string
  canReceiveEmails: boolean
  isCatchAllEnabled: boolean
  catchAllEndpointId: string | null
  stats: {
    totalEmailAddresses: number
    activeEmailAddresses: number
  }
  catchAllEndpoint?: {
    id: string
    name: string
    type: string
  } | null
  createdAt: Date
  updatedAt: Date
}

export interface PutDomainByIdRequest {
  isCatchAllEnabled: boolean
  catchAllEndpointId: string | null
}

export interface PutDomainByIdResponse {
  id: string
  domain: string
  isCatchAllEnabled: boolean
  catchAllEndpointId: string | null
  catchAllEndpoint?: {
    id: string
    name: string
    type: string
  } | null
  updatedAt: Date
}

// Email Addresses API Types
export interface EmailAddressWithDomain {
  id: string
  address: string
  domainId: string
  webhookId: string | null
  endpointId: string | null
  isActive: boolean
  isReceiptRuleConfigured: boolean
  receiptRuleName: string | null
  createdAt: Date
  updatedAt: Date
  userId: string
  domain: {
    id: string
    name: string
    status: string
  }
  routing: {
    type: 'webhook' | 'endpoint' | 'none'
    id: string | null
    name: string | null
    config?: any
    isActive: boolean
  }
}

export interface GetEmailAddressesRequest {
  limit?: number
  offset?: number
  domainId?: string
  isActive?: 'true' | 'false'
  isReceiptRuleConfigured?: 'true' | 'false'
}

export interface GetEmailAddressesResponse {
  data: EmailAddressWithDomain[]
  pagination: Pagination
}

export interface PostEmailAddressesRequest {
  address: string
  domainId: string
  endpointId?: string
  webhookId?: string
  isActive?: boolean
}

export interface PostEmailAddressesResponse {
  id: string
  address: string
  domainId: string
  endpointId: string | null
  isActive: boolean
  domain: {
    name: string
  }
  routing: {
    type: 'webhook' | 'endpoint' | 'none'
  }
  createdAt: Date
}

export interface GetEmailAddressByIdResponse {
  id: string
  address: string
  domainId: string
  endpointId: string | null
  isActive: boolean
  isReceiptRuleConfigured: boolean
  domain: {
    name: string
  }
  routing: {
    type: 'webhook' | 'endpoint' | 'none'
    id: string | null
    name: string | null
    config?: any
    isActive: boolean
  }
  createdAt: Date
  updatedAt: Date
}

export interface PutEmailAddressByIdRequest {
  isActive?: boolean
  endpointId?: string | null
  webhookId?: string | null
}

export interface PutEmailAddressByIdResponse {
  id: string
  address: string
  isActive: boolean
  domain: {
    name: string
  }
  routing: {
    type: 'webhook' | 'endpoint' | 'none'
  }
  updatedAt: Date
}

export interface DeleteEmailAddressByIdResponse {
  message: string
  cleanup: {
    emailAddress: string
    domain: string
    sesRuleUpdated: boolean
  }
}

/**
 * Enhanced attachment interface supporting both remote and base64 content
 * 
 * For embedding images in HTML using Content-ID (CID):
 * 1. Set content_id to a unique identifier (e.g., "logo-image")
 * 2. Reference it in HTML: <img src="cid:logo-image" />
 * 3. The content_id must be less than 128 characters
 * 
 * @example
 * // Embed an image in email HTML
 * const attachment = {
 *   content: base64ImageData,
 *   filename: "logo.png",
 *   contentType: "image/png",
 *   content_id: "company-logo"
 * }
 * 
 * const html = '<p>Welcome! <img src="cid:company-logo" alt="Company Logo" /></p>'
 */
export interface AttachmentData {
  // Either path OR content required (not both)
  path?: string        // Remote file URL
  content?: string     // Base64 encoded content
  filename: string     // Required display name
  contentType?: string // Optional MIME type (auto-detected if not provided)
  content_id?: string  // Content ID for embedding images in HTML (max 128 chars)
}

// React component type for email rendering
export type ReactEmailComponent = React.ReactElement | React.ComponentType<any>

// Emails API Types (for sending) - Enhanced with full attachment support
export interface PostEmailsRequest {
  from: string
  to: string | string[]
  subject: string
  bcc?: string | string[]
  cc?: string | string[]
  replyTo?: string | string[]
  html?: string
  text?: string
  react?: ReactEmailComponent  // React component for email content
  headers?: Record<string, string>
  attachments?: AttachmentData[]
  tags?: Array<{
    name: string
    value: string
  }>
  scheduled_at?: string  // Schedule email to be sent later (ISO 8601 or natural language like "in 1 hour")
  timezone?: string      // User's timezone for natural language parsing (defaults to UTC)
}

export interface PostEmailsResponse {
  id: string
  messageId?: string  // AWS SES Message ID (only present when email is sent immediately)
  scheduled_at?: string  // ISO 8601 timestamp (only present when email is scheduled)
  status?: 'sent' | 'scheduled'  // Status of the email
  timezone?: string  // Timezone used for scheduling (only present when scheduled)
}

export interface GetEmailByIdResponse {
  object: string
  id: string
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  reply_to: string[]
  subject: string
  text: string
  html: string
  created_at: Date
  last_event: 'pending' | 'delivered' | 'failed'
}

// Reply API Types - Enhanced with full attachment support
export interface PostEmailReplyRequest {
  from: string
  to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject?: string
  text?: string
  html?: string
  replyTo?: string | string[]
  headers?: Record<string, string>
  attachments?: AttachmentData[]
  tags?: Array<{
    name: string
    value: string
  }>
  includeOriginal?: boolean
}

export interface PostEmailReplyResponse {
  id: string
}

// Email Scheduling API Types
export interface PostScheduleEmailRequest {
  from: string
  to: string | string[]
  subject: string
  bcc?: string | string[]
  cc?: string | string[]
  replyTo?: string | string[]
  html?: string
  text?: string
  react?: ReactEmailComponent  // React component for email content
  headers?: Record<string, string>
  attachments?: AttachmentData[]
  tags?: Array<{
    name: string
    value: string
  }>
  scheduled_at: string // ISO 8601 or natural language ("in 1 hour", "tomorrow at 9am")
  timezone?: string    // User's timezone for natural language parsing (defaults to UTC)
}

export interface PostScheduleEmailResponse {
  id: string
  scheduled_at: string // Normalized ISO 8601 timestamp
  status: 'scheduled'
  timezone: string
}

export interface GetScheduledEmailsRequest {
  limit?: number
  offset?: number
  status?: string // Filter by status ('scheduled', 'sent', 'failed', 'cancelled')
}

export interface ScheduledEmailItem {
  id: string
  from: string
  to: string[]
  subject: string
  scheduled_at: string
  status: string
  timezone: string
  created_at: string
  attempts: number
  last_error?: string
}

export interface GetScheduledEmailsResponse {
  data: ScheduledEmailItem[]
  pagination: Pagination
}

export interface GetScheduledEmailResponse {
  id: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string[]
  subject: string
  text?: string
  html?: string
  headers?: Record<string, string>
  attachments?: AttachmentData[]
  tags?: Array<{ name: string; value: string }>
  scheduled_at: string
  timezone: string
  status: string
  attempts: number
  max_attempts: number
  next_retry_at?: string
  last_error?: string
  created_at: string
  updated_at: string
  sent_at?: string
  sent_email_id?: string
}

export interface DeleteScheduledEmailResponse {
  id: string
  status: 'cancelled'
  cancelled_at: string
} 
// User email log types with delivery status
export interface EmailLogDelivery {
  id: string
  type: 'webhook' | 'email_forward' | 'unknown'
  status: 'success' | 'failed' | 'pending' | 'unknown'
  attempts: number
  lastAttemptAt: string | null
  error?: string | null
  deliveryTimeMs?: number | null
  responseCode?: number | null
  responseData?: any
  config?: {
    name: string
    type?: string
    url?: string
    config?: any
  }
}

// Base interface for common email log properties
export interface BaseEmailLogEntry {
  id: string
  emailId: string
  messageId: string
  from: string
  subject: string
  domain: string
  isRead: boolean
  readAt: string | null
  preview: string
  attachmentCount: number
  hasAttachments: boolean
  createdAt: string
  updatedAt: string | null
}

// Inbound email log entry (received emails)
export interface InboundEmailLogEntry extends BaseEmailLogEntry {
  type: 'inbound'
  recipient: string
  receivedAt: string
  parseSuccess: boolean
  parseError: string | null
  processingTimeMs: number
  authResults: {
    spf: string
    dkim: string
    dmarc: string
    spam: string
    virus: string
  }
  deliveries: EmailLogDelivery[]
}

// Outbound email log entry (sent emails)
export interface OutboundEmailLogEntry extends BaseEmailLogEntry {
  type: 'outbound'
  to: string[] // Array of recipients
  cc?: string[] | null
  bcc?: string[] | null
  replyTo?: string[] | null
  status: 'pending' | 'sent' | 'failed'
  provider: string
  sentAt: string | null
  failureReason: string | null
  providerResponse?: any
  idempotencyKey?: string | null
}

// Union type for all email log entries
export type EmailLogEntry = InboundEmailLogEntry | OutboundEmailLogEntry

export interface EmailLogStats {
  totalEmails: number
  inbound: number
  outbound: number
  delivered: number
  failed: number
  pending: number
  noDelivery: number
  avgProcessingTime: number
}

export interface EmailLogsResponse {
  emails: EmailLogEntry[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  filters: {
    uniqueDomains: string[]
  }
  stats: EmailLogStats
}

export interface EmailLogsOptions {
  limit?: number
  offset?: number
  searchQuery?: string
  statusFilter?: 'all' | 'delivered' | 'failed' | 'pending' | 'no_delivery' | 'parse_failed'
  typeFilter?: 'all' | 'inbound' | 'outbound' // New filter for email type
  domainFilter?: string
  timeRange?: '24h' | '7d' | '30d' | '90d'
} 
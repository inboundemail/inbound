// User email log types with delivery status (simplified for list view)
export interface EmailLogDelivery {
  id: string
  type: 'webhook' | 'email_forward' | 'unknown'
  status: 'success' | 'failed' | 'pending' | 'unknown'
  error?: string | null
  responseCode?: number | null
  config?: {
    name: string
    type?: string
  }
}

// Base interface for common email log properties (only fields used in list view)
export interface BaseEmailLogEntry {
  id: string
  emailId: string
  messageId: string
  from: string
  subject: string
  domain: string
  hasAttachments: boolean
  createdAt: string
}

// Inbound email log entry (received emails)
export interface InboundEmailLogEntry extends BaseEmailLogEntry {
  type: 'inbound'
  recipient: string
  parseSuccess: boolean
  processingTimeMs: number
  deliveries: EmailLogDelivery[]
  guardBlocked?: boolean
  guardReason?: string | null
  guardAction?: string | null
}

// Outbound email log entry (sent emails)
export interface OutboundEmailLogEntry extends BaseEmailLogEntry {
  type: 'outbound'
  to: string[] // Array of recipients
  status: 'pending' | 'sent' | 'failed'
  provider: string
  sentAt: string | null
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
  guardFilter?: 'all' | 'blocked' | 'allowed' | 'flagged' // New filter for Guard status
  timeRange?: '24h' | '7d' | '30d' | '90d'
} 
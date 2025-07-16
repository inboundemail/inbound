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

export interface EmailLogEntry {
  id: string
  emailId: string
  messageId: string
  from: string
  recipient: string
  subject: string
  receivedAt: string
  domain: string
  isRead: boolean
  readAt: string | null
  preview: string
  attachmentCount: number
  hasAttachments: boolean
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

export interface EmailLogStats {
  totalEmails: number
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
  domainFilter?: string
  timeRange?: '24h' | '7d' | '30d' | '90d'
} 
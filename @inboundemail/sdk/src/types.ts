/**
 * Type definitions for the Inbound Email SDK
 */

// Base configuration
export interface InboundEmailConfig {
  apiKey: string
  baseUrl?: string
}

// Basic API response structure
export interface ApiResponse<T = any> {
  data: T
  success: boolean
  error?: string
}

// Pagination interface
export interface Pagination {
  limit: number
  offset: number
  total: number
  hasMore?: boolean
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

// Emails API Types (for sending)
export interface PostEmailsRequest {
  from: string
  to: string | string[]
  subject: string
  bcc?: string | string[]
  cc?: string | string[]
  reply_to?: string | string[]
  html?: string
  text?: string
  headers?: Record<string, string>
  attachments?: Array<{
    content: string // Base64 encoded
    filename: string
    path?: string
    content_type?: string
  }>
}

export interface PostEmailsResponse {
  id: string
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

// Reply API Types
export interface PostEmailReplyRequest {
  from: string
  to?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject?: string
  text?: string
  html?: string
  headers?: Record<string, string>
  attachments?: Array<{
    content: string
    filename: string
    path?: string
    content_type?: string
  }>
  include_original?: boolean
}

export interface PostEmailReplyResponse {
  id: string
} 
// Base API response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Domain types
export interface Domain {
  id: string
  domain: string
  status: string
  canReceiveEmails: boolean
  createdAt: string
  updatedAt: string
}

// Email address types
export interface EmailAddress {
  id: string
  address: string
  domainId: string
  webhookId: string | null
  isActive: boolean
  isReceiptRuleConfigured: boolean
  createdAt: string
  updatedAt: string
}

export interface DomainEmailsResponse {
  domain: string
  emails: EmailAddress[]
}

// Webhook types
export interface Webhook {
  id: string
  name: string
  url: string
  description: string | null
  isActive: boolean
  timeout: number
  retryAttempts: number
  totalDeliveries: number
  successfulDeliveries: number
  failedDeliveries: number
  lastUsed: string | null
  createdAt: string
  updatedAt: string
}

export interface WebhookCreateResponse extends Webhook {
  secret: string
}

// Request types
export interface CreateEmailRequest {
  domain: string
  email: string
  webhookId?: string
}

export interface CreateWebhookRequest {
  name: string
  description?: string
  endpoint: string
  retry?: number
  timeout?: number
}

export interface RemoveEmailRequest {
  email: string
}

export interface RemoveWebhookRequest {
  name: string
}

// SDK Configuration
export interface InboundConfig {
  apiKey: string
  baseUrl?: string
}

// Error types
export class InboundError extends Error {
  public status?: number
  public code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'InboundError'
    this.status = status
    this.code = code
  }
} 
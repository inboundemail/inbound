// Use native fetch API (available in Node.js 18+ and all modern browsers)
import {
  InboundConfig,
  InboundError,
  ApiResponse,
  Domain,
  EmailAddress,
  DomainEmailsResponse,
  Webhook,
  WebhookCreateResponse,
  CreateEmailRequest,
  CreateWebhookRequest,
  RemoveEmailRequest,
  RemoveWebhookRequest
} from './types'

export class InboundClient {
  private apiKey: string
  private baseUrl: string

  constructor(config: InboundConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl || 'https://api.inbound.email/api/v1'
  }

  /**
   * Make an HTTP request to the API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      })

      const data: ApiResponse<T> = await response.json()

      if (!response.ok) {
        throw new InboundError(
          data.error || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.status.toString()
        )
      }

      if (!data.success && data.error) {
        throw new InboundError(data.error)
      }

      return data.data as T
    } catch (error) {
      if (error instanceof InboundError) {
        throw error
      }

      // Network or parsing errors
      throw new InboundError(
        error instanceof Error ? error.message : 'Unknown error occurred'
      )
    }
  }

  // Domain methods
  
  /**
   * List all domains for the authenticated user
   */
  async listDomains(): Promise<Domain[]> {
    return this.request<Domain[]>('/domains')
  }

  /**
   * Create a new email address on a domain
   */
  async createEmail(params: CreateEmailRequest): Promise<EmailAddress> {
    return this.request<EmailAddress>('/domains', {
      method: 'POST',
      body: JSON.stringify(params)
    })
  }

  /**
   * List all email addresses for a specific domain
   */
  async listEmails(domain: string): Promise<DomainEmailsResponse> {
    return this.request<DomainEmailsResponse>(`/domains/${encodeURIComponent(domain)}/emails`)
  }

  /**
   * Remove an email address from a domain
   */
  async removeEmail(domain: string, email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/domains/${encodeURIComponent(domain)}/emails`, {
      method: 'DELETE',
      body: JSON.stringify({ email })
    })
  }

  // Webhook methods

  /**
   * List all webhooks for the authenticated user
   */
  async listWebhooks(): Promise<Webhook[]> {
    return this.request<Webhook[]>('/webhooks')
  }

  /**
   * Create a new webhook
   */
  async createWebhook(params: CreateWebhookRequest): Promise<WebhookCreateResponse> {
    return this.request<WebhookCreateResponse>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(params)
    })
  }

  /**
   * Remove a webhook by name
   */
  async removeWebhook(name: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/webhooks', {
      method: 'DELETE',
      body: JSON.stringify({ name })
    })
  }

  // Convenience methods with better naming

  /**
   * Create an email address (alias for createEmail)
   */
  async addEmail(domain: string, email: string, webhookId?: string): Promise<EmailAddress> {
    return this.createEmail({ domain, email, webhookId })
  }

  /**
   * Delete an email address (alias for removeEmail)
   */
  async deleteEmail(domain: string, email: string): Promise<{ message: string }> {
    return this.removeEmail(domain, email)
  }

  /**
   * Get emails for a domain (alias for listEmails)
   */
  async getEmails(domain: string): Promise<EmailAddress[]> {
    const response = await this.listEmails(domain)
    return response.emails
  }

  /**
   * Get all domains (alias for listDomains)
   */
  async getDomains(): Promise<Domain[]> {
    return this.listDomains()
  }

  /**
   * Get all webhooks (alias for listWebhooks)
   */
  async getWebhooks(): Promise<Webhook[]> {
    return this.listWebhooks()
  }

  /**
   * Add a webhook (alias for createWebhook)
   */
  async addWebhook(
    name: string,
    endpoint: string,
    options?: {
      description?: string
      retry?: number
      timeout?: number
    }
  ): Promise<WebhookCreateResponse> {
    return this.createWebhook({
      name,
      endpoint,
      description: options?.description,
      retry: options?.retry,
      timeout: options?.timeout
    })
  }

  /**
   * Delete a webhook (alias for removeWebhook)
   */
  async deleteWebhook(name: string): Promise<{ message: string }> {
    return this.removeWebhook(name)
  }
} 
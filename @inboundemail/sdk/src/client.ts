/**
 * Main client class for the Inbound Email SDK
 */

import type { 
  InboundEmailConfig,
  // Mail API
  GetMailRequest, GetMailResponse, PostMailRequest, PostMailResponse, GetMailByIdResponse,
  // Endpoints API  
  GetEndpointsRequest, GetEndpointsResponse, PostEndpointsRequest, PostEndpointsResponse,
  GetEndpointByIdResponse, PutEndpointByIdRequest, PutEndpointByIdResponse, DeleteEndpointByIdResponse,
  // Domains API
  GetDomainsRequest, GetDomainsResponse, PostDomainsRequest, PostDomainsResponse,
  GetDomainByIdResponse, PutDomainByIdRequest, PutDomainByIdResponse,
  // Email Addresses API
  GetEmailAddressesRequest, GetEmailAddressesResponse, PostEmailAddressesRequest, PostEmailAddressesResponse,
  GetEmailAddressByIdResponse, PutEmailAddressByIdRequest, PutEmailAddressByIdResponse, DeleteEmailAddressByIdResponse,
  // Emails API (sending)
  PostEmailsRequest, PostEmailsResponse, GetEmailByIdResponse,
  // Reply API
  PostEmailReplyRequest, PostEmailReplyResponse
} from './types'
import type { InboundWebhookEmail } from './webhook-types'
import { buildQueryString } from './utils'
import { getSenderInfo } from './webhook-types'

// Extended config interface for default reply settings
export interface InboundEmailConfigExtended extends InboundEmailConfig {
  defaultReplyFrom?: string
}

export class InboundEmailClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly defaultReplyFrom?: string

  constructor(config: InboundEmailConfigExtended | string) {
    if (typeof config === 'string') {
      this.apiKey = config
      this.baseUrl = 'https://inbound.new/api/v2'
      this.defaultReplyFrom = undefined
    } else {
      this.apiKey = config.apiKey
      this.baseUrl = config.baseUrl || 'https://inbound.new/api/v2'
      this.defaultReplyFrom = config.defaultReplyFrom
    }
    
    if (!this.apiKey) {
      throw new Error('API key is required')
    }
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Mail API - for managing received emails
   */
  mail = {
    /**
     * List all emails in the mailbox
     */
    list: async (params?: GetMailRequest): Promise<GetMailResponse> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetMailResponse>(`/mail${queryString}`)
    },

    /**
     * Get a specific email by ID
     */
    get: async (id: string): Promise<GetMailByIdResponse> => {
      return this.request<GetMailByIdResponse>(`/mail/${id}`)
    },

    /**
     * Reply to an email
     */
    reply: async (params: PostMailRequest): Promise<PostMailResponse> => {
      return this.request<PostMailResponse>('/mail', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
  }

  /**
   * Endpoints API - for managing webhook and email endpoints
   */
  endpoints = {
    /**
     * List all endpoints
     */
    list: async (params?: GetEndpointsRequest): Promise<GetEndpointsResponse> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetEndpointsResponse>(`/endpoints${queryString}`)
    },

    /**
     * Create a new endpoint
     */
    create: async (params: PostEndpointsRequest): Promise<PostEndpointsResponse> => {
      return this.request<PostEndpointsResponse>('/endpoints', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a specific endpoint by ID
     */
    get: async (id: string): Promise<GetEndpointByIdResponse> => {
      return this.request<GetEndpointByIdResponse>(`/endpoints/${id}`)
    },

    /**
     * Update an endpoint
     */
    update: async (id: string, params: PutEndpointByIdRequest): Promise<PutEndpointByIdResponse> => {
      return this.request<PutEndpointByIdResponse>(`/endpoints/${id}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      })
    },

    /**
     * Delete an endpoint
     */
    delete: async (id: string): Promise<DeleteEndpointByIdResponse> => {
      return this.request<DeleteEndpointByIdResponse>(`/endpoints/${id}`, {
        method: 'DELETE',
      })
    },
  }

  /**
   * Domains API - for managing email domains
   */
  domains = {
    /**
     * List all domains
     */
    list: async (params?: GetDomainsRequest): Promise<GetDomainsResponse> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetDomainsResponse>(`/domains${queryString}`)
    },

    /**
     * Create a new domain
     */
    create: async (params: PostDomainsRequest): Promise<PostDomainsResponse> => {
      return this.request<PostDomainsResponse>('/domains', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a specific domain by ID
     */
    get: async (id: string): Promise<GetDomainByIdResponse> => {
      return this.request<GetDomainByIdResponse>(`/domains/${id}`)
    },

    /**
     * Update domain settings (catch-all configuration)
     */
    update: async (id: string, params: PutDomainByIdRequest): Promise<PutDomainByIdResponse> => {
      return this.request<PutDomainByIdResponse>(`/domains/${id}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      })
    },
  }

  /**
   * Email Addresses API - for managing individual email addresses
   */
  emailAddresses = {
    /**
     * List all email addresses
     */
    list: async (params?: GetEmailAddressesRequest): Promise<GetEmailAddressesResponse> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetEmailAddressesResponse>(`/email-addresses${queryString}`)
    },

    /**
     * Create a new email address
     */
    create: async (params: PostEmailAddressesRequest): Promise<PostEmailAddressesResponse> => {
      return this.request<PostEmailAddressesResponse>('/email-addresses', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a specific email address by ID
     */
    get: async (id: string): Promise<GetEmailAddressByIdResponse> => {
      return this.request<GetEmailAddressByIdResponse>(`/email-addresses/${id}`)
    },

    /**
     * Update an email address
     */
    update: async (id: string, params: PutEmailAddressByIdRequest): Promise<PutEmailAddressByIdResponse> => {
      return this.request<PutEmailAddressByIdResponse>(`/email-addresses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      })
    },

    /**
     * Delete an email address
     */
    delete: async (id: string): Promise<DeleteEmailAddressByIdResponse> => {
      return this.request<DeleteEmailAddressByIdResponse>(`/email-addresses/${id}`, {
        method: 'DELETE',
      })
    },
  }

  /**
   * Emails API - for sending emails (Resend-compatible)
   */
  emails = {
    /**
     * Send an email
     */
    send: async (params: PostEmailsRequest): Promise<PostEmailsResponse> => {
      return this.request<PostEmailsResponse>('/emails', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a sent email by ID
     */
    get: async (id: string): Promise<GetEmailByIdResponse> => {
      return this.request<GetEmailByIdResponse>(`/emails/${id}`)
    },

    /**
     * Reply to an email by ID
     */
    reply: async (id: string, params: PostEmailReplyRequest): Promise<PostEmailReplyResponse> => {
      return this.request<PostEmailReplyResponse>(`/emails/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
  }

  /**
   * Legacy send method for backwards compatibility (similar to Resend)
   */
  send = async (params: PostEmailsRequest): Promise<PostEmailsResponse> => {
    return this.emails.send(params)
  }

  /**
   * Streamlined reply method for webhook handlers
   * Works directly with webhook email objects for better DX
   * 
   * Usage:
   * - inbound.reply(email, "Thanks for your message!")
   * - inbound.reply(email, { from: "support@domain.com", text: "Thanks!" })
   * - inbound.reply("email-id", { from: "support@domain.com", text: "Thanks!" })
   */
  reply = async (
    emailOrId: InboundWebhookEmail | string,
    replyContent: string | {
      from?: string
      text?: string
      html?: string
      subject?: string
      to?: string | string[]
      cc?: string | string[]
      bcc?: string | string[]
      headers?: Record<string, string>
      attachments?: Array<{
        content: string
        filename: string
        path?: string
        content_type?: string
      }>
      include_original?: boolean
    }
  ): Promise<PostEmailReplyResponse> => {
    // Determine email ID
    const emailId = typeof emailOrId === 'string' ? emailOrId : emailOrId.id

    // Handle simple string reply
    if (typeof replyContent === 'string') {
      // Need a from address - check if we have a default configured
      if (!this.defaultReplyFrom) {
        throw new Error(
          'To use simple string replies like inbound.reply(email, "thanks"), you need to configure a defaultReplyFrom address:\n\n' +
          'const inbound = new Inbound({\n' +
          '  apiKey: "your-key",\n' +
          '  defaultReplyFrom: "support@yourdomain.com"\n' +
          '})\n\n' +
          'Or use the full syntax: inbound.reply(email, { from: "support@yourdomain.com", text: "thanks" })'
        )
      }

      // Create reply with default from address
      return this.emails.reply(emailId, {
        from: this.defaultReplyFrom,
        text: replyContent,
      })
    }

    // Handle full reply object
    const replyParams = { ...replyContent }
    
    // If no from address provided, use default if available
    if (!replyParams.from && this.defaultReplyFrom) {
      replyParams.from = this.defaultReplyFrom
    }

    // Validate that we have a from address
    if (!replyParams.from) {
      throw new Error(
        'Reply requires a "from" address. Either:\n' +
        '1. Configure defaultReplyFrom: new Inbound({ apiKey: "key", defaultReplyFrom: "support@domain.com" })\n' +
        '2. Or provide it in the reply: inbound.reply(email, { from: "support@domain.com", text: "thanks" })'
      )
    }

    return this.emails.reply(emailId, replyParams as PostEmailReplyRequest)
  }

  // Convenience aliases for better developer experience
  endpoint = this.endpoints
  domain = this.domains
  emailAddress = this.emailAddresses
  email = this.emails
} 
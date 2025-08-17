/**
 * Main client class for the Inbound Email SDK
 */

import type { 
  // Core response types
  ApiResponse,
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

export class InboundEmailClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || 'https://inbound.new/api/v2'
    
    if (!this.apiKey) {
      throw new Error('API key is required')
    }
  }

  /**
   * Make an authenticated request to the API with { data, error } response pattern
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      let responseData: any = {}
      try {
        responseData = await response.json()
      } catch (jsonError) {
        // If JSON parsing fails, use empty object
        responseData = {}
      }

      if (!response.ok) {
        return {
          error: (responseData && typeof responseData === 'object' && responseData.error) || `HTTP ${response.status}: ${response.statusText}`
        }
      }

      return {
        data: responseData as T
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error occurred'
      }
    }
  }

  /**
   * Mail API - for managing received emails
   */
  mail = {
    /**
     * List all emails in the mailbox
     */
    list: async (params?: GetMailRequest): Promise<ApiResponse<GetMailResponse>> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetMailResponse>(`/mail${queryString}`)
    },

    /**
     * Get a specific email by ID
     */
    get: async (id: string): Promise<ApiResponse<GetMailByIdResponse>> => {
      return this.request<GetMailByIdResponse>(`/mail/${id}`)
    },

    /**
     * Reply to an email
     */
    reply: async (params: PostMailRequest): Promise<ApiResponse<PostMailResponse>> => {
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
    list: async (params?: GetEndpointsRequest): Promise<ApiResponse<GetEndpointsResponse>> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetEndpointsResponse>(`/endpoints${queryString}`)
    },

    /**
     * Create a new endpoint
     */
    create: async (params: PostEndpointsRequest): Promise<ApiResponse<PostEndpointsResponse>> => {
      return this.request<PostEndpointsResponse>('/endpoints', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a specific endpoint by ID
     */
    get: async (id: string): Promise<ApiResponse<GetEndpointByIdResponse>> => {
      return this.request<GetEndpointByIdResponse>(`/endpoints/${id}`)
    },

    /**
     * Update an endpoint
     */
    update: async (id: string, params: PutEndpointByIdRequest): Promise<ApiResponse<PutEndpointByIdResponse>> => {
      return this.request<PutEndpointByIdResponse>(`/endpoints/${id}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      })
    },

    /**
     * Delete an endpoint
     */
    delete: async (id: string): Promise<ApiResponse<DeleteEndpointByIdResponse>> => {
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
    list: async (params?: GetDomainsRequest): Promise<ApiResponse<GetDomainsResponse>> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetDomainsResponse>(`/domains${queryString}`)
    },

    /**
     * Create a new domain
     */
    create: async (params: PostDomainsRequest): Promise<ApiResponse<PostDomainsResponse>> => {
      return this.request<PostDomainsResponse>('/domains', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a specific domain by ID
     */
    get: async (id: string): Promise<ApiResponse<GetDomainByIdResponse>> => {
      return this.request<GetDomainByIdResponse>(`/domains/${id}`)
    },

    /**
     * Update domain settings (catch-all configuration)
     */
    update: async (id: string, params: PutDomainByIdRequest): Promise<ApiResponse<PutDomainByIdResponse>> => {
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
    list: async (params?: GetEmailAddressesRequest): Promise<ApiResponse<GetEmailAddressesResponse>> => {
      const queryString = params ? buildQueryString(params) : ''
      return this.request<GetEmailAddressesResponse>(`/email-addresses${queryString}`)
    },

    /**
     * Create a new email address
     */
    create: async (params: PostEmailAddressesRequest): Promise<ApiResponse<PostEmailAddressesResponse>> => {
      return this.request<PostEmailAddressesResponse>('/email-addresses', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a specific email address by ID
     */
    get: async (id: string): Promise<ApiResponse<GetEmailAddressByIdResponse>> => {
      return this.request<GetEmailAddressByIdResponse>(`/email-addresses/${id}`)
    },

    /**
     * Update an email address
     */
    update: async (id: string, params: PutEmailAddressByIdRequest): Promise<ApiResponse<PutEmailAddressByIdResponse>> => {
      return this.request<PutEmailAddressByIdResponse>(`/email-addresses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      })
    },

    /**
     * Delete an email address
     */
    delete: async (id: string): Promise<ApiResponse<DeleteEmailAddressByIdResponse>> => {
      return this.request<DeleteEmailAddressByIdResponse>(`/email-addresses/${id}`, {
        method: 'DELETE',
      })
    },
  }

  /**
   * Emails API - for sending emails with enhanced attachment support
   */
  emails = {
    /**
     * Send an email with optional attachments
     * Supports both remote files (path) and base64 content
     */
    send: async (params: PostEmailsRequest): Promise<ApiResponse<PostEmailsResponse>> => {
      return this.request<PostEmailsResponse>('/emails', {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },

    /**
     * Get a sent email by ID
     */
    get: async (id: string): Promise<ApiResponse<GetEmailByIdResponse>> => {
      return this.request<GetEmailByIdResponse>(`/emails/${id}`)
    },

    /**
     * Reply to an email by ID with optional attachments
     */
    reply: async (id: string, params: PostEmailReplyRequest): Promise<ApiResponse<PostEmailReplyResponse>> => {
      return this.request<PostEmailReplyResponse>(`/emails/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify(params),
      })
    },
  }

  /**
   * Legacy send method for backwards compatibility
   */
  send = async (params: PostEmailsRequest): Promise<ApiResponse<PostEmailsResponse>> => {
    return this.emails.send(params)
  }

  /**
   * Streamlined reply method for webhook handlers
   * Works directly with webhook email objects for better DX
   * 
   * Usage:
   * - inbound.reply("email-id", { from: "support@domain.com", text: "Thanks!" })
   * - inbound.reply(email, { from: "support@domain.com", text: "Thanks!" })
   */
  reply = async (
    emailOrId: InboundWebhookEmail | string,
    replyParams: PostEmailReplyRequest
  ): Promise<ApiResponse<PostEmailReplyResponse>> => {
    // Determine email ID
    const emailId = typeof emailOrId === 'string' ? emailOrId : emailOrId.id

    // Validate that we have a from address
    if (!replyParams.from) {
      return {
        error: 'Reply requires a "from" address.'
      }
    }

    return this.emails.reply(emailId, replyParams)
  }

  // Convenience aliases for better developer experience
  endpoint = this.endpoints
  domain = this.domains
  emailAddress = this.emailAddresses
  email = this.emails
} 
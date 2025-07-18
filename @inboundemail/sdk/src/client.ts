/**
 * Main client class for the Inbound Email SDK
 */

import type { InboundEmailConfig } from './types'

export class InboundEmailClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(config: InboundEmailConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl || 'https://api.inbound.email'
    
    if (!this.apiKey) {
      throw new Error('API key is required')
    }
  }

  /**
   * Get the current API key (for internal use)
   */
  protected getApiKey(): string {
    return this.apiKey
  }

  /**
   * Get the base URL (for internal use)
   */
  protected getBaseUrl(): string {
    return this.baseUrl
  }
} 
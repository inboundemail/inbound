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
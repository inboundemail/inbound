import { webhooks } from '@/lib/db/schema'

// Infer the webhook type from the database schema
export type Webhook = typeof webhooks.$inferSelect

// Helper type for creating webhooks
export type CreateWebhookData = {
  name: string
  url: string
  description?: string
  headers?: Record<string, string>
  timeout?: number
  retryAttempts?: number
}

// Helper type for updating webhooks
export type UpdateWebhookData = {
  name?: string
  url?: string
  description?: string
  isActive?: boolean
  headers?: Record<string, string>
  timeout?: number
  retryAttempts?: number
}

// Test result types
export type WebhookTestResult = {
  success: boolean
  statusCode?: number
  message?: string
  error?: string
  responseTime?: number
  responseBody?: string
  responseHeaders?: Record<string, string>
  details?: {
    url?: string
    timeout?: number
    statusText?: string
    errorType?: string
    originalError?: string
  }
} 
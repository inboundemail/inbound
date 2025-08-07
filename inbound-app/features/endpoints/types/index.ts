import { endpoints, emailGroups, endpointDeliveries, WEBHOOK_FORMATS } from '@/lib/db/schema'
import type { WebhookFormat } from '@/lib/db/schema'

// Database types using Drizzle inference (following project patterns)
export type Endpoint = typeof endpoints.$inferSelect
export type NewEndpoint = typeof endpoints.$inferInsert
export type EmailGroup = typeof emailGroups.$inferSelect
export type NewEmailGroup = typeof emailGroups.$inferInsert
export type EndpointDelivery = typeof endpointDeliveries.$inferSelect
export type NewEndpointDelivery = typeof endpointDeliveries.$inferInsert

// Endpoint configuration types
export type WebhookConfig = {
  url: string
  secret?: string
  headers?: Record<string, string>
  timeout?: number
  retryAttempts?: number
}

export type EmailForwardConfig = {
  forwardTo: string
  includeAttachments?: boolean
  subjectPrefix?: string
  fromAddress?: string // Which verified domain email to send from
}

export type EmailGroupConfig = {
  emails: string[]
  includeAttachments?: boolean
  subjectPrefix?: string
  fromAddress?: string // Which verified domain email to send from
}

// Union type for all config types
export type EndpointConfig = WebhookConfig | EmailForwardConfig | EmailGroupConfig

// Action types for server actions
export type CreateEndpointData = {
  name: string
  type: 'webhook' | 'email' | 'email_group'
  webhookFormat?: WebhookFormat // Only relevant for webhook type
  description?: string
  config: EndpointConfig
}

export type UpdateEndpointData = {
  name?: string
  description?: string
  isActive?: boolean
  webhookFormat?: WebhookFormat // Only relevant for webhook type
  config?: EndpointConfig
}

// Component props types
export type EndpointListProps = {
  endpoints: Endpoint[]
  onSelect?: (endpoint: Endpoint) => void
}

export type EndpointFormProps = {
  endpoint?: Endpoint
  onSubmit: (data: CreateEndpointData | UpdateEndpointData) => void
  onCancel: () => void
}

// Delivery history types
export type EndpointDeliveryHistory = {
  endpoint: Endpoint
  deliveries: EndpointDelivery[]
  totalCount: number
  successCount: number
  failureCount: number
} 
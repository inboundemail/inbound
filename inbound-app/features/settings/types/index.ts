import { Customer } from 'autumn-js'

// Re-export Customer type from Autumn
export type { Customer } from 'autumn-js'

// Domain stats response type
export interface DomainStatsResponse {
  totalDomains: number
  verifiedDomains: number
  totalEmailAddresses: number
  totalEmailsLast24h: number
  limits?: {
    allowed: boolean
    unlimited: boolean
    balance: number | null
    current: number
    remaining: number | null
  } | null
}

// API Key types (these should ideally come from auth client types)
export interface ApiKey {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  userId: string
  enabled: boolean
  rateLimitEnabled: boolean
  rateLimitTimeWindow: number | null
  rateLimitMax: number | null
  requestCount: number | null
  remaining: number | null
  lastRequest: Date | null
  expiresAt: Date | null
  createdAt: string
  updatedAt: string
  permissions: { [key: string]: string[] } | null
  metadata: Record<string, any> | null
}

// Form types for API operations
export interface CreateApiKeyData {
  name?: string
  prefix?: string
}

export interface UpdateApiKeyData {
  keyId: string
  name?: string
  enabled?: boolean
}

// UI component types
export interface CreateApiKeyForm {
  name: string
  prefix: string
}

export interface CircularProgressProps {
  value: number
  max: number
  size?: number
  strokeWidth?: number
  className?: string
  children?: React.ReactNode
} 
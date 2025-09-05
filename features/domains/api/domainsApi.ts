// Domains API service layer
import { getDomainStats } from '@/app/actions/primary'

export interface DomainStats {
  id: string
  domain: string
  status: string
  isVerified: boolean
  isCatchAllEnabled: boolean
  catchAllWebhookId: string | null
  catchAllEndpointId: string | null
  emailAddressCount: number
  emailsLast24h: number
  createdAt: string
  updatedAt: string
}

export interface DomainStatsResponse {
  domains: DomainStats[]
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

export interface DomainDetails {
  domain: {
    id: string
    domain: string
    status: string
    isVerified: boolean
    createdAt: string
    updatedAt: string
  }
  dnsRecords: Array<{
    type: string
    name: string
    value: string
    status: 'verified' | 'pending' | 'failed'
    lastChecked: string
  }>
  emailAddresses: Array<{
    id: string
    address: string
    isActive: boolean
    createdAt: string
  }>
  recentEmails: Array<{
    id: string
    from: string
    subject: string
    receivedAt: string
    status: string
  }>
}

export const domainsApi = {
  // Fetch domain statistics using server action
  getDomainStats: async (): Promise<DomainStatsResponse> => {
    const result = await getDomainStats()
    
    if ('error' in result) {
      throw new Error(result.error || 'Failed to fetch domain statistics')
    }
    
    return result
  },

  // Fetch domain details by ID
  getDomainDetails: async (domainId: string): Promise<DomainDetails> => {
    const response = await fetch(`/api/domain/${domainId}`)
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Domain not found')
      }
      throw new Error('Failed to fetch domain details')
    }
    
    return response.json()
  },

  // Verify domain DNS records
  verifyDomain: async (domainId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`/api/domain/${domainId}/verify`, {
      method: 'POST',
    })
    
    if (!response.ok) {
      throw new Error('Failed to verify domain')
    }
    
    return response.json()
  },
} 
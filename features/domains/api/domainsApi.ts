// Domains API service layer
export interface DomainStats {
  id: string
  domain: string
  status: string
  isVerified: boolean
  emailAddressCount: number
  emailsLast24h: number
  createdAt: string
  updatedAt: string
}

export interface DomainStatsResponse {
  domains: DomainStats[]
  totalDomains: number
  verifiedDomains: number
  pendingDomains: number
  failedDomains: number
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
  // Fetch domain statistics
  getDomainStats: async (): Promise<DomainStatsResponse> => {
    const response = await fetch('/api/domain/stats')
    
    if (!response.ok) {
      throw new Error('Failed to fetch domain statistics')
    }
    
    return response.json()
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
import { emailDomains, domainDnsRecords } from '@/lib/db/schema'

// Primary types from schema
export type EmailDomain = typeof emailDomains.$inferSelect
export type NewEmailDomain = typeof emailDomains.$inferInsert
export type DomainDnsRecord = typeof domainDnsRecords.$inferSelect
export type NewDomainDnsRecord = typeof domainDnsRecords.$inferInsert

// API response types for v2 endpoints
export interface DnsRecordV2 {
  id: string
  domainId: string
  recordType: string
  name: string
  value: string
  priority?: number | null
  isRequired: boolean
  isVerified: boolean
  lastChecked: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface GetDomainDnsRecordsResponse {
  domainId: string
  domain: string
  records: DnsRecordV2[]
  valid: boolean
}

// Action-specific types
export interface CreateDomainData {
  domain: string
  description?: string
}

export interface UpdateDomainData {
  domain?: string
  description?: string
  status?: 'pending' | 'verified' | 'failed'
}

// Component props types
export interface DomainListProps {
  domains: EmailDomain[]
  onSelect?: (domain: EmailDomain) => void
}

export interface DnsRecordListProps {
  records: DnsRecordV2[]
  valid: boolean
  onRefresh?: () => void
}
import { z } from 'zod'
import { emailDomains } from '@/lib/db/schema'

// Infer base type from database schema
export type Domain = typeof emailDomains.$inferSelect

// Create domain input
export const CreateDomainSchema = z.object({
  domain: z.string().min(1).max(255).describe('The domain name to add'),
  isCatchAllEnabled: z.boolean().default(false).describe('Enable catch-all for unmatched email addresses'),
  catchAllEndpointId: z.string().uuid().optional().describe('The endpoint ID to route catch-all emails to')
})

export type CreateDomainInput = z.infer<typeof CreateDomainSchema>

// Update domain input
export const UpdateDomainSchema = z.object({
  isCatchAllEnabled: z.boolean().optional().describe('Enable or disable catch-all'),
  catchAllEndpointId: z.string().uuid().nullable().optional().describe('Update the catch-all endpoint'),
  mailFromDomain: z.string().min(1).max(255).nullable().optional().describe('Custom MAIL FROM domain')
})

export type UpdateDomainInput = z.infer<typeof UpdateDomainSchema>

// Get domain input
export const GetDomainSchema = z.object({
  id: z.string().uuid().describe('The domain ID'),
  check: z.boolean().default(false).describe('Perform DNS and SES verification check')
})

export type GetDomainInput = z.infer<typeof GetDomainSchema>

// List domains input
export const ListDomainsSchema = z.object({
  limit: z.number().min(1).max(100).default(50).describe('Number of results to return'),
  offset: z.number().min(0).default(0).describe('Number of results to skip'),
  status: z.enum(['active', 'pending', 'failed', 'verified']).optional().describe('Filter by domain status')
})

export type ListDomainsInput = z.infer<typeof ListDomainsSchema>

// Domain stats
export interface DomainStats {
  totalEmailAddresses: number
  activeEmailAddresses: number
  emailsLast24h: number
  emailsLast7d: number
  emailsLast30d: number
}

// Catch-all endpoint info
export interface CatchAllEndpointInfo {
  id: string
  name: string
  type: string
  isActive: boolean
}

// DNS record verification
export interface DNSRecord {
  type: string
  name: string
  value: string
  isVerified: boolean
  error?: string
}

// Domain verification check
export interface DomainVerificationCheck {
  dnsRecords?: DNSRecord[]
  sesStatus?: string
  dkimStatus?: string
  dkimVerified?: boolean
  dkimTokens?: string[]
  mailFromDomain?: string
  mailFromStatus?: string
  mailFromVerified?: boolean
  isFullyVerified?: boolean
  lastChecked?: Date
}

// Domain response type with additional computed fields
export interface DomainResponse extends Domain {
  stats?: DomainStats
  catchAllEndpoint?: CatchAllEndpointInfo | null
  verificationCheck?: DomainVerificationCheck
}



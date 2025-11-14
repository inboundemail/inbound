import { z } from 'zod'
import { emailAddresses } from '@/lib/db/schema'

// Infer base type from database schema
export type EmailAddressRecord = typeof emailAddresses.$inferSelect

// Create email address input
export const CreateEmailAddressSchema = z.object({
  email: z.string().email().describe('The full email address (e.g., info@example.com)'),
  domainId: z.string().uuid().describe('The domain this email address belongs to'),
  endpointId: z.string().uuid().describe('The endpoint to route emails to'),
  isActive: z.boolean().default(true).describe('Whether the email address is active')
})

export type CreateEmailAddressInput = z.infer<typeof CreateEmailAddressSchema>

// Update email address input
export const UpdateEmailAddressSchema = z.object({
  endpointId: z.string().uuid().optional().describe('Update the routing endpoint'),
  isActive: z.boolean().optional().describe('Enable or disable the email address')
})

export type UpdateEmailAddressInput = z.infer<typeof UpdateEmailAddressSchema>

// Get email address input
export const GetEmailAddressSchema = z.object({
  id: z.string().uuid().describe('The email address ID')
})

export type GetEmailAddressInput = z.infer<typeof GetEmailAddressSchema>

// List email addresses input
export const ListEmailAddressesSchema = z.object({
  limit: z.number().min(1).max(100).default(50).describe('Number of results to return'),
  offset: z.number().min(0).default(0).describe('Number of results to skip'),
  domainId: z.string().uuid().optional().describe('Filter by domain'),
  isActive: z.boolean().optional().describe('Filter by active status'),
  search: z.string().optional().describe('Search by email address')
})

export type ListEmailAddressesInput = z.infer<typeof ListEmailAddressesSchema>

// Email address stats
export interface EmailAddressStats {
  totalEmails: number
  emailsLast24h: number
  emailsLast7d: number
  emailsLast30d: number
  lastEmailAt: Date | null
}

// Email address response type with additional computed fields
export interface EmailAddressResponse extends EmailAddressRecord {
  stats?: EmailAddressStats
  domain?: {
    id: string
    domain: string
    status: string
  }
  endpoint?: {
    id: string
    name: string
    type: string
    isActive: boolean
  }
}



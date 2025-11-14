import { z } from 'zod'
import { structuredEmails, emailAddresses } from '@/lib/db/schema'

// Infer base types from database schema
export type StructuredEmail = typeof structuredEmails.$inferSelect
export type EmailAddress = typeof emailAddresses.$inferSelect

// Send email input
export const SendEmailSchema = z.object({
  from: z.string().email().describe('Sender email address'),
  to: z.union([
    z.string().email(),
    z.array(z.string().email())
  ]).describe('Recipient email address(es)'),
  cc: z.union([
    z.string().email(),
    z.array(z.string().email())
  ]).optional().describe('CC recipients'),
  bcc: z.union([
    z.string().email(),
    z.array(z.string().email())
  ]).optional().describe('BCC recipients'),
  subject: z.string().min(1).describe('Email subject'),
  html: z.string().optional().describe('HTML body'),
  text: z.string().optional().describe('Plain text body'),
  replyTo: z.string().email().optional().describe('Reply-to address'),
  headers: z.record(z.string()).optional().describe('Custom headers'),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    contentType: z.string().optional()
  })).optional().describe('Email attachments')
})

export type SendEmailInput = z.infer<typeof SendEmailSchema>

// Get email input
export const GetEmailSchema = z.object({
  id: z.string().uuid().describe('The email ID')
})

export type GetEmailInput = z.infer<typeof GetEmailSchema>

// List emails input
export const ListEmailsSchema = z.object({
  limit: z.number().min(1).max(100).default(50).describe('Number of results to return'),
  offset: z.number().min(0).default(0).describe('Number of results to skip'),
  domainId: z.string().uuid().optional().describe('Filter by domain'),
  emailAddressId: z.string().uuid().optional().describe('Filter by email address'),
  from: z.string().optional().describe('Filter by sender'),
  to: z.string().optional().describe('Filter by recipient'),
  subject: z.string().optional().describe('Search by subject'),
  startDate: z.string().datetime().optional().describe('Filter emails after this date'),
  endDate: z.string().datetime().optional().describe('Filter emails before this date')
})

export type ListEmailsInput = z.infer<typeof ListEmailsSchema>

// Email attachment info
export interface EmailAttachment {
  id: string
  filename: string
  contentType: string
  size: number
  url?: string
}

// Email response type with additional computed fields
export interface EmailResponse extends StructuredEmail {
  attachments?: EmailAttachment[]
  thread?: {
    id: string
    messageCount: number
  }
  emailAddress?: {
    id: string
    email: string
    domainId: string
  }
}

// Send email response
export interface SendEmailResponse {
  id: string
  messageId: string
  status: string
  createdAt: Date
}



import { emailDomains } from '@/lib/db/schema'

// Infer from database schema
export type EmailDomain = typeof emailDomains.$inferSelect
export type NewEmailDomain = typeof emailDomains.$inferInsert

// DMARC-specific types
export type DmarcCaptureSettings = {
  isDmarcCaptureEnabled: boolean
}

export type UpdateDmarcCaptureData = {
  isDmarcCaptureEnabled: boolean
}
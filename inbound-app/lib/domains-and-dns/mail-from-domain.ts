import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getSesSourceEmail, isServerSideDkimEnabled } from '@/lib/email-management/dkim-config'

/**
 * Get the configured MAIL FROM domain for a sender domain
 * This is used to eliminate "via amazonses.com" in sent emails
 * 
 * @param fromAddress - The sender email address (e.g., "user@example.com") 
 * @param userId - The user ID for security validation
 * @returns The MAIL FROM domain (e.g., "mail.example.com") or null if not configured
 */
export async function getMailFromDomain(fromAddress: string, userId: string): Promise<string | null> {
  try {
    // Extract domain from email address
    const domain = fromAddress.split('@')[1]
    if (!domain) {
      console.log('❌ getMailFromDomain - Invalid email format:', fromAddress)
      return null
    }

    console.log(`🔍 getMailFromDomain - Looking up MAIL FROM domain for: ${domain}`)

    // If using server-side DKIM (like Resend), return the appropriate source domain
    if (isServerSideDkimEnabled()) {
      // Look up custom MAIL FROM domain first
      const domainRecord = await db
        .select({
          mailFromDomain: emailDomains.mailFromDomain,
          status: emailDomains.status
        })
        .from(emailDomains)
        .where(
          and(
            eq(emailDomains.domain, domain),
            eq(emailDomains.userId, userId),
            eq(emailDomains.status, 'verified')
          )
        )
        .limit(1)

      const customMailFromDomain = domainRecord[0]?.mailFromDomain || null
      const sourceForSes = getSesSourceEmail(fromAddress, customMailFromDomain)
      
      console.log('🔐 Server-side DKIM enabled, using SES source:', sourceForSes)
      return sourceForSes
    }

    // Legacy behavior: look up configured MAIL FROM domain
    const domainRecord = await db
      .select({
        mailFromDomain: emailDomains.mailFromDomain,
        status: emailDomains.status
      })
      .from(emailDomains)
      .where(
        and(
          eq(emailDomains.domain, domain),
          eq(emailDomains.userId, userId),
          eq(emailDomains.status, 'verified')
        )
      )
      .limit(1)

    if (!domainRecord[0]) {
      console.log(`❌ getMailFromDomain - Domain not found or not verified: ${domain}`)
      return null
    }

    const mailFromDomain = domainRecord[0].mailFromDomain
    console.log(`✅ getMailFromDomain - Found MAIL FROM domain: ${mailFromDomain || 'not configured'}`)

    return mailFromDomain || null

  } catch (error) {
    console.error('❌ getMailFromDomain - Error retrieving MAIL FROM domain:', error)
    return null
  }
}

/**
 * Extract domain from email address
 * 
 * @param email - Email address
 * @returns Domain part of the email or empty string if invalid
 */
export function extractDomainFromEmail(email: string): string {
  const match = email.match(/@([^@]+)$/)
  return match ? match[1] : ''
}
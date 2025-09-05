import { db } from '@/lib/db'
import { blockedEmails, emailDomains, emailAddresses } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || ''
}

/**
 * Check if an email address is already blocked
 */
export async function isEmailBlocked(emailAddress: string): Promise<boolean> {
  try {
    const blocked = await db
      .select({ id: blockedEmails.id })
      .from(blockedEmails)
      .where(eq(blockedEmails.emailAddress, emailAddress.toLowerCase()))
      .limit(1)

    return blocked.length > 0
  } catch (error) {
    console.error('Error checking if email is blocked:', error)
    return false
  }
}

/**
 * Block an email address if it's on a catch-all domain
 * This function only blocks emails from catch-all domains, not manually added email addresses
 */
export async function blockEmail(
  emailAddress: string, 
  blockedBy: string, 
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailAddress)) {
      return {
        success: false,
        error: 'Invalid email format'
      }
    }

    const normalizedEmail = emailAddress.toLowerCase()
    const domain = extractDomain(normalizedEmail)

    if (!domain) {
      return {
        success: false,
        error: 'Could not extract domain from email address'
      }
    }

    // Check if email is already blocked
    const alreadyBlocked = await isEmailBlocked(normalizedEmail)
    if (alreadyBlocked) {
      return {
        success: false,
        error: 'Email address is already blocked'
      }
    }

    // Look up the domain to check if it exists and is catch-all
    const domainRecord = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        isCatchAllEnabled: emailDomains.isCatchAllEnabled,
        userId: emailDomains.userId
      })
      .from(emailDomains)
      .where(eq(emailDomains.domain, domain))
      .limit(1)

    if (!domainRecord[0]) {
      return {
        success: false,
        error: `Domain ${domain} not found in the system`
      }
    }

    const domainData = domainRecord[0]

    // Check if this is a manually added email address (not catch-all)
    const manualEmailRecord = await db
      .select({ id: emailAddresses.id })
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.address, normalizedEmail),
        eq(emailAddresses.domainId, domainData.id)
      ))
      .limit(1)

    if (manualEmailRecord[0]) {
      return {
        success: false,
        error: 'Cannot block manually added email addresses. Only catch-all emails can be blocked.'
      }
    }

    // Check if domain has catch-all enabled
    if (!domainData.isCatchAllEnabled) {
      return {
        success: false,
        error: `Domain ${domain} does not have catch-all enabled. Only emails from catch-all domains can be blocked.`
      }
    }

    // Create the blocked email record
    const blockedEmailRecord = {
      id: nanoid(),
      emailAddress: normalizedEmail,
      domainId: domainData.id,
      reason: reason || null,
      blockedBy: blockedBy,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await db.insert(blockedEmails).values(blockedEmailRecord)

    console.log(`✅ Email blocking - Successfully blocked ${normalizedEmail} on catch-all domain ${domain}`)

    return {
      success: true,
      message: `Successfully blocked ${normalizedEmail} from catch-all domain ${domain}`
    }

  } catch (error) {
    console.error('Error blocking email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred while blocking email'
    }
  }
}

/**
 * Unblock an email address
 */
export async function unblockEmail(
  emailAddress: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const normalizedEmail = emailAddress.toLowerCase()

    // Check if email is blocked
    const blockedRecord = await db
      .select({ id: blockedEmails.id })
      .from(blockedEmails)
      .where(eq(blockedEmails.emailAddress, normalizedEmail))
      .limit(1)

    if (!blockedRecord[0]) {
      return {
        success: false,
        error: 'Email address is not blocked'
      }
    }

    // Remove from blocked list
    await db
      .delete(blockedEmails)
      .where(eq(blockedEmails.emailAddress, normalizedEmail))

    console.log(`✅ Email blocking - Successfully unblocked ${normalizedEmail}`)

    return {
      success: true,
      message: `Successfully unblocked ${normalizedEmail}`
    }

  } catch (error) {
    console.error('Error unblocking email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred while unblocking email'
    }
  }
}

/**
 * Get all blocked emails for a domain
 */
export async function getBlockedEmailsForDomain(domainId: string): Promise<{
  success: boolean
  blockedEmails?: Array<{
    id: string
    emailAddress: string
    reason: string | null
    blockedBy: string
    createdAt: Date | null
  }>
  error?: string
}> {
  try {
    const blocked = await db
      .select({
        id: blockedEmails.id,
        emailAddress: blockedEmails.emailAddress,
        reason: blockedEmails.reason,
        blockedBy: blockedEmails.blockedBy,
        createdAt: blockedEmails.createdAt
      })
      .from(blockedEmails)
      .where(eq(blockedEmails.domainId, domainId))

    return {
      success: true,
      blockedEmails: blocked
    }

  } catch (error) {
    console.error('Error getting blocked emails for domain:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Get all blocked emails for a user (across all their domains)
 */
export async function getBlockedEmailsForUser(userId: string): Promise<{
  success: boolean
  blockedEmails?: Array<{
    id: string
    emailAddress: string
    domain: string
    reason: string | null
    blockedBy: string
    createdAt: Date | null
  }>
  error?: string
}> {
  try {
    const blocked = await db
      .select({
        id: blockedEmails.id,
        emailAddress: blockedEmails.emailAddress,
        domain: emailDomains.domain,
        reason: blockedEmails.reason,
        blockedBy: blockedEmails.blockedBy,
        createdAt: blockedEmails.createdAt
      })
      .from(blockedEmails)
      .innerJoin(emailDomains, eq(blockedEmails.domainId, emailDomains.id))
      .where(eq(emailDomains.userId, userId))

    return {
      success: true,
      blockedEmails: blocked
    }

  } catch (error) {
    console.error('Error getting blocked emails for user:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
} 
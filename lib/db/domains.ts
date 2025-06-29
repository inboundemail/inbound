import { db } from './index'
import { emailDomains, domainDnsRecords, emailAddresses, type EmailDomain, type NewEmailDomain, type DomainDnsRecord, type NewDomainDnsRecord, type EmailAddress, type NewEmailAddress } from './schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export interface DomainWithRecords extends EmailDomain {
  dnsRecords: DomainDnsRecord[]
  emailAddresses?: EmailAddress[]
}

/**
 * Create a new domain verification record
 */
export async function createDomainVerification(
  domain: string,
  userId: string,
  dnsCheckResult: {
    canReceiveEmails: boolean
    hasMxRecords: boolean
    provider?: {
      name: string
      confidence: 'high' | 'medium' | 'low'
    }
  }
): Promise<EmailDomain> {
  const domainRecord: NewEmailDomain = {
    id: `indm_${nanoid()}`,
    domain,
    userId,
    status: 'pending',
    canReceiveEmails: dnsCheckResult.canReceiveEmails,
    hasMxRecords: dnsCheckResult.hasMxRecords,
    domainProvider: dnsCheckResult.provider?.name,
    providerConfidence: dnsCheckResult.provider?.confidence,
    lastDnsCheck: new Date(),
    updatedAt: new Date(),
  }

  const [created] = await db.insert(emailDomains).values(domainRecord).returning()
  return created
}

/**
 * Update domain with SES verification information
 */
export async function updateDomainSesVerification(
  domainId: string,
  verificationToken: string,
  sesStatus: string,
  dnsRecords: Array<{ type: string; name: string; value: string }>
): Promise<EmailDomain> {
  // Update the domain record
  const [updated] = await db
    .update(emailDomains)
    .set({
      verificationToken,
      status: sesStatus === 'Success' ? 'verified' : 'pending',
      lastSesCheck: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailDomains.id, domainId))
    .returning()

  // Insert or update DNS records
  for (const record of dnsRecords) {
    const dnsRecord: NewDomainDnsRecord = {
      id: `dns_${nanoid()}`,
      domainId,
      recordType: record.type,
      name: record.name,
      value: record.value,
      isRequired: true,
      isVerified: false,
    }

    await db.insert(domainDnsRecords).values(dnsRecord).onConflictDoNothing()
  }

  return updated
}

/**
 * Get domain with DNS records by domain name and user ID
 */
export async function getDomainWithRecords(domain: string, userId: string): Promise<DomainWithRecords | null> {
  const domainRecord = await db
    .select()
    .from(emailDomains)
    .where(and(eq(emailDomains.domain, domain), eq(emailDomains.userId, userId)))
    .limit(1)

  if (!domainRecord[0]) return null

  const dnsRecords = await db
    .select()
    .from(domainDnsRecords)
    .where(eq(domainDnsRecords.domainId, domainRecord[0].id))

  return {
    ...domainRecord[0],
    dnsRecords,
  }
}

/**
 * Update DNS record verification status
 */
export async function updateDnsRecordVerification(
  domainId: string,
  recordType: string,
  name: string,
  isVerified: boolean
): Promise<void> {
  await db
    .update(domainDnsRecords)
    .set({
      isVerified,
      lastChecked: new Date(),
    })
    .where(
      and(
        eq(domainDnsRecords.domainId, domainId),
        eq(domainDnsRecords.recordType, recordType),
        eq(domainDnsRecords.name, name)
      )
    )
}

/**
 * Check if all required DNS records are verified
 */
export async function areAllDnsRecordsVerified(domainId: string): Promise<boolean> {
  const records = await db
    .select()
    .from(domainDnsRecords)
    .where(and(eq(domainDnsRecords.domainId, domainId), eq(domainDnsRecords.isRequired, true)))

  return records.length > 0 && records.every(record => record.isVerified)
}

/**
 * Update domain status based on verification progress
 */
export async function updateDomainStatus(domainId: string, status: string): Promise<EmailDomain> {
  const [updated] = await db
    .update(emailDomains)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(emailDomains.id, domainId))
    .returning()

  return updated
}

/**
 * Create a new email address for a domain
 */
export async function createEmailAddress(
  address: string,
  domainId: string,
  userId: string
): Promise<EmailAddress> {
  const emailRecord: NewEmailAddress = {
    id: `email_${nanoid()}`,
    address,
    domainId,
    userId,
    isActive: true,
    isReceiptRuleConfigured: false,
    updatedAt: new Date(),
  }

  const [created] = await db.insert(emailAddresses).values(emailRecord).returning()
  return created
}

/**
 * Get email addresses for a domain
 */
export async function getEmailAddressesForDomain(domainId: string): Promise<EmailAddress[]> {
  return db
    .select()
    .from(emailAddresses)
    .where(eq(emailAddresses.domainId, domainId))
}

/**
 * Update email address receipt rule status
 */
export async function updateEmailAddressReceiptRule(
  emailId: string,
  isConfigured: boolean,
  ruleName?: string
): Promise<EmailAddress> {
  const [updated] = await db
    .update(emailAddresses)
    .set({
      isReceiptRuleConfigured: isConfigured,
      receiptRuleName: ruleName,
      updatedAt: new Date(),
    })
    .where(eq(emailAddresses.id, emailId))
    .returning()

  return updated
}

/**
 * Get domain with DNS records and email addresses
 */
export async function getDomainWithRecordsAndEmails(domain: string, userId: string): Promise<DomainWithRecords | null> {
  const domainRecord = await db
    .select()
    .from(emailDomains)
    .where(and(eq(emailDomains.domain, domain), eq(emailDomains.userId, userId)))
    .limit(1)

  if (!domainRecord[0]) return null

  const dnsRecords = await db
    .select()
    .from(domainDnsRecords)
    .where(eq(domainDnsRecords.domainId, domainRecord[0].id))

  const emailAddressList = await db
    .select()
    .from(emailAddresses)
    .where(eq(emailAddresses.domainId, domainRecord[0].id))

  return {
    ...domainRecord[0],
    dnsRecords,
    emailAddresses: emailAddressList,
  }
}

/**
 * Delete a domain and all its related records from the database
 */
export async function deleteDomainFromDatabase(domainId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify the domain belongs to the user
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, userId)))
      .limit(1)

    if (!domainRecord[0]) {
      return {
        success: false,
        error: 'Domain not found or access denied'
      }
    }

    console.log(`🗑️ Deleting domain from database: ${domainRecord[0].domain}`)

    // Delete all email addresses for this domain
    await db
      .delete(emailAddresses)
      .where(eq(emailAddresses.domainId, domainId))

    // Delete all DNS records for this domain
    await db
      .delete(domainDnsRecords)
      .where(eq(domainDnsRecords.domainId, domainId))

    // Delete the domain record
    await db
      .delete(emailDomains)
      .where(eq(emailDomains.id, domainId))

    console.log(`✅ Successfully deleted domain from database: ${domainRecord[0].domain}`)

    return { success: true }

  } catch (error) {
    console.error('Database domain deletion error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete domain from database'
    }
  }
}

/**
 * Enable catch-all for a domain
 */
export async function enableDomainCatchAll(
  domainId: string,
  webhookId: string,
  receiptRuleName: string
): Promise<EmailDomain> {
  const [updated] = await db
    .update(emailDomains)
    .set({
      isCatchAllEnabled: true,
      catchAllWebhookId: webhookId,
      catchAllReceiptRuleName: receiptRuleName,
      updatedAt: new Date(),
    })
    .where(eq(emailDomains.id, domainId))
    .returning()

  if (!updated) {
    throw new Error('Domain not found')
  }

  return updated
}

/**
 * Disable catch-all for a domain
 */
export async function disableDomainCatchAll(domainId: string): Promise<EmailDomain> {
  const [updated] = await db
    .update(emailDomains)
    .set({
      isCatchAllEnabled: false,
      catchAllWebhookId: null,
      catchAllReceiptRuleName: null,
      updatedAt: new Date(),
    })
    .where(eq(emailDomains.id, domainId))
    .returning()

  if (!updated) {
    throw new Error('Domain not found')
  }

  return updated
}

/**
 * Get domain with catch-all configuration
 */
export async function getDomainWithCatchAll(domain: string, userId: string): Promise<EmailDomain | null> {
  const [domainRecord] = await db
    .select()
    .from(emailDomains)
    .where(and(eq(emailDomains.domain, domain), eq(emailDomains.userId, userId)))
    .limit(1)

  return domainRecord || null
}

/**
 * Check if domain has catch-all enabled
 */
export async function isDomainCatchAllEnabled(domainId: string): Promise<boolean> {
  const [domain] = await db
    .select({ isCatchAllEnabled: emailDomains.isCatchAllEnabled })
    .from(emailDomains)
    .where(eq(emailDomains.id, domainId))
    .limit(1)

  return domain?.isCatchAllEnabled || false
}

/**
 * Get domain owner information by domain name
 * Returns the user details for the domain owner to send notifications
 */
export async function getDomainOwnerByDomain(domain: string): Promise<{ userId: string; userEmail: string; userName: string | null } | null> {
  try {
    // Import user table from auth schema
    const { user } = await import('./auth-schema')
    
    const result = await db
      .select({
        userId: emailDomains.userId,
        userEmail: user.email,
        userName: user.name,
      })
      .from(emailDomains)
      .innerJoin(user, eq(emailDomains.userId, user.id))
      .where(eq(emailDomains.domain, domain))
      .limit(1)

    if (!result[0]) {
      console.log(`❌ getDomainOwnerByDomain - No owner found for domain: ${domain}`)
      return null
    }

    console.log(`✅ getDomainOwnerByDomain - Found owner for domain ${domain}: ${result[0].userEmail}`)
    return result[0]
  } catch (error) {
    console.error('❌ getDomainOwnerByDomain - Error looking up domain owner:', error)
    return null
  }
}

/**
 * Update domain status to verified
 */
export async function markDomainAsVerified(domain: string): Promise<EmailDomain | null> {
  try {
    const [updated] = await db
      .update(emailDomains)
      .set({
        status: 'verified',
        lastSesCheck: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailDomains.domain, domain))
      .returning()

    if (updated) {
      console.log(`✅ markDomainAsVerified - Domain ${domain} marked as verified`)
    }

    return updated || null
  } catch (error) {
    console.error('❌ markDomainAsVerified - Error updating domain status:', error)
    return null
  }
} 
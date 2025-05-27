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
    id: nanoid(),
    domain,
    userId,
    status: 'pending',
    dnsCheckPassed: dnsCheckResult.canReceiveEmails,
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
      sesVerificationStatus: sesStatus,
      status: sesStatus === 'Success' ? 'ses_verified' : 'dns_verified',
      lastSesCheck: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailDomains.id, domainId))
    .returning()

  // Insert or update DNS records
  for (const record of dnsRecords) {
    const dnsRecord: NewDomainDnsRecord = {
      id: nanoid(),
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
    id: nanoid(),
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
import { db } from './index'
import { emailDomains, domainDnsRecords, emailAddresses, type EmailDomain, type NewEmailDomain, type DomainDnsRecord, type NewDomainDnsRecord, type EmailAddress, type NewEmailAddress } from './schema'
import { eq, and, inArray, like, ne } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getRootDomain, isSubdomain } from '@/lib/domains-and-dns/domain-utils'

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
 * Update domain with SES verification information and tenant association
 */
export async function updateDomainSesVerification(
  domainId: string,
  verificationToken: string,
  sesStatus: string,
  dnsRecords: Array<{ type: string; name: string; value: string; description?: string }>,
  mailFromDomain?: string,
  mailFromDomainStatus?: string,
  tenantId?: string // NEW: Optional tenant ID for tenant association
): Promise<EmailDomain> {
  // Update the domain record with MAIL FROM domain information and tenant association
  const updateData: any = {
    verificationToken,
    status: sesStatus === 'Success' ? 'verified' : 'pending',
    lastSesCheck: new Date(),
    updatedAt: new Date(),
  }

  // Add MAIL FROM domain fields if provided
  if (mailFromDomain) {
    updateData.mailFromDomain = mailFromDomain
  }
  if (mailFromDomainStatus) {
    updateData.mailFromDomainStatus = mailFromDomainStatus
    // Set verification timestamp if MAIL FROM domain is verified
    if (mailFromDomainStatus === 'Success') {
      updateData.mailFromDomainVerifiedAt = new Date()
    }
  }
  
  // Add tenant ID if provided (NEW TENANT INTEGRATION)
  if (tenantId) {
    updateData.tenantId = tenantId
    console.log(`📝 Storing tenant ID ${tenantId} for domain`)
  }

  const [updated] = await db
    .update(emailDomains)
    .set(updateData)
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
 * Update domain status to verified, and run a full verification check so
 * downstream flags (DNS records, canReceiveEmails, MAIL FROM) stay in sync.
 *
 * Callers — notably the AWS Health SNS webhook at
 * `app/api/inbound/health/route.ts` — only know the domain string, and the
 * previous implementation flipped `status` but left `canReceiveEmails = false`,
 * which kept the catch-all gate and send guards blocked.
 */
export async function markDomainAsVerified(domain: string): Promise<EmailDomain | null> {
  try {
    const now = new Date()
    const [updated] = await db
      .update(emailDomains)
      .set({
        status: 'verified',
        lastSesCheck: now,
        updatedAt: now,
      })
      .where(eq(emailDomains.domain, domain))
      .returning()

    if (!updated) {
      return null
    }

    console.log(`✅ markDomainAsVerified - Domain ${domain} marked as verified`)

    // Re-run the full verification check so DNS record statuses and
    // canReceiveEmails are persisted alongside the status flip. Imported
    // lazily — this module (`lib/db/domains`) is pulled in by hot paths that
    // don't need the AWS SES SDK (email fetching, address management, etc.),
    // and the verification-check module transitively loads `@aws-sdk/client-ses`
    // at import time. Keeping it behind a dynamic import avoids eagerly loading
    // ~MB of AWS SDK code on every request that only needs DB helpers.
    try {
      const { runDomainVerificationCheck } = await import(
        '@/lib/domains-and-dns/domain-verification-check'
      )
      const checkResult = await runDomainVerificationCheck(updated)
      if (checkResult.error) {
        console.warn(
          `⚠️ markDomainAsVerified - post-verification check reported error for ${domain}: ${checkResult.error}`,
        )
      }

      // Return the latest row after the check so callers see canReceiveEmails.
      const [refreshed] = await db
        .select()
        .from(emailDomains)
        .where(eq(emailDomains.id, updated.id))
        .limit(1)
      return refreshed || updated
    } catch (checkError) {
      console.error(
        `❌ markDomainAsVerified - Failed to run post-verification check for ${domain}:`,
        checkError,
      )
      return updated
    }
  } catch (error) {
    console.error('❌ markDomainAsVerified - Error updating domain status:', error)
    return null
  }
}

/**
 * Get verified parent domain for a subdomain
 * Returns the verified root domain if it exists for the user
 * 
 * @example
 * getVerifiedParentDomain('mail.example.com', userId) 
 * // Returns EmailDomain for 'example.com' if it exists and is verified
 */
export async function getVerifiedParentDomain(
  subdomain: string, 
  userId: string
): Promise<EmailDomain | null> {
  const rootDomain = getRootDomain(subdomain)
  if (!rootDomain) return null
  
  const [parent] = await db
    .select()
    .from(emailDomains)
    .where(and(
      eq(emailDomains.domain, rootDomain),
      eq(emailDomains.userId, userId),
      eq(emailDomains.status, 'verified')
    ))
    .limit(1)
  
  return parent || null
}

/**
 * Get all subdomains that depend on a root domain
 * Finds all domains that have the given root domain as their parent
 * 
 * @example
 * getDependentSubdomains('example.com', userId)
 * // Returns ['mail.example.com', 'docs.example.com', 'app.example.com'] etc.
 */
export async function getDependentSubdomains(
  rootDomain: string,
  userId: string
): Promise<EmailDomain[]> {
  // Get all domains for the user
  const allDomains = await db
    .select()
    .from(emailDomains)
    .where(eq(emailDomains.userId, userId))
  
  // Filter to find subdomains of the root domain
  return allDomains.filter(d => {
    if (d.domain === rootDomain) return false // Exclude self
    if (!isSubdomain(d.domain)) return false // Only check subdomains
    const domainRoot = getRootDomain(d.domain)
    return domainRoot === rootDomain
  })
} 

/**
 * Domains that can claim a subdomain's mail via "include subdomains", nearest first,
 * up to and including the registrable root.
 *
 * @example
 * getParentDomainCandidates('a.b.example.com') // ['b.example.com', 'example.com']
 */
export function getParentDomainCandidates(domain: string): string[] {
  const root = getRootDomain(domain)
  if (!root || domain === root || !domain.endsWith('.' + root)) return []

  const labels = domain.split('.')
  const candidates: string[] = []
  for (let i = 1; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.')
    candidates.push(candidate)
    if (candidate === root) break
  }
  return candidates
}

function nearestDomain<T extends { domain: string }>(rows: T[]): T | null {
  return rows.reduce<T | null>(
    (best, row) => (!best || row.domain.length > best.domain.length ? row : best),
    null
  )
}

/**
 * Verified ancestor of `domain` that has "include subdomains" enabled, regardless of owner.
 * Used on the receiving path, where the recipient domain is not yet tied to a user.
 */
export async function findWildcardParentDomain(domain: string): Promise<EmailDomain | null> {
  const candidates = getParentDomainCandidates(domain)
  if (candidates.length === 0) return null

  const rows = await db
    .select()
    .from(emailDomains)
    .where(and(
      inArray(emailDomains.domain, candidates),
      eq(emailDomains.includeSubdomains, true),
      eq(emailDomains.status, 'verified')
    ))

  return nearestDomain(rows)
}

/**
 * Ancestor of `domain` with "include subdomains" enabled that belongs to someone else.
 * Verification status is deliberately ignored so a lapsed parent still blocks claims.
 */
export async function findWildcardAncestorOwnedByOthers(
  domain: string,
  userId: string
): Promise<EmailDomain | null> {
  const candidates = getParentDomainCandidates(domain)
  if (candidates.length === 0) return null

  const rows = await db
    .select()
    .from(emailDomains)
    .where(and(
      inArray(emailDomains.domain, candidates),
      eq(emailDomains.includeSubdomains, true),
      ne(emailDomains.userId, userId)
    ))

  return nearestDomain(rows)
}

/**
 * Subdomains of `rootDomain` registered by users other than `userId`.
 */
export async function findSubdomainsOwnedByOthers(
  rootDomain: string,
  userId: string
): Promise<EmailDomain[]> {
  return db
    .select()
    .from(emailDomains)
    .where(and(
      like(emailDomains.domain, `%.${rootDomain}`),
      ne(emailDomains.userId, userId)
    ))
}

export interface InboundDomainOwner {
  userId: string
  domain: string
  status: string
  canReceiveEmails: boolean | null
  viaWildcard: boolean
}

/**
 * Resolve which account receives mail addressed to `domain`.
 *
 * A verified exact row always wins. Otherwise a verified ancestor with "include
 * subdomains" wins, so an unverified exact row can never capture mail on a wildcard
 * domain (the domain-create guard blocks this; this is the defensive second layer).
 * With no wildcard ancestor, any exact row is used as before.
 */
export async function resolveInboundDomainOwner(domain: string): Promise<InboundDomainOwner | null> {
  const candidates = getParentDomainCandidates(domain)

  const rows = await db
    .select({
      userId: emailDomains.userId,
      domain: emailDomains.domain,
      status: emailDomains.status,
      canReceiveEmails: emailDomains.canReceiveEmails,
      includeSubdomains: emailDomains.includeSubdomains,
    })
    .from(emailDomains)
    .where(inArray(emailDomains.domain, [domain, ...candidates]))

  const exact = rows.find(row => row.domain === domain)
  if (exact?.status === 'verified') {
    return { ...exact, viaWildcard: false }
  }

  const wildcard = nearestDomain(
    rows.filter(row => row.domain !== domain && row.includeSubdomains && row.status === 'verified')
  )
  if (wildcard) {
    return { ...wildcard, viaWildcard: true }
  }

  return exact ? { ...exact, viaWildcard: false } : null
}

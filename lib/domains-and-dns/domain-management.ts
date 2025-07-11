/**
 * Domain Management Library - Comprehensive domain operations for v2 API
 * 
 * Provides unified domain management functions including:
 * - Domain listing with filtering, pagination, and enhanced metadata
 * - Domain details with DNS records, email addresses, and catch-all configuration
 * - Domain updates and configuration management
 * - Integration with existing DNS utilities and verification functions
 */

import { db } from '@/lib/db'
import { emailDomains, domainDnsRecords, emailAddresses, endpoints, type EmailDomain } from '@/lib/db/schema'
import { eq, and, count, desc, or, like, sql } from 'drizzle-orm'
import { detectDomainProvider, getDetailedProviderInfo } from './dns'
import { verifyDnsRecords } from './dns'

/**
 * Domain listing filters and pagination
 */
export interface DomainListFilters {
  status?: 'verified' | 'pending' | 'failed'
  canReceive?: boolean
  search?: string
  hasCatchAll?: boolean
  provider?: string
}

export interface DomainListPagination {
  limit?: number
  offset?: number
}

/**
 * Enhanced domain with statistics and metadata
 */
export interface EnhancedDomain extends EmailDomain {
  stats: {
    totalEmailAddresses: number
    activeEmailAddresses: number
    hasCatchAll: boolean
  }
  catchAllEndpoint?: {
    id: string
    name: string
    type: string
    isActive: boolean
  } | null
  isVerified: boolean
  provider?: {
    name: string
    icon: string
    detected: boolean
    confidence: 'high' | 'medium' | 'low'
  }
}

/**
 * Domain details with complete information
 */
export interface DomainDetails extends EnhancedDomain {
  dnsRecords: Array<{
    id: string
    type: string
    name: string
    value: string
    isRequired: boolean
    isVerified: boolean
    lastChecked: Date | null
  }>
  emailAddresses: Array<{
    id: string
    address: string
    isActive: boolean
    endpointId: string | null
    webhookId: string | null
    endpoint?: {
      id: string
      name: string
      type: string
      isActive: boolean
    } | null
    createdAt: Date
    updatedAt: Date
  }>
}

/**
 * List domains with filtering, pagination, and enhanced metadata
 */
export async function listDomains(
  userId: string,
  filters: DomainListFilters = {},
  pagination: DomainListPagination = {}
): Promise<{
  domains: EnhancedDomain[]
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
  meta: {
    totalCount: number
    verifiedCount: number
    withCatchAllCount: number
    statusBreakdown: {
      verified: number
      pending: number
      failed: number
    }
  }
}> {
  const limit = Math.min(pagination.limit || 50, 100)
  const offset = pagination.offset || 0

  // Build where conditions
  const conditions = [eq(emailDomains.userId, userId)]

  if (filters.status) {
    conditions.push(eq(emailDomains.status, filters.status))
  }

  if (filters.canReceive !== undefined) {
    conditions.push(eq(emailDomains.canReceiveEmails, filters.canReceive))
  }

  if (filters.search) {
    conditions.push(like(emailDomains.domain, `%${filters.search}%`))
  }

  if (filters.hasCatchAll !== undefined) {
    if (filters.hasCatchAll) {
      conditions.push(sql`${emailDomains.catchAllEndpointId} IS NOT NULL`)
    } else {
      conditions.push(sql`${emailDomains.catchAllEndpointId} IS NULL`)
    }
  }

  if (filters.provider) {
    conditions.push(eq(emailDomains.domainProvider, filters.provider))
  }

  const whereConditions = conditions.length > 1 ? and(...conditions) : conditions[0]

  // Get domains with enhanced data
  const domainsQuery = db
    .select({
      id: emailDomains.id,
      domain: emailDomains.domain,
      status: emailDomains.status,
      canReceiveEmails: emailDomains.canReceiveEmails,
      hasMxRecords: emailDomains.hasMxRecords,
      catchAllEndpointId: emailDomains.catchAllEndpointId,
      catchAllWebhookId: emailDomains.catchAllWebhookId,
      catchAllReceiptRuleName: emailDomains.catchAllReceiptRuleName,
      verificationToken: emailDomains.verificationToken,
      domainProvider: emailDomains.domainProvider,
      providerConfidence: emailDomains.providerConfidence,
      lastDnsCheck: emailDomains.lastDnsCheck,
      lastSesCheck: emailDomains.lastSesCheck,
      isCatchAllEnabled: emailDomains.isCatchAllEnabled,
      createdAt: emailDomains.createdAt,
      updatedAt: emailDomains.updatedAt,
      userId: emailDomains.userId
    })
    .from(emailDomains)
    .where(whereConditions)

  const domains = await domainsQuery
    .orderBy(desc(emailDomains.createdAt))
    .limit(limit)
    .offset(offset)

  // Get total count for pagination
  const totalCountResult = await db
    .select({ count: count() })
    .from(emailDomains)
    .where(whereConditions)
  
  const totalCount = totalCountResult[0]?.count || 0

  // Enhance domains with additional data
  const enhancedDomains = await Promise.all(
    domains.map(async (domain): Promise<EnhancedDomain> => {
      // Get email address counts
      const emailCountResult = await db
        .select({ count: count() })
        .from(emailAddresses)
        .where(eq(emailAddresses.domainId, domain.id))
      
      const emailCount = emailCountResult[0]?.count || 0

      const activeEmailCountResult = await db
        .select({ count: count() })
        .from(emailAddresses)
        .where(and(
          eq(emailAddresses.domainId, domain.id),
          eq(emailAddresses.isActive, true)
        ))
      
      const activeEmailCount = activeEmailCountResult[0]?.count || 0

      // Get catch-all endpoint info if configured
      let catchAllEndpoint = null
      if (domain.catchAllEndpointId) {
        const endpointResult = await db
          .select({
            id: endpoints.id,
            name: endpoints.name,
            type: endpoints.type,
            isActive: endpoints.isActive
          })
          .from(endpoints)
          .where(eq(endpoints.id, domain.catchAllEndpointId))
          .limit(1)
        
        catchAllEndpoint = endpointResult[0] ? {
          id: endpointResult[0].id,
          name: endpointResult[0].name,
          type: endpointResult[0].type,
          isActive: endpointResult[0].isActive || false
        } : null
      }

      // Get provider information if available
      let provider = undefined
      if (domain.domainProvider) {
        provider = {
          name: domain.domainProvider,
          icon: getProviderIcon(domain.domainProvider),
          detected: true,
          confidence: (domain.providerConfidence as 'high' | 'medium' | 'low') || 'medium'
        }
      }

      return {
        ...domain,
        stats: {
          totalEmailAddresses: emailCount,
          activeEmailAddresses: activeEmailCount,
          hasCatchAll: !!domain.catchAllEndpointId
        },
        catchAllEndpoint,
        isVerified: domain.status === 'verified',
        provider
      }
    })
  )

  // Calculate meta statistics
  const verifiedCount = enhancedDomains.filter(d => d.isVerified).length
  const withCatchAllCount = enhancedDomains.filter(d => d.stats.hasCatchAll).length
  const statusBreakdown = {
    verified: enhancedDomains.filter(d => d.status === 'verified').length,
    pending: enhancedDomains.filter(d => d.status === 'pending').length,
    failed: enhancedDomains.filter(d => d.status === 'failed').length
  }

  return {
    domains: enhancedDomains,
    pagination: {
      limit,
      offset,
      total: totalCount,
      hasMore: offset + limit < totalCount
    },
    meta: {
      totalCount,
      verifiedCount,
      withCatchAllCount,
      statusBreakdown
    }
  }
}

/**
 * Get detailed domain information with DNS records and email addresses
 */
export async function getDomainDetails(
  domainId: string,
  userId: string,
  refreshProvider: boolean = false
): Promise<DomainDetails | null> {
  // Get domain record
  const domainResult = await db
    .select()
    .from(emailDomains)
    .where(and(
      eq(emailDomains.id, domainId),
      eq(emailDomains.userId, userId)
    ))
    .limit(1)

  if (!domainResult[0]) {
    return null
  }

  const domain = domainResult[0]

  // Get DNS records
  const dnsRecordsResult = await db
    .select({
      id: domainDnsRecords.id,
      type: domainDnsRecords.recordType,
      name: domainDnsRecords.name,
      value: domainDnsRecords.value,
      isRequired: domainDnsRecords.isRequired,
      isVerified: domainDnsRecords.isVerified,
      lastChecked: domainDnsRecords.lastChecked
    })
    .from(domainDnsRecords)
    .where(eq(domainDnsRecords.domainId, domainId))

  const dnsRecords = dnsRecordsResult.map(record => ({
    id: record.id,
    type: record.type,
    name: record.name,
    value: record.value,
    isRequired: record.isRequired || false,
    isVerified: record.isVerified || false,
    lastChecked: record.lastChecked
  }))

  // Get email addresses with endpoint information
  const emailAddressesResult = await db
    .select({
      id: emailAddresses.id,
      address: emailAddresses.address,
      isActive: emailAddresses.isActive,
      endpointId: emailAddresses.endpointId,
      webhookId: emailAddresses.webhookId,
      createdAt: emailAddresses.createdAt,
      updatedAt: emailAddresses.updatedAt,
      // Endpoint information
      endpointName: endpoints.name,
      endpointType: endpoints.type,
      endpointIsActive: endpoints.isActive
    })
    .from(emailAddresses)
    .leftJoin(endpoints, eq(emailAddresses.endpointId, endpoints.id))
    .where(eq(emailAddresses.domainId, domainId))

  const emailAddressesWithEndpoints = emailAddressesResult.map(ea => ({
    id: ea.id,
    address: ea.address,
    isActive: ea.isActive || false,
    endpointId: ea.endpointId,
    webhookId: ea.webhookId,
    endpoint: ea.endpointName ? {
      id: ea.endpointId!,
      name: ea.endpointName,
      type: ea.endpointType!,
      isActive: ea.endpointIsActive || false
    } : null,
    createdAt: ea.createdAt || new Date(),
    updatedAt: ea.updatedAt || new Date()
  }))

  // Get enhanced domain data
  const enhancedDomainResult = await listDomains(userId, {}, { limit: 1, offset: 0 })
  const enhancedDomain = enhancedDomainResult.domains.find(d => d.id === domainId)

  if (!enhancedDomain) {
    return null
  }

  // Refresh provider information if requested
  if (refreshProvider) {
    try {
      const providerInfo = await detectDomainProvider(domain.domain)
      if (providerInfo) {
        // Update domain with new provider information
        await db
          .update(emailDomains)
          .set({
            domainProvider: providerInfo.name,
            providerConfidence: providerInfo.confidence,
            updatedAt: new Date()
          })
          .where(eq(emailDomains.id, domainId))

        enhancedDomain.provider = providerInfo
        enhancedDomain.domainProvider = providerInfo.name
        enhancedDomain.providerConfidence = providerInfo.confidence
      }
    } catch (error) {
      console.warn(`Failed to refresh provider info for domain ${domain.domain}:`, error)
    }
  }

  return {
    ...enhancedDomain,
    dnsRecords,
    emailAddresses: emailAddressesWithEndpoints
  }
}

/**
 * Update domain settings
 */
export async function updateDomain(
  domainId: string,
  userId: string,
  updates: {
    catchAllEndpointId?: string | null
    domainProvider?: string
    providerConfidence?: 'high' | 'medium' | 'low'
  }
): Promise<EmailDomain | null> {
  // Verify domain belongs to user
  const existingDomain = await db
    .select()
    .from(emailDomains)
    .where(and(
      eq(emailDomains.id, domainId),
      eq(emailDomains.userId, userId)
    ))
    .limit(1)

  if (!existingDomain[0]) {
    return null
  }

  // Prepare update data
  const updateData: any = {
    updatedAt: new Date()
  }

  if (updates.catchAllEndpointId !== undefined) {
    updateData.catchAllEndpointId = updates.catchAllEndpointId
    updateData.isCatchAllEnabled = !!updates.catchAllEndpointId
  }

  if (updates.domainProvider !== undefined) {
    updateData.domainProvider = updates.domainProvider
  }

  if (updates.providerConfidence !== undefined) {
    updateData.providerConfidence = updates.providerConfidence
  }

  // Update domain
  const [updatedDomain] = await db
    .update(emailDomains)
    .set(updateData)
    .where(eq(emailDomains.id, domainId))
    .returning()

  return updatedDomain
}

/**
 * Get provider icon based on provider name
 */
function getProviderIcon(providerName: string): string {
  const iconMap: Record<string, string> = {
    'Cloudflare': 'cloudflare',
    'Namecheap': 'namecheap',
    'GoDaddy': 'godaddy',
    'AWS Route 53': 'aws',
    'Google Domains': 'google',
    'Vercel': 'vercel',
    'DigitalOcean': 'digitalocean',
    'Netlify': 'netlify',
    'DNSimple': 'dnsimple',
    'Hover': 'hover',
    'Porkbun': 'porkbun',
    'Squarespace': 'squarespace'
  }

  return iconMap[providerName] || 'globe'
}

/**
 * Verify domain DNS records
 */
export async function verifyDomainDnsRecords(
  domainId: string,
  userId: string
): Promise<{
  success: boolean
  verifiedRecords: number
  totalRecords: number
  records: Array<{
    id: string
    type: string
    name: string
    value: string
    isVerified: boolean
    error?: string
  }>
}> {
  // Verify domain belongs to user
  const domainResult = await db
    .select()
    .from(emailDomains)
    .where(and(
      eq(emailDomains.id, domainId),
      eq(emailDomains.userId, userId)
    ))
    .limit(1)

  if (!domainResult[0]) {
    throw new Error('Domain not found or access denied')
  }

  // Get DNS records to verify
  const dnsRecords = await db
    .select()
    .from(domainDnsRecords)
    .where(eq(domainDnsRecords.domainId, domainId))

  if (dnsRecords.length === 0) {
    return {
      success: true,
      verifiedRecords: 0,
      totalRecords: 0,
      records: []
    }
  }

  // Verify each DNS record
  const verificationResults = await verifyDnsRecords(
    dnsRecords.map(record => ({
      type: record.recordType,
      name: record.name,
      value: record.value
    }))
  )

  // Update verification status in database
  const updatedRecords = await Promise.all(
    dnsRecords.map(async (record, index) => {
      const verificationResult = verificationResults[index]
      
      await db
        .update(domainDnsRecords)
        .set({
          isVerified: verificationResult.isVerified,
          lastChecked: new Date()
        })
        .where(eq(domainDnsRecords.id, record.id))

      return {
        id: record.id,
        type: record.recordType,
        name: record.name,
        value: record.value,
        isVerified: verificationResult.isVerified,
        error: verificationResult.error
      }
    })
  )

  const verifiedCount = updatedRecords.filter(r => r.isVerified).length

  return {
    success: verifiedCount === updatedRecords.length,
    verifiedRecords: verifiedCount,
    totalRecords: updatedRecords.length,
    records: updatedRecords
  }
} 
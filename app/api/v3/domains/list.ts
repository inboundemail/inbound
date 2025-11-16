import { z } from 'zod'
import { authenticatedProcedure } from '../_lib/procedures'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'

/**
 * Input schema for listing domains
 */
const ListDomainsInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum number of domains to return (1-100)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of domains to skip for pagination'),
  status: z
    .enum(['pending', 'verified', 'failed'])
    .optional()
    .describe('Filter by verification status'),
  canReceive: z
    .boolean()
    .optional()
    .describe('Filter by whether domain can receive emails'),
})

/**
 * Catch-all endpoint schema
 */
const CatchAllEndpointSchema = z.object({
  id: z.string().describe('Endpoint unique identifier'),
  name: z.string().describe('Endpoint name'),
  type: z.string().describe('Endpoint type (webhook, email, etc.)'),
  isActive: z.boolean().describe('Whether endpoint is active'),
})

/**
 * Domain stats schema
 */
const DomainStatsSchema = z.object({
  totalEmailAddresses: z.number().describe('Total number of email addresses'),
  activeEmailAddresses: z.number().describe('Number of active email addresses'),
  hasCatchAll: z.boolean().describe('Whether domain has catch-all configured'),
})

/**
 * Domain schema for list response
 */
const DomainSchema = z.object({
  id: z.string().describe('Unique domain identifier'),
  domain: z.string().describe('The domain name'),
  status: z.enum(['pending', 'verified', 'failed']).describe('Domain verification status'),
  canReceiveEmails: z.boolean().describe('Whether the domain can receive emails'),
  hasMxRecords: z.boolean().describe('Whether the domain has MX records'),
  domainProvider: z.string().nullable().describe('Detected DNS provider'),
  providerConfidence: z.string().nullable().describe('Confidence level of provider detection'),
  lastDnsCheck: z.date().nullable().describe('Last DNS check timestamp'),
  lastSesCheck: z.date().nullable().describe('Last SES verification check timestamp'),
  isCatchAllEnabled: z.boolean().describe('Whether catch-all is enabled'),
  catchAllEndpointId: z.string().nullable().describe('Catch-all endpoint ID if configured'),
  mailFromDomain: z.string().nullable().describe('Custom MAIL FROM domain'),
  mailFromDomainStatus: z.string().nullable().describe('MAIL FROM domain status'),
  mailFromDomainVerifiedAt: z.date().nullable().describe('MAIL FROM domain verification timestamp'),
  receiveDmarcEmails: z.boolean().describe('Whether to receive DMARC emails'),
  createdAt: z.date().describe('Domain creation timestamp'),
  updatedAt: z.date().describe('Domain last update timestamp'),
  stats: DomainStatsSchema.describe('Domain statistics'),
  catchAllEndpoint: CatchAllEndpointSchema.nullable().describe('Catch-all endpoint details'),
})

/**
 * Pagination metadata schema
 */
const PaginationSchema = z.object({
  limit: z.number().describe('Requested limit'),
  offset: z.number().describe('Current offset'),
  total: z.number().describe('Total number of domains'),
  hasMore: z.boolean().describe('Whether there are more domains'),
})

/**
 * Status breakdown schema
 */
const StatusBreakdownSchema = z.object({
  verified: z.number().describe('Number of verified domains'),
  pending: z.number().describe('Number of pending domains'),
  failed: z.number().describe('Number of failed domains'),
})

/**
 * Meta information schema
 */
const MetaSchema = z.object({
  totalCount: z.number().describe('Total number of domains'),
  verifiedCount: z.number().describe('Number of verified domains'),
  withCatchAllCount: z.number().describe('Number of domains with catch-all'),
  statusBreakdown: StatusBreakdownSchema.describe('Breakdown by status'),
})

/**
 * Output schema for listing domains
 */
const ListDomainsOutput = z.object({
  data: z.array(DomainSchema).describe('Array of domains'),
  pagination: PaginationSchema.describe('Pagination information'),
  meta: MetaSchema.describe('Additional metadata'),
})

/**
 * GET /api/v3/domains
 * 
 * Lists all domains for the authenticated user
 * - Supports pagination with limit and offset
 * - Supports filtering by status and canReceive
 * - Includes domain statistics and catch-all endpoint info
 * - Returns metadata about domain counts and status breakdown
 * 
 * @authenticated Required - Session or API key
 * @rateLimit 100 requests per minute (session), 50 per minute (API key)
 */
export const listDomains = authenticatedProcedure
  .route({
    method: 'GET',
    path: '/domains',
    summary: 'List domains',
    description: 'Get a paginated list of domains for the authenticated user with filtering options.',
    tags: ['domains'],
  })
  .input(ListDomainsInput)
  .output(ListDomainsOutput)
  .handler(async ({ input, context }) => {
    const { limit, offset, status, canReceive } = input
    const { userId } = context

    console.log('📋 v3: Listing domains for userId:', userId, { limit, offset, status, canReceive })

    // Build where conditions
    const conditions = [eq(emailDomains.userId, userId)]

    if (status) {
      conditions.push(eq(emailDomains.status, status))
      console.log('🔍 v3: Filtering by status:', status)
    }

    if (canReceive !== undefined) {
      conditions.push(eq(emailDomains.canReceiveEmails, canReceive))
      console.log('🔍 v3: Filtering by canReceive:', canReceive)
    }

    const whereConditions = conditions.length > 1 ? and(...conditions) : conditions[0]

    // Get domains
    console.log('🔍 v3: Querying domains from database')
    const domains = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        status: emailDomains.status,
        canReceiveEmails: emailDomains.canReceiveEmails,
        hasMxRecords: emailDomains.hasMxRecords,
        domainProvider: emailDomains.domainProvider,
        providerConfidence: emailDomains.providerConfidence,
        lastDnsCheck: emailDomains.lastDnsCheck,
        lastSesCheck: emailDomains.lastSesCheck,
        isCatchAllEnabled: emailDomains.isCatchAllEnabled,
        catchAllEndpointId: emailDomains.catchAllEndpointId,
        mailFromDomain: emailDomains.mailFromDomain,
        mailFromDomainStatus: emailDomains.mailFromDomainStatus,
        mailFromDomainVerifiedAt: emailDomains.mailFromDomainVerifiedAt,
        receiveDmarcEmails: emailDomains.receiveDmarcEmails,
        createdAt: emailDomains.createdAt,
        updatedAt: emailDomains.updatedAt,
      })
      .from(emailDomains)
      .where(whereConditions)
      .orderBy(desc(emailDomains.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: count() })
      .from(emailDomains)
      .where(whereConditions)
    
    const totalCount = totalCountResult[0]?.count || 0

    console.log('📊 v3: Found', domains.length, 'domains out of', totalCount, 'total')

    // Enhance domains with additional data
    const enhancedDomains = await Promise.all(
      domains.map(async (domain) => {
        // Get email address count
        const emailCountResult = await db
          .select({ count: count() })
          .from(emailAddresses)
          .where(eq(emailAddresses.domainId, domain.id))
        
        const emailCount = emailCountResult[0]?.count || 0

        // Get active email address count
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
              isActive: endpoints.isActive,
            })
            .from(endpoints)
            .where(eq(endpoints.id, domain.catchAllEndpointId))
            .limit(1)
          
          if (endpointResult[0]) {
            catchAllEndpoint = {
              id: endpointResult[0].id,
              name: endpointResult[0].name,
              type: endpointResult[0].type,
              isActive: endpointResult[0].isActive || false,
            }
          }
        }

        return {
          id: domain.id,
          domain: domain.domain,
          status: domain.status as 'pending' | 'verified' | 'failed',
          canReceiveEmails: domain.canReceiveEmails || false,
          hasMxRecords: domain.hasMxRecords || false,
          domainProvider: domain.domainProvider,
          providerConfidence: domain.providerConfidence,
          lastDnsCheck: domain.lastDnsCheck,
          lastSesCheck: domain.lastSesCheck,
          isCatchAllEnabled: domain.isCatchAllEnabled || false,
          catchAllEndpointId: domain.catchAllEndpointId,
          mailFromDomain: domain.mailFromDomain,
          mailFromDomainStatus: domain.mailFromDomainStatus,
          mailFromDomainVerifiedAt: domain.mailFromDomainVerifiedAt,
          receiveDmarcEmails: domain.receiveDmarcEmails || false,
          createdAt: domain.createdAt || new Date(),
          updatedAt: domain.updatedAt || new Date(),
          stats: {
            totalEmailAddresses: emailCount,
            activeEmailAddresses: activeEmailCount,
            hasCatchAll: !!domain.catchAllEndpointId,
          },
          catchAllEndpoint,
        }
      })
    )

    // Calculate meta statistics
    const verifiedCount = enhancedDomains.filter(d => d.status === 'verified').length
    const withCatchAllCount = enhancedDomains.filter(d => d.stats.hasCatchAll).length
    const statusBreakdown = {
      verified: enhancedDomains.filter(d => d.status === 'verified').length,
      pending: enhancedDomains.filter(d => d.status === 'pending').length,
      failed: enhancedDomains.filter(d => d.status === 'failed').length,
    }

    console.log('✅ v3: Successfully retrieved domains:', {
      retrieved: enhancedDomains.length,
      verified: verifiedCount,
      withCatchAll: withCatchAllCount,
    })

    return {
      data: enhancedDomains,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount,
      },
      meta: {
        totalCount,
        verifiedCount,
        withCatchAllCount,
        statusBreakdown,
      },
    }
  })


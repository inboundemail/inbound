import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validateRequest } from '../lib/helper'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints, domainDnsRecords } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'
import { checkDomainCanReceiveEmails } from '@/lib/domains-and-dns/dns'
import { createDomainVerification } from '@/lib/db/domains'
import { initiateDomainVerification } from '@/lib/domains-and-dns/domain-verification'
import { Autumn as autumn } from 'autumn-js'
import { verifyDnsRecords } from '@/lib/domains-and-dns/dns'
import { SESClient, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses'

// AWS SES Client setup
const awsRegion = process.env.AWS_REGION || 'us-east-2'
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

let sesClient: SESClient | null = null

if (awsAccessKeyId && awsSecretAccessKey) {
  sesClient = new SESClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    }
  })
}

const router = new Hono().basePath('/domains')

/**
 * GET /api/v3/domains
 * Lists all domains for the authenticated user with filtering and pagination
 */
router.get(
  '/',
  describeRoute({
    summary: 'List domains',
    description: 'Returns a paginated list of domains with stats and optional verification checks',
    responses: {
      200: {
        description: 'Successfully retrieved domains',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      domain: { type: 'string' },
                      status: { type: 'string' },
                      canReceiveEmails: { type: 'boolean' },
                      hasMxRecords: { type: 'boolean' },
                      domainProvider: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      providerConfidence: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      lastDnsCheck: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
                      lastSesCheck: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
                      isCatchAllEnabled: { type: 'boolean' },
                      catchAllEndpointId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      mailFromDomain: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      mailFromDomainStatus: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      mailFromDomainVerifiedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
                      receiveDmarcEmails: { type: 'boolean' },
                      createdAt: { type: 'string', format: 'date-time' },
                      updatedAt: { type: 'string', format: 'date-time' },
                      userId: { type: 'string' },
                      stats: {
                        type: 'object',
                        properties: {
                          totalEmailAddresses: { type: 'integer' },
                          activeEmailAddresses: { type: 'integer' },
                          hasCatchAll: { type: 'boolean' }
                        }
                      }
                    }
                  }
                },
                pagination: {
                  type: 'object',
                  properties: {
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    total: { type: 'integer' },
                    hasMore: { type: 'boolean' }
                  }
                },
                meta: {
                  type: 'object',
                  properties: {
                    totalCount: { type: 'integer' },
                    verifiedCount: { type: 'integer' },
                    withCatchAllCount: { type: 'integer' },
                    statusBreakdown: {
                      type: 'object',
                      properties: {
                        verified: { type: 'integer' },
                        pending: { type: 'integer' },
                        failed: { type: 'integer' }
                      }
                    }
                  }
                }
              },
              required: ['data', 'pagination', 'meta']
            }
          }
        }
      },
      400: { description: 'Bad request - invalid parameters' },
      401: { description: 'Unauthorized' },
      429: { description: 'Rate limit exceeded' }
    }
  }),
  async (c) => {
    console.log('🌐 GET /api/v3/domains - Starting request')
    
    try {
      console.log('🔐 Validating request authentication')
      const auth = await validateRequest(c.req.raw)
      
      if (!('userId' in auth)) {
        console.log('❌ Authentication failed:', auth.error)
        return c.json({ error: auth.error || 'Unauthorized' }, 401)
      }

      if (auth.error === 'Rate limit exceeded') {
        console.log('⚠️ Rate limit exceeded for user:', auth.userId)
        c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
        c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
        return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
      }

      if (auth.rateLimit) {
        c.header('X-RateLimit-Limit', String(auth.rateLimit.limit))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit.remaining))
        c.header('X-RateLimit-Reset', auth.rateLimit.reset)
      }

      const userId = auth.userId
      console.log('✅ Authentication successful for userId:', userId)

      // Extract query parameters
      const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
      const offset = parseInt(c.req.query('offset') || '0')
      const status = c.req.query('status') as 'pending' | 'verified' | 'failed' | undefined
      const canReceive = c.req.query('canReceive')
      const check = c.req.query('check') === 'true'

      console.log('📊 Query parameters:', { limit, offset, status, canReceive, check })

      // Validate parameters
      if (limit < 1 || limit > 100) {
        console.log('⚠️ Invalid limit parameter:', limit)
        return c.json({ error: 'Limit must be between 1 and 100' }, 400)
      }

      if (offset < 0) {
        console.log('⚠️ Invalid offset parameter:', offset)
        return c.json({ error: 'Offset must be non-negative' }, 400)
      }

      // Build where conditions
      const conditions = [eq(emailDomains.userId, userId!)]

      if (status && ['pending', 'verified', 'failed'].includes(status)) {
        conditions.push(eq(emailDomains.status, status))
        console.log('🔍 Filtering by status:', status)
      }

      if (canReceive !== undefined && canReceive !== null) {
        const canReceiveEmails = canReceive === 'true'
        conditions.push(eq(emailDomains.canReceiveEmails, canReceiveEmails))
        console.log('🔍 Filtering by canReceive:', canReceiveEmails)
      }

      const whereConditions = conditions.length > 1 ? and(...conditions) : conditions[0]

      // Get domains
      console.log('🔍 Querying domains from database')
      const domainsQuery = db
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

      console.log('📊 Found', domains.length, 'domains out of', totalCount, 'total')

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

          const enhancedDomain: any = {
            ...domain,
            canReceiveEmails: domain.canReceiveEmails || false,
            hasMxRecords: domain.hasMxRecords || false,
            isCatchAllEnabled: domain.isCatchAllEnabled || false,
            receiveDmarcEmails: domain.receiveDmarcEmails || false,
            createdAt: domain.createdAt || new Date(),
            updatedAt: domain.updatedAt || new Date(),
            stats: {
              totalEmailAddresses: emailCount,
              activeEmailAddresses: activeEmailCount,
              hasCatchAll: !!domain.catchAllEndpointId
            },
            catchAllEndpoint
          }

          // If check=true, perform DNS and SES verification checks
          if (check) {
            console.log(`🔍 Performing verification check for domain: ${domain.domain}`)
            
            try {
              // Get DNS records from database
              const dnsRecords = await db
                .select()
                .from(domainDnsRecords)
                .where(eq(domainDnsRecords.domainId, domain.id))

              let verificationResults: Array<{
                type: string
                name: string
                value: string
                isVerified: boolean
                error?: string
              }> = []

              if (dnsRecords.length > 0) {
                // Verify DNS records
                console.log(`🔍 Verifying ${dnsRecords.length} DNS records`)
                const results = await verifyDnsRecords(
                  dnsRecords.map(record => ({
                    type: record.recordType,
                    name: record.name,
                    value: record.value
                  }))
                )

                verificationResults = results.map((result) => ({
                  type: result.type,
                  name: result.name,
                  value: result.expectedValue,
                  isVerified: result.isVerified,
                  error: result.error
                }))

                // Update DNS record verification status in database
                await Promise.all(
                  dnsRecords.map(async (record, index) => {
                    const verificationResult = results[index]
                    await db
                      .update(domainDnsRecords)
                      .set({
                        isVerified: verificationResult.isVerified,
                        lastChecked: new Date()
                      })
                      .where(eq(domainDnsRecords.id, record.id))
                  })
                )
              }

              // Check SES verification status
              let sesStatus = 'Unknown'
              if (sesClient) {
                try {
                  console.log(`🔍 Checking SES verification status`)
                  const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
                    Identities: [domain.domain]
                  })
                  const attributesResponse = await sesClient.send(getAttributesCommand)
                  const attributes = attributesResponse.VerificationAttributes?.[domain.domain]
                  sesStatus = attributes?.VerificationStatus || 'NotFound'
                  
                  // Update domain status based on SES verification
                  if (sesStatus === 'Success' && domain.status !== 'verified') {
                    await db
                      .update(emailDomains)
                      .set({
                        status: 'verified',
                        lastSesCheck: new Date(),
                        updatedAt: new Date()
                      })
                      .where(eq(emailDomains.id, domain.id))
                    enhancedDomain.status = 'verified'
                  } else if (sesStatus === 'Failed' && domain.status !== 'failed') {
                    await db
                      .update(emailDomains)
                      .set({
                        status: 'failed',
                        lastSesCheck: new Date(),
                        updatedAt: new Date()
                      })
                      .where(eq(emailDomains.id, domain.id))
                    enhancedDomain.status = 'failed'
                  } else {
                    // Just update last check time
                    await db
                      .update(emailDomains)
                      .set({
                        lastSesCheck: new Date()
                      })
                      .where(eq(emailDomains.id, domain.id))
                  }
                } catch (sesError) {
                  console.error(`❌ SES verification check failed:`, sesError)
                  sesStatus = 'Error'
                }
              }

              const allDnsVerified = verificationResults.length > 0 && 
                verificationResults.every(r => r.isVerified)
              const isFullyVerified = allDnsVerified && sesStatus === 'Success'

              enhancedDomain.verificationCheck = {
                dnsRecords: verificationResults,
                sesStatus,
                isFullyVerified,
                lastChecked: new Date()
              }

              console.log(`✅ Verification check complete for ${domain.domain}:`, {
                dnsVerified: allDnsVerified,
                sesStatus,
                isFullyVerified
              })

            } catch (checkError) {
              console.error(`❌ Verification check failed for ${domain.domain}:`, checkError)
              enhancedDomain.verificationCheck = {
                dnsRecords: [],
                sesStatus: 'Error',
                isFullyVerified: false,
                lastChecked: new Date()
              }
            }
          }

          return enhancedDomain
        })
      )

      // Calculate meta statistics
      const verifiedCount = enhancedDomains.filter(d => d.status === 'verified').length
      const withCatchAllCount = enhancedDomains.filter(d => d.stats.hasCatchAll).length
      const statusBreakdown = {
        verified: enhancedDomains.filter(d => d.status === 'verified').length,
        pending: enhancedDomains.filter(d => d.status === 'pending').length,
        failed: enhancedDomains.filter(d => d.status === 'failed').length
      }

      console.log('✅ Successfully retrieved domains with stats:', {
        retrieved: enhancedDomains.length,
        verified: verifiedCount,
        withCatchAll: withCatchAllCount
      })

      return c.json({
        data: enhancedDomains,
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
      })

    } catch (error) {
      console.error('❌ GET /api/v3/domains - Error:', error)
      return c.json(
        { 
          error: 'Failed to fetch domains',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      )
    }
  }
)

/**
 * POST /api/v3/domains
 * Creates a new domain for email receiving
 */
router.post(
  '/',
  describeRoute({
    summary: 'Create domain',
    description: 'Creates a new domain for email receiving with DNS verification',
    responses: {
      201: {
        description: 'Successfully created domain',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'verified', 'failed'] },
                canReceiveEmails: { type: 'boolean' },
                hasMxRecords: { type: 'boolean' },
                domainProvider: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                providerConfidence: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                mailFromDomain: { type: 'string' },
                mailFromDomainStatus: { type: 'string' },
                dnsRecords: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      name: { type: 'string' },
                      value: { type: 'string' },
                      description: { type: 'string' },
                      isRequired: { type: 'boolean' }
                    }
                  }
                },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              },
              required: ['id', 'domain', 'status', 'canReceiveEmails', 'hasMxRecords', 'dnsRecords', 'createdAt', 'updatedAt']
            }
          }
        }
      },
      400: { description: 'Bad request - invalid domain or DNS conflicts' },
      401: { description: 'Unauthorized' },
      403: { description: 'Forbidden - domain limit reached' },
      409: { description: 'Conflict - domain already exists' },
      429: { description: 'Rate limit exceeded' }
    }
  }),
  async (c) => {
    console.log('➕ POST /api/v3/domains - Starting domain creation')
    
    try {
      console.log('🔐 Validating request authentication')
      const auth = await validateRequest(c.req.raw)
      
      if (!('userId' in auth)) {
        console.log('❌ Authentication failed:', auth.error)
        return c.json({ error: auth.error || 'Unauthorized' }, 401)
      }

      if (auth.error === 'Rate limit exceeded') {
        console.log('⚠️ Rate limit exceeded for user:', auth.userId)
        c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
        c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
        return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
      }

      if (auth.rateLimit) {
        c.header('X-RateLimit-Limit', String(auth.rateLimit.limit))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit.remaining))
        c.header('X-RateLimit-Reset', auth.rateLimit.reset)
      }

      const userId = auth.userId
      console.log('✅ Authentication successful for userId:', userId)

      // Parse request body
      const data = await c.req.json()
      console.log('📝 Request data:', { domain: data.domain })

      // Validate required fields
      if (!data.domain) {
        console.log('❌ Missing required field: domain')
        return c.json({ error: 'Domain is required' }, 400)
      }

      // Normalize domain (lowercase, trim)
      const domain = data.domain.toLowerCase().trim()

      // Validate domain format
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
      if (!domainRegex.test(domain) || domain.length > 253) {
        console.log('❌ Invalid domain format:', domain)
        return c.json({ error: 'Invalid domain format' }, 400)
      }

      // Check if domain already exists on the platform (for any user)
      console.log('🔍 Checking if domain already exists on platform')
      const existingDomainAnyUser = await db
        .select({
          id: emailDomains.id,
          userId: emailDomains.userId,
          status: emailDomains.status,
          createdAt: emailDomains.createdAt
        })
        .from(emailDomains)
        .where(eq(emailDomains.domain, domain))
        .limit(1)

      if (existingDomainAnyUser[0]) {
        const isOwnDomain = existingDomainAnyUser[0].userId === userId
        
        if (isOwnDomain) {
          console.log('❌ Domain already exists for current user:', domain)
          return c.json(
            { error: 'You have already added this domain to your account' },
            409
          )
        } else {
          console.log('❌ Domain already registered by another user:', domain)
          return c.json(
            { 
              error: 'This domain is already registered on our platform. If you believe this is an error or you need to transfer ownership, please contact our support team.',
              code: 'DOMAIN_ALREADY_REGISTERED'
            },
            409
          )
        }
      }

      // Check Autumn domain limits
      console.log('🔍 Checking domain limits with Autumn')
      const { data: domainCheck, error: domainCheckError } = await autumn.check({
        customer_id: userId!,
        feature_id: "domains",
      })

      if (domainCheckError) {
        console.error('❌ Autumn domain check error:', domainCheckError)
        return c.json({ error: 'Failed to check domain limits' }, 500)
      }

      if (!domainCheck?.allowed) {
        console.log('❌ Domain limit reached for user:', userId)
        return c.json(
          { error: 'Domain limit reached. Please upgrade your plan to add more domains.' },
          403
        )
      }

      console.log('✅ Domain limits check passed:', {
        allowed: domainCheck.allowed,
        balance: domainCheck.balance,
        unlimited: domainCheck.unlimited
      })

      // Check DNS for conflicts (MX/CNAME records)
      console.log('🔍 Checking DNS records for conflicts')
      const dnsResult = await checkDomainCanReceiveEmails(domain)
      
      if (!dnsResult.canReceiveEmails) {
        console.log('❌ Domain cannot receive emails:', dnsResult.error)
        return c.json(
          { 
            error: dnsResult.error || 'Domain has conflicting DNS records (MX or CNAME). Please remove them before adding this domain.' 
          },
          400
        )
      }

      console.log('✅ DNS check passed:', {
        canReceiveEmails: dnsResult.canReceiveEmails,
        hasMxRecords: dnsResult.hasMxRecords,
        provider: dnsResult.provider?.name
      })

      // Create domain record in database
      console.log('💾 Creating domain record in database')
      const domainRecord = await createDomainVerification(
        domain,
        userId!,
        {
          canReceiveEmails: dnsResult.canReceiveEmails,
          hasMxRecords: dnsResult.hasMxRecords,
          provider: dnsResult.provider
        }
      )

      // Initiate SES verification (includes tenant association for new domains)
      console.log('🔐 Initiating SES domain verification with tenant integration')
      const verificationResult = await initiateDomainVerification(domain, userId!)

      // Track domain usage with Autumn (only if not unlimited)
      if (!domainCheck.unlimited) {
        console.log('📊 Tracking domain usage with Autumn')
        const { error: trackError } = await autumn.track({
          customer_id: userId!,
          feature_id: "domains",
          value: 1,
        })

        if (trackError) {
          console.error('⚠️ Failed to track domain usage:', trackError)
          // Don't fail the request, just log the warning
        }
      }

      // Format response
      const response: any = {
        id: domainRecord.id,
        domain: domainRecord.domain,
        status: verificationResult.status,
        canReceiveEmails: domainRecord.canReceiveEmails || false,
        hasMxRecords: domainRecord.hasMxRecords || false,
        domainProvider: domainRecord.domainProvider,
        providerConfidence: domainRecord.providerConfidence,
        dnsRecords: verificationResult.dnsRecords.map(record => ({
          type: record.type,
          name: record.name,
          value: record.value,
          description: record.description,
          isRequired: true
        })),
        createdAt: domainRecord.createdAt || new Date(),
        updatedAt: domainRecord.updatedAt || new Date()
      }

      // Add optional fields if present
      if (verificationResult.mailFromDomain) {
        response.mailFromDomain = verificationResult.mailFromDomain
      }
      if (verificationResult.mailFromDomainStatus) {
        response.mailFromDomainStatus = verificationResult.mailFromDomainStatus
      }

      console.log('✅ Successfully created domain:', domainRecord.id)
      return c.json(response, 201)

    } catch (error) {
      console.error('❌ POST /api/v3/domains - Error:', error)
      return c.json(
        { 
          error: 'Failed to create domain',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      )
    }
  }
)

/**
 * GET /api/v3/domains/:id
 * Gets detailed information about a specific domain
 */
router.get(
  '/:id',
  describeRoute({
    summary: 'Get domain by ID',
    description: 'Returns detailed information about a specific domain with optional verification checks',
    responses: {
      200: {
        description: 'Successfully retrieved domain details',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                status: { type: 'string' },
                canReceiveEmails: { type: 'boolean' },
                hasMxRecords: { type: 'boolean' },
                domainProvider: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                providerConfidence: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                lastDnsCheck: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
                lastSesCheck: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
                isCatchAllEnabled: { type: 'boolean' },
                catchAllEndpointId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                mailFromDomain: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                mailFromDomainStatus: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                mailFromDomainVerifiedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                userId: { type: 'string' },
                stats: {
                  type: 'object',
                  properties: {
                    totalEmailAddresses: { type: 'integer' },
                    activeEmailAddresses: { type: 'integer' },
                    emailsLast24h: { type: 'integer' },
                    emailsLast7d: { type: 'integer' },
                    emailsLast30d: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Domain not found' },
      429: { description: 'Rate limit exceeded' },
      500: { description: 'Internal server error' }
    }
  }),
  async (c) => {
    const id = c.req.param('id')
    console.log('🌐 GET /api/v3/domains/:id - Starting request for domain:', id)
    
    try {
      console.log('🔐 Validating request authentication')
      const auth = await validateRequest(c.req.raw)
      
      if (!('userId' in auth)) {
        console.log('❌ Authentication failed:', auth.error)
        return c.json({ error: auth.error || 'Unauthorized' }, 401)
      }

      if (auth.error === 'Rate limit exceeded') {
        console.log('⚠️ Rate limit exceeded for user:', auth.userId)
        c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
        c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
        return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
      }

      if (auth.rateLimit) {
        c.header('X-RateLimit-Limit', String(auth.rateLimit.limit))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit.remaining))
        c.header('X-RateLimit-Reset', auth.rateLimit.reset)
      }

      const userId = auth.userId!
      console.log('✅ Authentication successful for userId:', userId)

      // Extract query parameters
      const check = c.req.query('check') === 'true'
      
      if (check) {
        console.log('🔍 Check parameter detected - will perform verification check')
      }

      // Get domain with user verification
      console.log('🔍 Querying domain from database')
      const domainResult = await db
        .select()
        .from(emailDomains)
        .where(and(
          eq(emailDomains.id, id),
          eq(emailDomains.userId, userId)
        ))
        .limit(1)

      if (!domainResult[0]) {
        console.log('❌ Domain not found for user:', userId, 'domain:', id)
        return c.json({ error: 'Domain not found' }, 404)
      }

      const domain = domainResult[0]
      console.log('✅ Found domain:', domain.domain, 'status:', domain.status)

      // Get domain statistics
      console.log('📊 Calculating domain statistics')
      const emailCountResult = await db
        .select({ count: count() })
        .from(emailAddresses)
        .where(eq(emailAddresses.domainId, id))
      
      const emailCount = emailCountResult[0]?.count || 0

      const activeEmailCountResult = await db
        .select({ count: count() })
        .from(emailAddresses)
        .where(and(
          eq(emailAddresses.domainId, id),
          eq(emailAddresses.isActive, true)
        ))
      
      const activeEmailCount = activeEmailCountResult[0]?.count || 0

      // Get catch-all endpoint information
      let catchAllEndpoint = null
      if (domain.catchAllEndpointId) {
        console.log('🔍 Getting catch-all endpoint information')
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
        
        catchAllEndpoint = endpointResult[0] || null
      }

      // Calculate time-based email statistics (simplified for now)
      const stats = {
        totalEmailAddresses: emailCount,
        activeEmailAddresses: activeEmailCount,
        emailsLast24h: 0, // TODO: Implement actual email counting
        emailsLast7d: 0,
        emailsLast30d: 0
      }

      console.log('✅ Successfully retrieved domain details')

      // Prepare base response
      let response: any = {
        id: domain.id,
        domain: domain.domain,
        status: domain.status,
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
        createdAt: domain.createdAt || new Date(),
        updatedAt: domain.updatedAt || new Date(),
        userId: domain.userId,
        stats,
        catchAllEndpoint: catchAllEndpoint ? {
          ...catchAllEndpoint,
          isActive: catchAllEndpoint.isActive || false
        } : null
      }

      // If check=true, perform DNS and SES verification checks
      if (check) {
        console.log(`🔍 Performing verification check for domain: ${domain.domain}`)
        
        try {
          // Get DNS records from database
          const dnsRecords = await db
            .select()
            .from(domainDnsRecords)
            .where(eq(domainDnsRecords.domainId, domain.id))

          let verificationResults: Array<{
            type: string
            name: string
            value: string
            isVerified: boolean
            error?: string
          }> = []

          // Build list of records to verify
          const recordsToVerify: Array<{
            type: string
            name: string
            value: string
            dbId: string | null
          }> = dnsRecords.map(record => ({
            type: record.recordType,
            name: record.name,
            value: record.value,
            dbId: record.id
          }))
          
          // Also check for SPF and DMARC even if not in database
          const spfRecord = dnsRecords.find(r => r.recordType === 'TXT' && r.name === domain.domain && (r.value || '').toLowerCase().includes('v=spf1'))
          if (!spfRecord) {
            recordsToVerify.push({
              type: 'TXT',
              name: domain.domain,
              value: 'v=spf1 include:amazonses.com ~all',
              dbId: null
            })
          }
          
          const dmarcRecord = dnsRecords.find(r => r.recordType === 'TXT' && r.name === `_dmarc.${domain.domain}`)
          if (!dmarcRecord) {
            recordsToVerify.push({
              type: 'TXT',
              name: `_dmarc.${domain.domain}`,
              value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
              dbId: null
            })
          }

          if (recordsToVerify.length > 0) {
            console.log(`🔍 Verifying ${recordsToVerify.length} DNS records (including SPF/DMARC checks)`)
            const results = await verifyDnsRecords(
              recordsToVerify.map(record => ({
                type: record.type,
                name: record.name,
                value: record.value
              }))
            )

            verificationResults = results.map((result) => ({
              type: result.type,
              name: result.name,
              value: result.expectedValue,
              isVerified: result.isVerified,
              error: result.error
            }))

            // Update DNS record verification status in database (only for records that exist in DB)
            await Promise.all(
              recordsToVerify.map(async (record, index) => {
                if (record.dbId) {
                  const verificationResult = results[index]
                  await db
                    .update(domainDnsRecords)
                    .set({
                      isVerified: verificationResult.isVerified,
                      lastChecked: new Date()
                    })
                    .where(eq(domainDnsRecords.id, record.dbId))
                }
              })
            )
          }

          // Check SES verification status
          let sesStatus = 'Unknown'
          let dkimStatus: string | undefined
          let dkimVerified = false
          let dkimTokens: string[] | undefined
          let mailFromDomain: string | undefined
          let mailFromStatus: string | undefined
          let mailFromVerified = false
          
          if (sesClient) {
            try {
              console.log(`🔍 Checking SES verification status`)
              const { GetIdentityDkimAttributesCommand, GetIdentityMailFromDomainAttributesCommand, SetIdentityMailFromDomainCommand } = await import('@aws-sdk/client-ses')
              
              const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
                Identities: [domain.domain]
              })
              const attributesResponse = await sesClient.send(getAttributesCommand)
              const attributes = attributesResponse.VerificationAttributes?.[domain.domain]
              sesStatus = attributes?.VerificationStatus || 'NotFound'
              
              // DKIM status
              const dkimCmd = new GetIdentityDkimAttributesCommand({ Identities: [domain.domain] })
              const dkimResp = await sesClient.send(dkimCmd)
              const dkimAttrs = dkimResp.DkimAttributes?.[domain.domain]
              dkimStatus = dkimAttrs?.DkimVerificationStatus || 'Pending'
              dkimVerified = dkimStatus === 'Success'
              dkimTokens = dkimAttrs?.DkimTokens || []
              
              // MAIL FROM status
              const mailFromCmd = new GetIdentityMailFromDomainAttributesCommand({ Identities: [domain.domain] })
              const mailFromResp = await sesClient.send(mailFromCmd)
              const mailFromAttrs = mailFromResp.MailFromDomainAttributes?.[domain.domain]
              mailFromDomain = mailFromAttrs?.MailFromDomain
              mailFromStatus = mailFromAttrs?.MailFromDomainStatus || 'NotSet'
              mailFromVerified = mailFromStatus === 'Success'
              
              // Retry MAIL FROM setup if still pending, failed, or not set
              if (sesStatus === 'Success' && (mailFromStatus === 'Pending' || mailFromStatus === 'Failed' || mailFromStatus === 'NotSet')) {
                try {
                  const expectedMailFromDomain = `mail.${domain.domain}`
                  console.log(`🔄 Retrying MAIL FROM domain setup: ${expectedMailFromDomain} (current status: ${mailFromStatus})`)
                  
                  const retryMailFromCommand = new SetIdentityMailFromDomainCommand({
                    Identity: domain.domain,
                    MailFromDomain: expectedMailFromDomain,
                    BehaviorOnMXFailure: 'UseDefaultValue'
                  })
                  await sesClient.send(retryMailFromCommand)
                  
                  // Wait a moment for AWS to process
                  await new Promise(resolve => setTimeout(resolve, 1000))
                  
                  // Check status again after retry
                  const recheckMailFromCmd = new GetIdentityMailFromDomainAttributesCommand({ 
                    Identities: [domain.domain] 
                  })
                  const recheckMailFromResp = await sesClient.send(recheckMailFromCmd)
                  const recheckMailFromAttrs = recheckMailFromResp.MailFromDomainAttributes?.[domain.domain]
                  
                  // Update with rechecked values
                  if (recheckMailFromAttrs) {
                    mailFromDomain = recheckMailFromAttrs.MailFromDomain
                    mailFromStatus = recheckMailFromAttrs.MailFromDomainStatus || 'Pending'
                    mailFromVerified = mailFromStatus === 'Success'
                    console.log(`✅ MAIL FROM retry completed: ${mailFromDomain} (new status: ${mailFromStatus})`)
                  }
                } catch (retryError) {
                  console.warn(`⚠️ MAIL FROM retry failed for ${domain.domain}:`, retryError)
                }
              }
              
              // Update domain status based on SES verification
              const updateData: any = {
                lastSesCheck: new Date()
              }

              // Update MAIL FROM status if it exists
              if (mailFromDomain && mailFromStatus) {
                updateData.mailFromDomain = mailFromDomain
                updateData.mailFromDomainStatus = mailFromStatus
                if (mailFromStatus === 'Success') {
                  updateData.mailFromDomainVerifiedAt = new Date()
                }
                // Update response with latest MAIL FROM data
                response.mailFromDomain = mailFromDomain
                response.mailFromDomainStatus = mailFromStatus
                response.mailFromDomainVerifiedAt = mailFromStatus === 'Success' ? new Date() : response.mailFromDomainVerifiedAt
              }

              if (sesStatus === 'Success' && domain.status !== 'verified') {
                updateData.status = 'verified'
                updateData.updatedAt = new Date()
                await db
                  .update(emailDomains)
                  .set(updateData)
                  .where(eq(emailDomains.id, domain.id))
                response.status = 'verified'
              } else if (sesStatus === 'Failed' && domain.status !== 'failed') {
                updateData.status = 'failed'
                updateData.updatedAt = new Date()
                await db
                  .update(emailDomains)
                  .set(updateData)
                  .where(eq(emailDomains.id, domain.id))
                response.status = 'failed'
              } else {
                // Just update last check time and MAIL FROM status
                await db
                  .update(emailDomains)
                  .set(updateData)
                  .where(eq(emailDomains.id, domain.id))
              }
            } catch (sesError) {
              console.error(`❌ SES verification check failed:`, sesError)
              sesStatus = 'Error'
            }
          }

          const allDnsVerified = verificationResults.length > 0 && 
            verificationResults.every(r => r.isVerified)
          const isFullyVerified = allDnsVerified && sesStatus === 'Success'

          response.verificationCheck = {
            dnsRecords: verificationResults,
            sesStatus,
            dkimStatus,
            dkimVerified,
            dkimTokens,
            mailFromDomain,
            mailFromStatus,
            mailFromVerified,
            isFullyVerified,
            lastChecked: new Date()
          }

          console.log(`✅ Verification check complete for ${domain.domain}:`, {
            dnsVerified: allDnsVerified,
            sesStatus,
            dkimStatus,
            mailFromStatus,
            isFullyVerified
          })

        } catch (checkError) {
          console.error(`❌ Verification check failed for ${domain.domain}:`, checkError)
          response.verificationCheck = {
            dnsRecords: [],
            sesStatus: 'Error',
            dkimStatus: 'Unknown',
            dkimVerified: false,
            dkimTokens: [],
            mailFromStatus: 'Unknown',
            mailFromVerified: false,
            isFullyVerified: false,
            lastChecked: new Date()
          }
        }
        
        // Build recommendations if SPF/DMARC missing or not verified
        try {
          const verificationCheckResults = response.verificationCheck?.dnsRecords || []
          const spfVerified = verificationCheckResults.some((r: any) => 
            r.type === 'TXT' && 
            r.name === domain.domain && 
            r.isVerified
          )
          const dmarcVerified = verificationCheckResults.some((r: any) => 
            r.type === 'TXT' && 
            r.name === `_dmarc.${domain.domain}` && 
            r.isVerified
          )
          
          const recommendations: any = {}
          
          if (!spfVerified) {
            recommendations.spf = {
              name: domain.domain,
              value: 'v=spf1 include:amazonses.com ~all',
              description: 'SPF record for root domain (recommended)'
            }
          }
          
          if (!dmarcVerified) {
            recommendations.dmarc = {
              name: `_dmarc.${domain.domain}`,
              value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
              description: 'DMARC policy record (starts with p=none for monitoring)'
            }
          }
          
          if (recommendations.spf || recommendations.dmarc) {
            response.authRecommendations = recommendations
          }
        } catch (recError) {
          console.warn('⚠️ Failed to build auth recommendations:', recError)
        }
      }

      return c.json(response)

    } catch (error) {
      console.error('❌ GET /api/v3/domains/:id - Error:', error)
      return c.json(
        { 
          error: 'Failed to fetch domain details',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      )
    }
  }
)

/**
 * PUT /api/v3/domains/:id
 * Updates domain catch-all settings
 */
router.put(
  '/:id',
  describeRoute({
    summary: 'Update domain',
    description: 'Updates domain catch-all settings (enable/disable with endpoint configuration)',
    responses: {
      200: {
        description: 'Successfully updated domain',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                status: { type: 'string' },
                isCatchAllEnabled: { type: 'boolean' },
                catchAllEndpointId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                receiptRuleName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                awsConfigurationWarning: { type: 'string' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      },
      400: { description: 'Bad request - domain not verified or invalid endpoint' },
      401: { description: 'Unauthorized' },
      404: { description: 'Domain not found' },
      429: { description: 'Rate limit exceeded' },
      500: { description: 'Internal server error' }
    }
  }),
  async (c) => {
    const id = c.req.param('id')
    console.log('✏️ PUT /api/v3/domains/:id - Starting update for domain:', id)
    
    try {
      console.log('🔐 Validating request authentication')
      const auth = await validateRequest(c.req.raw)
      
      if (!('userId' in auth)) {
        console.log('❌ Authentication failed:', auth.error)
        return c.json({ error: auth.error || 'Unauthorized' }, 401)
      }

      if (auth.error === 'Rate limit exceeded') {
        console.log('⚠️ Rate limit exceeded for user:', auth.userId)
        c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
        c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
        return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
      }

      if (auth.rateLimit) {
        c.header('X-RateLimit-Limit', String(auth.rateLimit.limit))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit.remaining))
        c.header('X-RateLimit-Reset', auth.rateLimit.reset)
      }

      const userId = auth.userId!
      console.log('✅ Authentication successful for userId:', userId)

      const data = await c.req.json()
      console.log('📝 Update data received:', {
        isCatchAllEnabled: data.isCatchAllEnabled,
        catchAllEndpointId: data.catchAllEndpointId
      })

      // Check if domain exists and belongs to user
      console.log('🔍 Checking if domain exists and belongs to user')
      const existingDomain = await db
        .select()
        .from(emailDomains)
        .where(and(
          eq(emailDomains.id, id),
          eq(emailDomains.userId, userId)
        ))
        .limit(1)

      if (!existingDomain[0]) {
        console.log('❌ Domain not found for user:', userId, 'domain:', id)
        return c.json({ error: 'Domain not found' }, 404)
      }

      console.log('✅ Found existing domain:', existingDomain[0].domain)

      // Check if domain is verified
      if (existingDomain[0].status !== 'verified') {
        console.log('❌ Domain not verified:', existingDomain[0].status)
        return c.json({ error: 'Domain must be verified before configuring catch-all' }, 400)
      }

      // Validate endpoint if enabling catch-all
      if (data.isCatchAllEnabled && data.catchAllEndpointId) {
        console.log('🔍 Validating endpoint')
        const endpointResult = await db
          .select()
          .from(endpoints)
          .where(and(
            eq(endpoints.id, data.catchAllEndpointId),
            eq(endpoints.userId, userId)
          ))
          .limit(1)

        if (!endpointResult[0]) {
          console.log('❌ Endpoint not found:', data.catchAllEndpointId)
          return c.json({ error: 'Endpoint not found or does not belong to user' }, 400)
        }

        if (!endpointResult[0].isActive) {
          console.log('❌ Endpoint is inactive:', data.catchAllEndpointId)
          return c.json({ error: 'Selected endpoint is not active' }, 400)
        }
      }

      let receiptRuleName = null
      let awsConfigurationWarning = null

      if (data.isCatchAllEnabled && data.catchAllEndpointId) {
        // ENABLE catch-all: Configure AWS SES catch-all receipt rule
        try {
          console.log('🔧 Configuring AWS SES catch-all for domain:', existingDomain[0].domain)
          const sesManager = new AWSSESReceiptRuleManager()
          
          // Get AWS configuration
          const awsRegion = process.env.AWS_REGION || 'us-east-2'
          const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
          const s3BucketName = process.env.S3_BUCKET_NAME
          const awsAccountId = process.env.AWS_ACCOUNT_ID

          if (!s3BucketName || !awsAccountId) {
            awsConfigurationWarning = 'AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID'
            console.warn('⚠️ AWS configuration incomplete')
          } else {
            const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
              lambdaFunctionName,
              awsAccountId,
              awsRegion
            )

            const receiptResult = await sesManager.configureCatchAllDomain({
              domain: existingDomain[0].domain,
              webhookId: data.catchAllEndpointId,
              lambdaFunctionArn: lambdaArn,
              s3BucketName
            })
            
            if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
              receiptRuleName = receiptResult.ruleName
              console.log('✅ AWS SES catch-all configured successfully')
            } else {
              awsConfigurationWarning = `SES catch-all configuration failed: ${receiptResult.error}`
              console.warn('⚠️ SES catch-all configuration failed')
            }
          }
        } catch (error) {
          console.error('❌ AWS SES configuration error:', error)
          awsConfigurationWarning = `AWS SES configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      } else {
        // DISABLE catch-all: Remove AWS SES catch-all receipt rule
        try {
          console.log('🔧 Removing AWS SES catch-all for domain:', existingDomain[0].domain)
          const sesManager = new AWSSESReceiptRuleManager()
          
          const ruleRemoved = await sesManager.removeCatchAllDomain(existingDomain[0].domain)
          
          if (ruleRemoved) {
            console.log('✅ AWS SES catch-all removed successfully')
          } else {
            console.warn('⚠️ Failed to remove AWS SES catch-all rule')
          }
        } catch (error) {
          console.error('❌ AWS SES removal error:', error)
        }
      }

      // Update domain in database
      console.log('💾 Updating domain in database')
      const [updatedDomain] = await db
        .update(emailDomains)
        .set({
          isCatchAllEnabled: data.isCatchAllEnabled,
          catchAllEndpointId: data.isCatchAllEnabled ? data.catchAllEndpointId : null,
          catchAllReceiptRuleName: receiptRuleName,
          updatedAt: new Date()
        })
        .where(eq(emailDomains.id, id))
        .returning()

      // Get updated endpoint information
      let catchAllEndpoint = null
      if (updatedDomain.catchAllEndpointId) {
        const endpointResult = await db
          .select({
            id: endpoints.id,
            name: endpoints.name,
            type: endpoints.type,
            isActive: endpoints.isActive
          })
          .from(endpoints)
          .where(eq(endpoints.id, updatedDomain.catchAllEndpointId))
          .limit(1)
        
        const endpoint = endpointResult[0]
        if (endpoint) {
          catchAllEndpoint = {
            id: endpoint.id,
            name: endpoint.name,
            type: endpoint.type,
            isActive: endpoint.isActive || false
          }
        }
      }

      console.log('✅ Successfully updated domain catch-all settings')

      const response: any = {
        id: updatedDomain.id,
        domain: updatedDomain.domain,
        status: updatedDomain.status,
        isCatchAllEnabled: updatedDomain.isCatchAllEnabled || false,
        catchAllEndpointId: updatedDomain.catchAllEndpointId,
        catchAllEndpoint,
        receiptRuleName,
        updatedAt: updatedDomain.updatedAt || new Date()
      }

      if (awsConfigurationWarning) {
        response.awsConfigurationWarning = awsConfigurationWarning
      }

      return c.json(response)

    } catch (error) {
      console.error('❌ PUT /api/v3/domains/:id - Error:', error)
      return c.json(
        { 
          error: 'Failed to update domain',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      )
    }
  }
)

/**
 * DELETE /api/v3/domains/:id
 * Deletes a domain and all associated resources
 */
router.delete(
  '/:id',
  describeRoute({
    summary: 'Delete domain',
    description: 'Deletes a domain and all associated resources (email addresses, DNS records, SES configuration)',
    responses: {
      200: {
        description: 'Successfully deleted domain',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                deletedResources: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string' },
                    emailAddresses: { type: 'integer' },
                    dnsRecords: { type: 'integer' },
                    blockedEmails: { type: 'integer' },
                    sesIdentity: { type: 'boolean' },
                    sesReceiptRules: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Domain not found' },
      429: { description: 'Rate limit exceeded' },
      500: { description: 'Internal server error' }
    }
  }),
  async (c) => {
    const id = c.req.param('id')
    console.log('🗑️ DELETE /api/v3/domains/:id - Starting deletion for domain:', id)
    
    try {
      console.log('🔐 Validating request authentication')
      const auth = await validateRequest(c.req.raw)
      
      if (!('userId' in auth)) {
        console.log('❌ Authentication failed:', auth.error)
        return c.json({ error: auth.error || 'Unauthorized' }, 401)
      }

      if (auth.error === 'Rate limit exceeded') {
        console.log('⚠️ Rate limit exceeded for user:', auth.userId)
        c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
        c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
        return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
      }

      if (auth.rateLimit) {
        c.header('X-RateLimit-Limit', String(auth.rateLimit.limit))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit.remaining))
        c.header('X-RateLimit-Reset', auth.rateLimit.reset)
      }

      const userId = auth.userId!
      console.log('✅ Authentication successful for userId:', userId)

      // Get domain with user verification
      console.log('🔍 Fetching domain details')
      const domainResult = await db
        .select()
        .from(emailDomains)
        .where(and(
          eq(emailDomains.id, id),
          eq(emailDomains.userId, userId)
        ))
        .limit(1)

      if (!domainResult[0]) {
        console.log('❌ Domain not found for user:', userId, 'domain:', id)
        return c.json({ error: 'Domain not found' }, 404)
      }

      const domain = domainResult[0]
      console.log('✅ Found domain:', domain.domain, 'status:', domain.status)

      // Track deletion stats
      const deletionStats = {
        domain: domain.domain,
        emailAddresses: 0,
        dnsRecords: 0,
        blockedEmails: 0,
        sesIdentity: false,
        sesReceiptRules: false
      }

      // 1. Delete AWS SES receipt rules (both catch-all and individual)
      if (domain.domain) {
        try {
          console.log('🔧 Removing AWS SES receipt rules')
          const sesManager = new AWSSESReceiptRuleManager()
          
          // Remove catch-all rule if exists
          if (domain.isCatchAllEnabled || domain.catchAllReceiptRuleName) {
            console.log('🔧 Removing catch-all receipt rule')
            const catchAllRemoved = await sesManager.removeCatchAllDomain(domain.domain)
            if (catchAllRemoved) {
              deletionStats.sesReceiptRules = true
              console.log('✅ Catch-all receipt rule removed')
            }
          }

          // Remove individual email receipt rule
          console.log('🔧 Removing individual email receipt rule')
          const individualRemoved = await sesManager.removeEmailReceiving(domain.domain)
          if (individualRemoved) {
            deletionStats.sesReceiptRules = true
            console.log('✅ Individual email receipt rule removed')
          }
        } catch (sesRuleError) {
          console.error('⚠️ Failed to remove SES receipt rules:', sesRuleError)
          // Continue with deletion even if SES rule removal fails
        }
      }

      // 2. Delete AWS SES identity
      if (domain.domain) {
        try {
          console.log('🔧 Deleting AWS SES identity')
          const { deleteDomainFromSES } = await import('@/lib/domains-and-dns/domain-verification')
          const sesResult = await deleteDomainFromSES(domain.domain)
          deletionStats.sesIdentity = sesResult.success
          if (sesResult.success) {
            console.log('✅ SES identity deleted')
          } else {
            console.warn('⚠️ Failed to delete SES identity:', sesResult.error)
          }
        } catch (sesError) {
          console.error('⚠️ Failed to delete SES identity:', sesError)
          // Continue with deletion even if SES identity deletion fails
        }
      }

      // 3. Delete blocked emails for this domain
      try {
        console.log('🔧 Deleting blocked emails')
        const { blockedEmails } = await import('@/lib/db/schema')
        const blockedResult = await db
          .delete(blockedEmails)
          .where(eq(blockedEmails.domainId, id))
          .returning({ id: blockedEmails.id })
        
        deletionStats.blockedEmails = blockedResult.length
        console.log(`✅ Deleted ${blockedResult.length} blocked emails`)
      } catch (blockedError) {
        console.error('⚠️ Failed to delete blocked emails:', blockedError)
        // Continue with deletion
      }

      // 4. Delete email addresses
      try {
        console.log('🔧 Deleting email addresses')
        const emailResult = await db
          .delete(emailAddresses)
          .where(eq(emailAddresses.domainId, id))
          .returning({ id: emailAddresses.id })
        
        deletionStats.emailAddresses = emailResult.length
        console.log(`✅ Deleted ${emailResult.length} email addresses`)
      } catch (emailError) {
        console.error('❌ Failed to delete email addresses:', emailError)
        return c.json(
          { 
            error: 'Failed to delete email addresses',
            details: emailError instanceof Error ? emailError.message : 'Unknown error'
          },
          500
        )
      }

      // 5. Delete DNS records
      try {
        console.log('🔧 Deleting DNS records')
        const dnsResult = await db
          .delete(domainDnsRecords)
          .where(eq(domainDnsRecords.domainId, id))
          .returning({ id: domainDnsRecords.id })
        
        deletionStats.dnsRecords = dnsResult.length
        console.log(`✅ Deleted ${dnsResult.length} DNS records`)
      } catch (dnsError) {
        console.error('❌ Failed to delete DNS records:', dnsError)
        return c.json(
          { 
            error: 'Failed to delete DNS records',
            details: dnsError instanceof Error ? dnsError.message : 'Unknown error'
          },
          500
        )
      }

      // 6. Delete the domain itself
      try {
        console.log('🔧 Deleting domain record')
        await db
          .delete(emailDomains)
          .where(eq(emailDomains.id, id))
        
        console.log('✅ Domain record deleted')
      } catch (domainError) {
        console.error('❌ Failed to delete domain:', domainError)
        return c.json(
          { 
            error: 'Failed to delete domain',
            details: domainError instanceof Error ? domainError.message : 'Unknown error'
          },
          500
        )
      }

      // 7. Track domain deletion with Autumn to free up domain spot
      try {
        console.log('📊 Tracking domain deletion with Autumn for user:', userId)
        const { error: trackError } = await autumn.track({
          customer_id: userId,
          feature_id: "domains",
          value: -1,
        })

        if (trackError) {
          console.error('⚠️ Failed to track domain deletion:', trackError)
          console.warn(`⚠️ Domain deleted but usage tracking failed for user: ${userId}`)
        } else {
          console.log(`✅ Successfully tracked domain deletion for user: ${userId}`)
        }
      } catch (trackingError) {
        console.error('⚠️ Failed to import or use Autumn tracking:', trackingError)
      }

      console.log('✅ Successfully deleted domain and all associated resources')

      return c.json({
        success: true,
        message: `Successfully deleted domain ${domain.domain} and all associated resources`,
        deletedResources: deletionStats
      })

    } catch (error) {
      console.error('❌ DELETE /api/v3/domains/:id - Error:', error)
      return c.json(
        { 
          error: 'Failed to delete domain',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      )
    }
  }
)

/**
 * PATCH /api/v3/domains/:id
 * Upgrade existing domain with MAIL FROM domain configuration
 */
router.patch(
  '/:id',
  describeRoute({
    summary: 'Upgrade domain with MAIL FROM',
    description: 'Upgrades domain with MAIL FROM configuration to eliminate "via amazonses.com" attribution',
    responses: {
      200: {
        description: 'Successfully upgraded domain',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                mailFromDomain: { type: 'string' },
                mailFromDomainStatus: { type: 'string' },
                additionalDnsRecords: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      name: { type: 'string' },
                      value: { type: 'string' },
                      description: { type: 'string' },
                      isRequired: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Domain not found' },
      429: { description: 'Rate limit exceeded' },
      500: { description: 'Internal server error - AWS SES not configured' }
    }
  }),
  async (c) => {
    const id = c.req.param('id')
    console.log('🔧 PATCH /api/v3/domains/:id - Upgrading domain with MAIL FROM configuration:', id)
    
    try {
      console.log('🔐 Validating request authentication')
      const auth = await validateRequest(c.req.raw)
      
      if (!('userId' in auth)) {
        console.log('❌ Authentication failed:', auth.error)
        return c.json({ error: auth.error || 'Unauthorized' }, 401)
      }

      if (auth.error === 'Rate limit exceeded') {
        console.log('⚠️ Rate limit exceeded for user:', auth.userId)
        c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
        c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
        return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
      }

      if (auth.rateLimit) {
        c.header('X-RateLimit-Limit', String(auth.rateLimit.limit))
        c.header('X-RateLimit-Remaining', String(auth.rateLimit.remaining))
        c.header('X-RateLimit-Reset', auth.rateLimit.reset)
      }

      const userId = auth.userId!
      console.log('✅ Authentication successful for userId:', userId)

      // Get domain record
      const domainResult = await db
        .select()
        .from(emailDomains)
        .where(and(eq(emailDomains.id, id), eq(emailDomains.userId, userId)))
        .limit(1)

      if (!domainResult[0]) {
        console.log('❌ Domain not found:', id)
        return c.json({ error: 'Domain not found' }, 404)
      }

      const domain = domainResult[0]
      console.log('📋 Found domain:', domain.domain)

      // Check if AWS SES is configured
      if (!sesClient) {
        console.log('❌ AWS SES not configured')
        return c.json(
          { error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.' },
          500
        )
      }

      // Check if domain already has MAIL FROM domain configured
      if (domain.mailFromDomain && domain.mailFromDomainStatus === 'Success') {
        console.log('ℹ️ Domain already has MAIL FROM domain configured:', domain.mailFromDomain)
        return c.json({
          success: true,
          message: 'Domain already has MAIL FROM domain configured',
          mailFromDomain: domain.mailFromDomain,
          mailFromDomainStatus: domain.mailFromDomainStatus
        })
      }

      // Set up MAIL FROM domain
      const mailFromDomain = `mail.${domain.domain}`
      let mailFromDomainStatus = 'pending'
      
      try {
        console.log(`🔧 Setting up MAIL FROM domain: ${mailFromDomain}`)
        const { SetIdentityMailFromDomainCommand, GetIdentityMailFromDomainAttributesCommand } = await import('@aws-sdk/client-ses')
        
        const mailFromCommand = new SetIdentityMailFromDomainCommand({
          Identity: domain.domain,
          MailFromDomain: mailFromDomain,
          BehaviorOnMXFailure: 'UseDefaultValue'
        })
        await sesClient.send(mailFromCommand)
        
        // Check MAIL FROM domain status
        const mailFromStatusCommand = new GetIdentityMailFromDomainAttributesCommand({
          Identities: [domain.domain]
        })
        const mailFromStatusResponse = await sesClient.send(mailFromStatusCommand)
        const mailFromAttributes = mailFromStatusResponse.MailFromDomainAttributes?.[domain.domain]
        mailFromDomainStatus = mailFromAttributes?.MailFromDomainStatus || 'pending'
        
        console.log(`✅ MAIL FROM domain configured: ${mailFromDomain} (status: ${mailFromDomainStatus})`)
      } catch (mailFromError) {
        console.error('❌ Failed to set up MAIL FROM domain:', mailFromError)
        return c.json(
          { 
            error: 'Failed to configure MAIL FROM domain',
            details: mailFromError instanceof Error ? mailFromError.message : 'Unknown error'
          },
          500
        )
      }

      // Update domain record with MAIL FROM domain information
      const updateData: any = {
        mailFromDomain,
        mailFromDomainStatus,
        updatedAt: new Date()
      }

      if (mailFromDomainStatus === 'Success') {
        updateData.mailFromDomainVerifiedAt = new Date()
      }

      const [updatedDomain] = await db
        .update(emailDomains)
        .set(updateData)
        .where(eq(emailDomains.id, id))
        .returning()

      // Generate additional DNS records needed for MAIL FROM domain
      const awsRegion = process.env.AWS_REGION || 'us-east-2'
      const additionalDnsRecords = [
        {
          type: 'MX',
          name: mailFromDomain,
          value: `10 feedback-smtp.${awsRegion}.amazonses.com`,
          description: 'MAIL FROM domain MX record (eliminates "via amazonses.com")',
          isRequired: true,
          isVerified: false
        },
        {
          type: 'TXT',
          name: mailFromDomain,
          value: 'v=spf1 include:amazonses.com ~all',
          description: 'SPF record for MAIL FROM domain',
          isRequired: false,
          isVerified: false
        }
      ]

      // Add the new DNS records to the database
      for (const record of additionalDnsRecords) {
        const dnsRecord = {
          id: `dns_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          domainId: id,
          recordType: record.type,
          name: record.name,
          value: record.value,
          isRequired: record.isRequired,
          isVerified: record.isVerified,
          createdAt: new Date(),
        }
        
        try {
          await db.insert(domainDnsRecords).values(dnsRecord)
          console.log(`✅ Added DNS record: ${record.type} ${record.name}`)
        } catch (dnsError) {
          console.error('⚠️ Failed to add DNS record (may already exist):', dnsError)
          // Continue even if DNS record insertion fails (might already exist)
        }
      }

      console.log('✅ Successfully upgraded domain with MAIL FROM configuration')

      return c.json({
        success: true,
        message: 'Domain successfully upgraded with MAIL FROM domain configuration',
        mailFromDomain,
        mailFromDomainStatus,
        additionalDnsRecords: additionalDnsRecords.map(record => ({
          type: record.type,
          name: record.name,
          value: record.value,
          description: record.description,
          isRequired: record.isRequired
        }))
      })

    } catch (error) {
      console.error('❌ PATCH /api/v3/domains/:id - Error:', error)
      return c.json(
        { 
          error: 'Failed to upgrade domain',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        500
      )
    }
  }
)

export default router

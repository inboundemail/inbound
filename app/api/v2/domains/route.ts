import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
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

/**
 * GET /api/v2/domains
 * Gets all domains for the user with filtering and pagination
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/domains types
export interface GetDomainsRequest {
    limit?: number
    offset?: number
    status?: 'pending' | 'verified' | 'failed'
    canReceive?: 'true' | 'false'
    check?: 'true' | 'false'
}

export interface DomainWithStats {
    id: string
    domain: string
    status: string
    canReceiveEmails: boolean
    hasMxRecords: boolean
    domainProvider: string | null
    providerConfidence: string | null
    lastDnsCheck: Date | null
    lastSesCheck: Date | null
    isCatchAllEnabled: boolean
    catchAllEndpointId: string | null
    createdAt: Date
    updatedAt: Date
    userId: string
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
    // Additional fields when check=true
    verificationCheck?: {
        dnsRecords?: Array<{
            type: string
            name: string
            value: string
            isVerified: boolean
            error?: string
        }>
        sesStatus?: string
        isFullyVerified?: boolean
        lastChecked?: Date
    }
}

export interface GetDomainsResponse {
    data: DomainWithStats[]
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
}

export async function GET(request: NextRequest) {
    console.log('🌐 GET /api/v2/domains - Starting request')
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        console.log('✅ Authentication successful for userId:', userId)

        const { searchParams } = new URL(request.url)

        // Extract query parameters
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
        const offset = parseInt(searchParams.get('offset') || '0')
        const status = searchParams.get('status') as 'pending' | 'verified' | 'failed'
        const canReceive = searchParams.get('canReceive')
        const check = searchParams.get('check') === 'true'

        console.log('📊 Query parameters:', {
            limit,
            offset,
            status,
            canReceive,
            check
        })

        // Validate parameters
        if (limit < 1 || limit > 100) {
            console.log('⚠️ Invalid limit parameter:', limit)
            return NextResponse.json(
                { error: 'Limit must be between 1 and 100' },
                { status: 400 }
            )
        }

        if (offset < 0) {
            console.log('⚠️ Invalid offset parameter:', offset)
            return NextResponse.json(
                { error: 'Offset must be non-negative' },
                { status: 400 }
            )
        }

        // Build where conditions
        const conditions = [eq(emailDomains.userId, userId)]

        if (status && ['pending', 'verified', 'failed'].includes(status)) {
            conditions.push(eq(emailDomains.status, status))
            console.log('🔍 Filtering by status:', status)
        }

        if (canReceive !== null) {
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

                const enhancedDomain: DomainWithStats = {
                    ...domain,
                    canReceiveEmails: domain.canReceiveEmails || false,
                    hasMxRecords: domain.hasMxRecords || false,
                    isCatchAllEnabled: domain.isCatchAllEnabled || false,
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

                            verificationResults = results.map((result, index) => ({
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

        return NextResponse.json({
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
        console.error('❌ GET /api/v2/domains - Error:', error)
        return NextResponse.json(
            { 
                error: 'Failed to fetch domains',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}

/**
 * POST /api/v2/domains
 * Creates a new domain for email receiving
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/domains types
export interface PostDomainsRequest {
    domain: string
}

export interface PostDomainsResponse {
    id: string
    domain: string
    status: 'pending' | 'verified' | 'failed'
    canReceiveEmails: boolean
    hasMxRecords: boolean
    domainProvider: string | null
    providerConfidence: string | null
    dnsRecords: Array<{
        type: string
        name: string
        value: string
        isRequired: boolean
    }>
    createdAt: Date
    updatedAt: Date
}

export async function POST(request: NextRequest) {
    console.log('➕ POST /api/v2/domains - Starting domain creation')
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        console.log('✅ Authentication successful for userId:', userId)

        // Parse request body
        const data: PostDomainsRequest = await request.json()
        console.log('📝 Request data:', { domain: data.domain })

        // Validate required fields
        if (!data.domain) {
            console.log('❌ Missing required field: domain')
            return NextResponse.json(
                { error: 'Domain is required' },
                { status: 400 }
            )
        }

        // Normalize domain (lowercase, trim)
        const domain = data.domain.toLowerCase().trim()

        // Validate domain format
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
        if (!domainRegex.test(domain) || domain.length > 253) {
            console.log('❌ Invalid domain format:', domain)
            return NextResponse.json(
                { error: 'Invalid domain format' },
                { status: 400 }
            )
        }

        // Check if domain already exists for this user
        console.log('🔍 Checking if domain already exists')
        const existingDomain = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.domain, domain),
                eq(emailDomains.userId, userId)
            ))
            .limit(1)

        if (existingDomain[0]) {
            console.log('❌ Domain already exists:', domain)
            return NextResponse.json(
                { error: 'Domain already exists' },
                { status: 409 }
            )
        }

        // Check Autumn domain limits
        console.log('🔍 Checking domain limits with Autumn')
        const { data: domainCheck, error: domainCheckError } = await autumn.check({
            customer_id: userId,
            feature_id: "domains",
        })

        if (domainCheckError) {
            console.error('❌ Autumn domain check error:', domainCheckError)
            return NextResponse.json(
                { error: 'Failed to check domain limits' },
                { status: 500 }
            )
        }

        if (!domainCheck?.allowed) {
            console.log('❌ Domain limit reached for user:', userId)
            return NextResponse.json(
                { error: 'Domain limit reached. Please upgrade your plan to add more domains.' },
                { status: 403 }
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
            return NextResponse.json(
                { 
                    error: dnsResult.error || 'Domain has conflicting DNS records (MX or CNAME). Please remove them before adding this domain.' 
                },
                { status: 400 }
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
            userId,
            {
                canReceiveEmails: dnsResult.canReceiveEmails,
                hasMxRecords: dnsResult.hasMxRecords,
                provider: dnsResult.provider
            }
        )

        // Initiate SES verification
        console.log('🔐 Initiating SES domain verification')
        const verificationResult = await initiateDomainVerification(domain, userId)

        // Track domain usage with Autumn (only if not unlimited)
        if (!domainCheck.unlimited) {
            console.log('📊 Tracking domain usage with Autumn')
            const { error: trackError } = await autumn.track({
                customer_id: userId,
                feature_id: "domains",
                value: 1,
            })

            if (trackError) {
                console.error('⚠️ Failed to track domain usage:', trackError)
                // Don't fail the request, just log the warning
            }
        }

        // Format response
        const response: PostDomainsResponse = {
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
                isRequired: true
            })),
            createdAt: domainRecord.createdAt || new Date(),
            updatedAt: domainRecord.updatedAt || new Date()
        }

        console.log('✅ Successfully created domain:', domainRecord.id)
        return NextResponse.json(response, { status: 201 })

    } catch (error) {
        console.error('❌ POST /api/v2/domains - Error:', error)
        return NextResponse.json(
            { 
                error: 'Failed to create domain',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}
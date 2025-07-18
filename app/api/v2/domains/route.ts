import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'

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

        console.log('📊 Query parameters:', {
            limit,
            offset,
            status,
            canReceive
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
                    
                    catchAllEndpoint = endpointResult[0] || null
                }

                return {
                    ...domain,
                    stats: {
                        totalEmailAddresses: emailCount,
                        activeEmailAddresses: activeEmailCount,
                        hasCatchAll: !!domain.catchAllEndpointId
                    },
                    catchAllEndpoint
                }
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
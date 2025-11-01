import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../helper/main'
import { db } from '@/lib/db'
import { emailDomains, domainDnsRecords } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /api/v2/domains/{id}/dns-records
 * Gets DNS records for a specific domain
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/domains/{id}/dns-records types
export interface DnsRecord {
    id: string
    domainId: string
    recordType: string
    name: string
    value: string
    priority?: number | null
    isRequired: boolean
    isVerified: boolean
    lastChecked: Date | null
    createdAt: Date
    updatedAt: Date
}

export interface GetDomainDnsRecordsResponse {
    domainId: string
    domain: string
    records: DnsRecord[]
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    console.log('🔍 GET /api/v2/domains/{id}/dns-records - Starting request for domain:', id)
    
    try {
        console.log('🔐 Validating request authentication')
        const result = await validateRequest(request)
        if ('error' in result) {
            console.log('❌ Authentication/Rate limit failed:', result.error)
            const status = result.status || 401
            const headers: Record<string, string> = {}

            if (status === 429 && result.retryAfter) {
                headers['Retry-After'] = result.retryAfter.toString()
                headers['X-RateLimit-Limit'] = (result.limit || 0).toString()
                headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()
            }

            return NextResponse.json(
                { error: result.error },
                { status, headers }
            )
        }
        const { userId } = result
        console.log('✅ Authentication successful for userId:', userId)

        // Get domain with user verification
        console.log('🔍 Verifying domain ownership')
        const domainResult = await db
            .select({
                id: emailDomains.id,
                domain: emailDomains.domain,
                userId: emailDomains.userId
            })
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, id),
                eq(emailDomains.userId, userId)
            ))
            .limit(1)

        if (!domainResult[0]) {
            console.log('❌ Domain not found for user:', userId, 'domain:', id)
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            )
        }

        const domain = domainResult[0]
        console.log('✅ Found domain:', domain.domain)

        // Get DNS records
        console.log('🔍 Fetching DNS records')
        const dnsRecordsResult = await db
            .select()
            .from(domainDnsRecords)
            .where(eq(domainDnsRecords.domainId, id))
            .orderBy(domainDnsRecords.recordType)

        console.log('📊 Found', dnsRecordsResult.length, 'DNS records')

        const response: GetDomainDnsRecordsResponse = {
            domainId: domain.id,
            domain: domain.domain,
            records: dnsRecordsResult.map(record => ({
                id: record.id,
                domainId: record.domainId,
                recordType: record.recordType,
                name: record.name,
                value: record.value,
                priority: null, // Not in schema
                isRequired: record.isRequired || false,
                isVerified: record.isVerified || false,
                lastChecked: record.lastChecked,
                createdAt: record.createdAt || new Date(),
                updatedAt: record.createdAt || new Date() // Use createdAt as updatedAt since it's not in schema
            }))
        }

        console.log('✅ Successfully retrieved DNS records')
        return NextResponse.json(response)

    } catch (error) {
        console.error('❌ GET /api/v2/domains/{id}/dns-records - Error:', error)
        return NextResponse.json(
            { 
                error: 'Failed to fetch DNS records',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
} 
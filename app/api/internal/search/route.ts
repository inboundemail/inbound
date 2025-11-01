import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../v2/helper/main'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints, structuredEmails } from '@/lib/db/schema'
import { and, eq, ilike, or, sql, desc } from 'drizzle-orm'

/**
 * GET /api/internal/search
 * Internal search API for command bar - returns minimal searchable data
 * Supports session-based auth and API key auth (internal use only)
 */

// Search types
export interface SearchResult {
  domains: DomainResult[]
  addresses: AddressResult[]
  endpoints: EndpointResult[]
  emails?: EmailResult[] // Only populated on fallback search
}

export interface DomainResult {
  id: string
  domain: string
  status: string
  canReceiveEmails: boolean
}

export interface AddressResult {
  id: string
  address: string
  domainId: string
  domain: string
  isActive: boolean
  endpointName?: string
}

export interface EndpointResult {
  id: string
  name: string
  type: string
  description?: string
  isActive: boolean
  config: string // JSON string
}

export interface EmailResult {
  id: string
  from: string
  to: string
  subject: string
  receivedAt: string
  messageId: string
}

export interface SearchResponse {
  success: boolean
  data?: SearchResult
  error?: string
  fallbackUsed?: boolean
  query: string
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    console.log('🔍 Internal Search API - Starting search request')

    // Validate authentication
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

    // Get search query
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()
    
    if (!query) {
      return NextResponse.json({
        success: false,
        error: 'Query parameter "q" is required'
      }, { status: 400 })
    }

    console.log(`🔍 Internal Search API - Searching for: "${query}" by user: ${userId}`)

    // Primary search: domains, addresses, endpoints
    const primaryResults = await performPrimarySearch(userId, query)
    
    // Check if we found anything in primary search
    const hasResults = primaryResults.domains.length > 0 || 
                      primaryResults.addresses.length > 0 || 
                      primaryResults.endpoints.length > 0

    let fallbackUsed = false
    let emailResults: EmailResult[] = []

    // If no primary results, search in email logs
    if (!hasResults) {
      console.log('🔍 Internal Search API - No primary results, searching email logs')
      emailResults = await performEmailLogSearch(userId, query)
      fallbackUsed = true
    }

    const searchResult: SearchResult = {
      ...primaryResults,
      ...(fallbackUsed && { emails: emailResults })
    }

    const duration = Date.now() - startTime
    console.log(`✅ Internal Search API - Search completed in ${duration}ms, results: ${JSON.stringify({
      domains: searchResult.domains.length,
      addresses: searchResult.addresses.length,
      endpoints: searchResult.endpoints.length,
      emails: searchResult.emails?.length || 0,
      fallbackUsed
    })}`)

    return NextResponse.json({
      success: true,
      data: searchResult,
      fallbackUsed,
      query
    } as SearchResponse)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`❌ Internal Search API - Error after ${duration}ms:`, error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error during search',
      query: request.url.split('q=')[1]?.split('&')[0] || ''
    } as SearchResponse, { status: 500 })
  }
}

/**
 * Primary search across domains, addresses, and endpoints
 */
async function performPrimarySearch(userId: string, query: string): Promise<Omit<SearchResult, 'emails'>> {
  // Create search pattern for ILIKE
  const searchPattern = `%${query.toLowerCase()}%`

  try {
    // Single optimized query with JOINs to get all data
    const results = await db
      .select({
        // Domain fields
        domainId: emailDomains.id,
        domain: emailDomains.domain,
        domainStatus: emailDomains.status,
        canReceiveEmails: emailDomains.canReceiveEmails,
        
        // Address fields  
        addressId: emailAddresses.id,
        address: emailAddresses.address,
        addressIsActive: emailAddresses.isActive,
        
        // Endpoint fields
        endpointId: endpoints.id,
        endpointName: endpoints.name,
        endpointType: endpoints.type,
        endpointDescription: endpoints.description,
        endpointIsActive: endpoints.isActive,
        endpointConfig: endpoints.config,
        
        // Relationship fields
        addressDomainId: emailAddresses.domainId,
        addressEndpointId: emailAddresses.endpointId
      })
      .from(emailDomains)
      .leftJoin(emailAddresses, eq(emailAddresses.domainId, emailDomains.id))
      .leftJoin(endpoints, eq(endpoints.id, emailAddresses.endpointId))
      .where(and(
        eq(emailDomains.userId, userId),
        or(
          // Search domains
          ilike(emailDomains.domain, searchPattern),
          // Search email addresses
          ilike(emailAddresses.address, searchPattern),
          // Search endpoint names
          ilike(endpoints.name, searchPattern),
          // Search endpoint descriptions
          ilike(endpoints.description, searchPattern)
        )
      ))
      .limit(50) // Reasonable limit for command bar results

    // Separate and deduplicate results
    const domainMap = new Map<string, DomainResult>()
    const addressMap = new Map<string, AddressResult>()  
    const endpointMap = new Map<string, EndpointResult>()

    for (const row of results) {
      // Add domain if it matches search and hasn't been added
      if (row.domainId && 
          row.domain?.toLowerCase().includes(query.toLowerCase()) && 
          !domainMap.has(row.domainId)) {
        domainMap.set(row.domainId, {
          id: row.domainId,
          domain: row.domain || '',
          status: row.domainStatus || '',
          canReceiveEmails: row.canReceiveEmails || false
        })
      }

      // Add address if it matches search and hasn't been added
      if (row.addressId && 
          row.address?.toLowerCase().includes(query.toLowerCase()) && 
          !addressMap.has(row.addressId)) {
        addressMap.set(row.addressId, {
          id: row.addressId,
          address: row.address || '',
          domainId: row.addressDomainId || '',
          domain: row.domain || '',
          isActive: row.addressIsActive || false,
          endpointName: row.endpointName || undefined
        })
      }

      // Add endpoint if it matches search and hasn't been added
      if (row.endpointId && 
          (row.endpointName?.toLowerCase().includes(query.toLowerCase()) || 
           row.endpointDescription?.toLowerCase().includes(query.toLowerCase())) && 
          !endpointMap.has(row.endpointId)) {
        endpointMap.set(row.endpointId, {
          id: row.endpointId,
          name: row.endpointName || '',
          type: row.endpointType || '',
          description: row.endpointDescription || undefined,
          isActive: row.endpointIsActive || false,
          config: row.endpointConfig || ''
        })
      }
    }

    // Also search endpoints directly (in case they're not connected to email addresses)
    const directEndpoints = await db
      .select({
        id: endpoints.id,
        name: endpoints.name,
        type: endpoints.type,
        description: endpoints.description,
        isActive: endpoints.isActive,
        config: endpoints.config
      })
      .from(endpoints)
      .where(and(
        eq(endpoints.userId, userId),
        or(
          ilike(endpoints.name, searchPattern),
          ilike(endpoints.description, searchPattern)
        )
      ))
      .limit(20)

    // Add direct endpoint results
    for (const endpoint of directEndpoints) {
      if (!endpointMap.has(endpoint.id)) {
        endpointMap.set(endpoint.id, {
          id: endpoint.id,
          name: endpoint.name || '',
          type: endpoint.type || '',
          description: endpoint.description || undefined,
          isActive: endpoint.isActive || false,
          config: endpoint.config || ''
        })
      }
    }

    return {
      domains: Array.from(domainMap.values()),
      addresses: Array.from(addressMap.values()),
      endpoints: Array.from(endpointMap.values())
    }

  } catch (error) {
    console.error('❌ Primary search error:', error)
    throw error
  }
}

/**
 * Fallback search in email logs when primary search returns no results
 */
async function performEmailLogSearch(userId: string, query: string): Promise<EmailResult[]> {
  const searchPattern = `%${query.toLowerCase()}%`

  try {
    const emailResults = await db
      .select({
        id: structuredEmails.id,
        fromData: structuredEmails.fromData,
        toData: structuredEmails.toData,
        subject: structuredEmails.subject,
        createdAt: structuredEmails.createdAt,
        messageId: structuredEmails.messageId
      })
      .from(structuredEmails)
      .where(and(
        eq(structuredEmails.userId, userId),
        or(
          ilike(structuredEmails.fromData, searchPattern),
          ilike(structuredEmails.toData, searchPattern),
          ilike(structuredEmails.subject, searchPattern)
        )
      ))
      .orderBy(desc(structuredEmails.createdAt))
      .limit(10)

    return emailResults.map(email => {
      // Parse JSON data safely
      let fromText = ''
      let toText = ''
      
      try {
        if (email.fromData) {
          const fromData = JSON.parse(email.fromData)
          fromText = fromData.text || ''
        }
      } catch {}
      
      try {
        if (email.toData) {
          const toData = JSON.parse(email.toData)
          toText = toData.text || ''
        }
      } catch {}
      
      return {
        id: email.id,
        from: fromText,
        to: toText,
        subject: email.subject || '',
        receivedAt: email.createdAt?.toISOString() || '',
        messageId: email.messageId || ''
      }
    })

  } catch (error) {
    console.error('❌ Email log search error:', error)
    // Don't throw here - just return empty array so primary search can still succeed
    return []
  }
}

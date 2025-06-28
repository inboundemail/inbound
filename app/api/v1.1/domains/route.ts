import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/app/api/v1/lib/auth'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints } from '@/lib/db/schema'
import { eq, and, count, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/v1.1/domains - Fetching user domains')
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const canReceive = searchParams.get('canReceive')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where conditions
    const conditions = [eq(emailDomains.userId, userId)]

    if (status && ['verified', 'pending', 'failed'].includes(status)) {
      conditions.push(eq(emailDomains.status, status))
    }

    if (canReceive !== null) {
      const canReceiveEmails = canReceive === 'true'
      conditions.push(eq(emailDomains.canReceiveEmails, canReceiveEmails))
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
        verificationToken: emailDomains.verificationToken,
        domainProvider: emailDomains.domainProvider,
        createdAt: emailDomains.createdAt,
        updatedAt: emailDomains.updatedAt
      })
      .from(emailDomains)
      .where(whereConditions)

    const domains = await domainsQuery
      .orderBy(desc(emailDomains.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination (using same filters as main query)
    const totalCountResult = await db
      .select({ count: count() })
      .from(emailDomains)
      .where(whereConditions)
    
    const totalCount = totalCountResult[0]?.count || 0

    // Enhance domains with additional data
    const enhancedDomains = await Promise.all(
      domains.map(async (domain: any) => {
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
          catchAllEndpoint,
          isVerified: domain.status === 'verified'
        }
      })
    )

    console.log(`✅ GET /api/v1.1/domains - Retrieved ${domains.length} domains for user ${userId}`)

    return NextResponse.json({
      success: true,
      data: enhancedDomains,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount
      },
      meta: {
        totalCount,
        verifiedCount: enhancedDomains.filter((d: any) => d.isVerified).length,
        withCatchAllCount: enhancedDomains.filter((d: any) => d.stats.hasCatchAll).length,
        statusBreakdown: {
          verified: enhancedDomains.filter((d: any) => d.status === 'verified').length,
          pending: enhancedDomains.filter((d: any) => d.status === 'pending').length,
          failed: enhancedDomains.filter((d: any) => d.status === 'failed').length
        }
      }
    })

  } catch (error) {
    console.error('❌ GET /api/v1.1/domains - Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch domains',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 
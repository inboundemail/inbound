/**
 * /api/v2/domains - Comprehensive domain management endpoint
 * 
 * Handles domain registration, verification, DNS configuration, and catch-all settings.
 * Supports filtering by verification status and email receiving capabilities.
 * Provides enhanced metadata including statistics and provider information.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateV2Request, getAuthErrorResponse } from '@/lib/auth/v2-auth'
import { listDomains, updateDomain, type DomainListFilters, type DomainListPagination } from '@/lib/domains-and-dns/domain-management'

/**
 * GET /api/v2/domains
 * List all domains with filtering, pagination, and enhanced metadata
 */
export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/v2/domains - Listing domains with enhanced metadata')
    
    // Authenticate request (session or API key)
    const authResult = await authenticateV2Request(request)
    if (!authResult.success) {
      console.warn('❌ GET /api/v2/domains - Authentication failed:', authResult.error)
      const errorResponse = getAuthErrorResponse(authResult)
      return NextResponse.json(
        { success: false, error: errorResponse.error, details: errorResponse.details },
        { status: errorResponse.status }
      )
    }

    const userId = authResult.user!.id
    const { searchParams } = new URL(request.url)

    // Parse filters
    const filters: DomainListFilters = {}
    
    if (searchParams.get('status')) {
      const status = searchParams.get('status')
      if (['verified', 'pending', 'failed'].includes(status!)) {
        filters.status = status as 'verified' | 'pending' | 'failed'
      }
    }

    if (searchParams.get('canReceive') !== null) {
      filters.canReceive = searchParams.get('canReceive') === 'true'
    }

    if (searchParams.get('search')) {
      filters.search = searchParams.get('search')!
    }

    if (searchParams.get('hasCatchAll') !== null) {
      filters.hasCatchAll = searchParams.get('hasCatchAll') === 'true'
    }

    if (searchParams.get('provider')) {
      filters.provider = searchParams.get('provider')!
    }

    // Parse pagination
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    
    const pagination: DomainListPagination = {
      limit,
      offset
    }

    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid limit parameter. Must be between 1 and 100.',
          details: 'Use ?limit=50 for example'
        },
        { status: 400 }
      )
    }

    if (offset < 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid offset parameter. Must be 0 or greater.',
          details: 'Use ?offset=0 for example'
        },
        { status: 400 }
      )
    }

    // Get domains using the library function
    const result = await listDomains(userId, filters, pagination)

    console.log(`✅ GET /api/v2/domains - Retrieved ${result.domains.length} domains for user ${userId} (${authResult.authType} auth)`)

    return NextResponse.json({
      success: true,
      data: result.domains,
      pagination: result.pagination,
      meta: result.meta,
      filters: filters,
      authType: authResult.authType
    })

  } catch (error) {
    console.error('❌ GET /api/v2/domains - Error:', error)
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

/**
 * PUT /api/v2/domains
 * Update domain settings (catch-all, provider info, verification retry)
 */
export async function PUT(request: NextRequest) {
  try {
    console.log('📝 PUT /api/v2/domains - Updating domain settings')
    
    // Authenticate request (session or API key)
    const authResult = await authenticateV2Request(request)
    if (!authResult.success) {
      console.warn('❌ PUT /api/v2/domains - Authentication failed:', authResult.error)
      const errorResponse = getAuthErrorResponse(authResult)
      return NextResponse.json(
        { success: false, error: errorResponse.error, details: errorResponse.details },
        { status: errorResponse.status }
      )
    }

    const userId = authResult.user!.id

    // Parse request body
    let requestData
    try {
      requestData = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid JSON in request body',
          details: 'Please provide valid JSON data'
        },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!requestData.domainId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required field: domainId',
          details: 'Please provide the domain ID to update'
        },
        { status: 400 }
      )
    }

    // Validate domain ID format
    if (typeof requestData.domainId !== 'string' || !requestData.domainId.startsWith('indm_')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid domain ID format',
          details: 'Domain ID must be a string starting with "indm_"'
        },
        { status: 400 }
      )
    }

    // Prepare update data
    const updates: {
      catchAllEndpointId?: string | null
      domainProvider?: string
      providerConfidence?: 'high' | 'medium' | 'low'
    } = {}

    if (requestData.catchAllEndpointId !== undefined) {
      // Validate endpoint ID format if provided
      if (requestData.catchAllEndpointId !== null && 
          (typeof requestData.catchAllEndpointId !== 'string' || requestData.catchAllEndpointId.length === 0)) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid catchAllEndpointId format',
            details: 'Endpoint ID must be a non-empty string or null'
          },
          { status: 400 }
        )
      }
      updates.catchAllEndpointId = requestData.catchAllEndpointId
    }

    if (requestData.domainProvider !== undefined) {
      if (typeof requestData.domainProvider !== 'string') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid domainProvider format',
            details: 'Domain provider must be a string'
          },
          { status: 400 }
        )
      }
      updates.domainProvider = requestData.domainProvider
    }

    if (requestData.providerConfidence !== undefined) {
      if (!['high', 'medium', 'low'].includes(requestData.providerConfidence)) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid providerConfidence value',
            details: 'Provider confidence must be "high", "medium", or "low"'
          },
          { status: 400 }
        )
      }
      updates.providerConfidence = requestData.providerConfidence
    }

    // Check if there are any updates to apply
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No valid update fields provided',
          details: 'Please provide at least one field to update: catchAllEndpointId, domainProvider, or providerConfidence'
        },
        { status: 400 }
      )
    }

    console.log(`📝 PUT /api/v2/domains - Updating domain ${requestData.domainId} with:`, updates)

    // Update domain using the library function
    const updatedDomain = await updateDomain(requestData.domainId, userId, updates)

    if (!updatedDomain) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Domain not found or access denied',
          details: 'The specified domain does not exist or you do not have permission to update it'
        },
        { status: 404 }
      )
    }

    console.log(`✅ PUT /api/v2/domains - Successfully updated domain ${requestData.domainId} for user ${userId} (${authResult.authType} auth)`)

    return NextResponse.json({
      success: true,
      data: updatedDomain,
      authType: authResult.authType
    })

  } catch (error) {
    console.error('❌ PUT /api/v2/domains - Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update domain',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 
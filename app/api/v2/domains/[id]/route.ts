/**
 * /api/v2/domains/[id] - Individual domain management endpoint
 * 
 * Provides comprehensive domain status, DNS records, email addresses, and catch-all configuration.
 * Includes domain verification and provider detection with optional provider refresh functionality.
 * Returns detailed domain information with routing configurations and statistics.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateV2Request, getAuthErrorResponse } from '@/lib/auth/v2-auth'
import { getDomainDetails, verifyDomainDnsRecords } from '@/lib/domains-and-dns/domain-management'

/**
 * GET /api/v2/domains/[id]
 * Fetch detailed domain information with DNS records and email addresses
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log(`📋 GET /api/v2/domains/${id} - Fetching detailed domain information`)
    
    // Authenticate request (session or API key)
    const authResult = await authenticateV2Request(request)
    if (!authResult.success) {
      console.warn(`❌ GET /api/v2/domains/${id} - Authentication failed:`, authResult.error)
      const errorResponse = getAuthErrorResponse(authResult)
      return NextResponse.json(
        { success: false, error: errorResponse.error, details: errorResponse.details },
        { status: errorResponse.status }
      )
    }

    const userId = authResult.user!.id
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const refreshProvider = searchParams.get('refreshProvider') === 'true'
    const verifyDns = searchParams.get('verifyDns') === 'true'

    // Validate domain ID format
    if (!id || typeof id !== 'string' || !id.startsWith('indm_')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid domain ID format',
          details: 'Domain ID must be a string starting with "indm_"'
        },
        { status: 400 }
      )
    }

    console.log(`📋 GET /api/v2/domains/${id} - Options: refreshProvider=${refreshProvider}, verifyDns=${verifyDns}`)

    // Get domain details using the library function
    const domainDetails = await getDomainDetails(id, userId, refreshProvider)

    if (!domainDetails) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Domain not found or access denied',
          details: 'The specified domain does not exist or you do not have permission to access it'
        },
        { status: 404 }
      )
    }

    // Optionally verify DNS records if requested
    let dnsVerification = null
    if (verifyDns) {
      try {
        console.log(`🔍 GET /api/v2/domains/${id} - Verifying DNS records`)
        dnsVerification = await verifyDomainDnsRecords(id, userId)
      } catch (dnsError) {
        console.warn(`⚠️ GET /api/v2/domains/${id} - DNS verification failed:`, dnsError)
        // DNS verification failure is not critical, continue without it
        dnsVerification = {
          success: false,
          error: dnsError instanceof Error ? dnsError.message : 'DNS verification failed'
        }
      }
    }

    // Prepare response data
    const responseData = {
      ...domainDetails,
      dnsVerification: dnsVerification || undefined
    }

    console.log(`✅ GET /api/v2/domains/${id} - Retrieved domain details for user ${userId} (${authResult.authType} auth)`)
    console.log(`📊 GET /api/v2/domains/${id} - Domain stats: ${domainDetails.stats.totalEmailAddresses} emails, ${domainDetails.dnsRecords.length} DNS records`)

    return NextResponse.json({
      success: true,
      data: responseData,
      authType: authResult.authType,
      meta: {
        refreshedProvider: refreshProvider,
        verifiedDns: verifyDns,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error(`❌ GET /api/v2/domains/${(await params).id} - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch domain details',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 
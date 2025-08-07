import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../../helper/main'
import { getImprovedEmailThread } from '@/lib/email-management/improved-threading'

/**
 * GET /api/v2/mail/[id]/thread/optimized
 * Optimized email threading endpoint with improved algorithm and performance
 * 
 * Features:
 * - Improved RFC 2822 compliant threading algorithm
 * - Reduced database queries through batching
 * - Better confidence scoring
 * - Enhanced error handling
 * - Performance metrics
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = performance.now()
  console.log('🚀 GET /api/v2/mail/[id]/thread/optimized - Starting optimized request')
  
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
    
    const { id } = await params
    console.log('📨 Requested optimized thread for email ID:', id)

    // Validate email ID
    if (!id || typeof id !== 'string') {
      console.log('⚠️ Invalid email ID provided:', id)
      return NextResponse.json(
        { error: 'Valid email ID is required' },
        { status: 400 }
      )
    }

    // Use the improved threading algorithm
    const threadResult = await getImprovedEmailThread(userId, id)
    
    const processingTime = performance.now() - startTime
    
    console.log(`✅ Optimized threading completed in ${processingTime.toFixed(2)}ms`)
    console.log(`📊 Thread stats: ${threadResult.messages.length} messages, ${threadResult.confidence} confidence via ${threadResult.threadingMethod}`)
    
    // Add performance metadata
    const responseWithMetrics = {
      ...threadResult,
      performance: {
        ...threadResult.performance,
        totalProcessingTime: processingTime,
        apiVersion: 'v2-optimized',
        timestamp: new Date().toISOString()
      }
    }

    return NextResponse.json(responseWithMetrics)

  } catch (error) {
    const processingTime = performance.now() - startTime
    console.error('💥 Unexpected error in optimized threading:', error)
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        performance: {
          totalProcessingTime: processingTime,
          failed: true
        }
      },
      { status: 500 }
    )
  }
}

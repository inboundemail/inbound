import { NextRequest, NextResponse } from 'next/server'

/**
 * DEPRECATED VIP WEBHOOK ROUTE
 * 
 * This route is no longer used as VIP functionality has been integrated
 * directly into the main email routing system in lib/email-management/email-router.ts
 * 
 * VIP processing now happens automatically as part of the normal email flow:
 * 1. Email arrives → Main webhook processes → routeEmail() called
 * 2. routeEmail() checks VIP status before routing to endpoints
 * 3. If VIP payment required → Payment request sent, email held
 * 4. If VIP payment completed → Email delivered via normal routing
 * 
 * This endpoint returns a deprecation notice to avoid breaking existing integrations.
 */

export async function POST(request: NextRequest) {
  console.warn('⚠️ DEPRECATED: VIP webhook route called - VIP is now integrated into main email routing')
  
  return NextResponse.json({
    success: true,
    deprecated: true,
    message: 'VIP functionality has been integrated into the main email routing system. This endpoint is no longer needed.',
    migration_info: {
      old_flow: 'Email → Separate VIP webhook → Payment handling',
      new_flow: 'Email → Main webhook → routeEmail() with VIP middleware → Normal endpoint delivery',
      benefits: [
        'VIP works with all endpoint types (webhooks, email forwarding, email groups)',
        'Guaranteed delivery after payment through normal routing system',
        'Better error handling and retry logic',
        'Unified email processing pipeline'
      ]
    }
  })
}
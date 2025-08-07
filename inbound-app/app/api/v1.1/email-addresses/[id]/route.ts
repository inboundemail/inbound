import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/app/api/v1/lib/auth'
import { db } from '@/lib/db'
import { emailAddresses, emailDomains, endpoints, webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`📋 GET /api/v1.1/email-addresses/${params.id} - Fetching email address details`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Get email address with domain and routing information
    const emailResult = await db
      .select({
        // Email address fields
        id: emailAddresses.id,
        address: emailAddresses.address,
        domainId: emailAddresses.domainId,
        webhookId: emailAddresses.webhookId,
        endpointId: emailAddresses.endpointId,
        isActive: emailAddresses.isActive,
        isReceiptRuleConfigured: emailAddresses.isReceiptRuleConfigured,
        receiptRuleName: emailAddresses.receiptRuleName,
        createdAt: emailAddresses.createdAt,
        updatedAt: emailAddresses.updatedAt,
        
        // Domain information
        domainName: emailDomains.domain,
        domainStatus: emailDomains.status,
        
        // Endpoint information (if exists)
        endpointName: endpoints.name,
        endpointType: endpoints.type,
        endpointIsActive: endpoints.isActive,
        
        // Webhook information (legacy, if exists)
        webhookName: webhooks.name,
        webhookUrl: webhooks.url,
        webhookIsActive: webhooks.isActive
      })
      .from(emailAddresses)
      .leftJoin(emailDomains, eq(emailAddresses.domainId, emailDomains.id))
      .leftJoin(endpoints, eq(emailAddresses.endpointId, endpoints.id))
      .leftJoin(webhooks, eq(emailAddresses.webhookId, webhooks.id))
      .where(and(
        eq(emailAddresses.id, params.id),
        eq(emailAddresses.userId, userId)
      ))
      .limit(1)

    if (!emailResult[0]) {
      return NextResponse.json({
        success: false,
        error: 'Email address not found'
      }, { status: 404 })
    }

    const result = emailResult[0]

    // Transform result to enhanced format
    const enhancedEmailAddress = {
      id: result.id,
      address: result.address,
      isActive: result.isActive,
      isReceiptRuleConfigured: result.isReceiptRuleConfigured,
      receiptRuleName: result.receiptRuleName,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      
      domain: {
        id: result.domainId,
        name: result.domainName,
        status: result.domainStatus
      },
      
      routing: result.endpointId ? {
        type: 'endpoint',
        id: result.endpointId,
        name: result.endpointName,
        endpointType: result.endpointType,
        isActive: result.endpointIsActive
      } : result.webhookId ? {
        type: 'webhook',
        id: result.webhookId,
        name: result.webhookName,
        url: result.webhookUrl,
        isActive: result.webhookIsActive
      } : {
        type: 'none',
        id: null,
        name: null,
        isActive: false
      }
    }

    console.log(`✅ GET /api/v1.1/email-addresses/${params.id} - Retrieved email address details`)

    return NextResponse.json({
      success: true,
      data: enhancedEmailAddress
    })

  } catch (error) {
    console.error(`❌ GET /api/v1.1/email-addresses/${params.id} - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch email address details',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`📝 PUT /api/v1.1/email-addresses/${params.id} - Updating email address`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const data = await request.json()

    // Check if email address exists and belongs to user
    const existingEmail = await db
      .select()
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.id, params.id),
        eq(emailAddresses.userId, userId)
      ))
      .limit(1)

    if (!existingEmail[0]) {
      return NextResponse.json({
        success: false,
        error: 'Email address not found'
      }, { status: 404 })
    }

    // Validate endpoint/webhook if provided
    if (data.endpointId) {
      const endpointResult = await db
        .select()
        .from(endpoints)
        .where(and(
          eq(endpoints.id, data.endpointId),
          eq(endpoints.userId, userId)
        ))
        .limit(1)

      if (!endpointResult[0]) {
        return NextResponse.json({
          success: false,
          error: 'Endpoint not found or access denied'
        }, { status: 404 })
      }
    }

    if (data.webhookId) {
      const webhookResult = await db
        .select()
        .from(webhooks)
        .where(and(
          eq(webhooks.id, data.webhookId),
          eq(webhooks.userId, userId)
        ))
        .limit(1)

      if (!webhookResult[0]) {
        return NextResponse.json({
          success: false,
          error: 'Webhook not found or access denied'
        }, { status: 404 })
      }
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date()
    }

    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.endpointId !== undefined) {
      updateData.endpointId = data.endpointId
      updateData.webhookId = null // Clear webhook when setting endpoint
    }
    if (data.webhookId !== undefined) {
      updateData.webhookId = data.webhookId
      updateData.endpointId = null // Clear endpoint when setting webhook
    }

    // Update the email address
    const [updatedEmailAddress] = await db
      .update(emailAddresses)
      .set(updateData)
      .where(eq(emailAddresses.id, params.id))
      .returning()

    console.log(`✅ PUT /api/v1.1/email-addresses/${params.id} - Successfully updated email address`)

    return NextResponse.json({
      success: true,
      data: updatedEmailAddress,
      message: 'Email address updated successfully'
    })

  } catch (error) {
    console.error(`❌ PUT /api/v1.1/email-addresses/${params.id} - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update email address',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`🗑️ DELETE /api/v1.1/email-addresses/${params.id} - Deleting email address`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Check if email address exists and belongs to user
    const existingEmail = await db
      .select()
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.id, params.id),
        eq(emailAddresses.userId, userId)
      ))
      .limit(1)

    if (!existingEmail[0]) {
      return NextResponse.json({
        success: false,
        error: 'Email address not found'
      }, { status: 404 })
    }

    // Delete the email address
    await db.delete(emailAddresses).where(eq(emailAddresses.id, params.id))

    console.log(`✅ DELETE /api/v1.1/email-addresses/${params.id} - Successfully deleted email address`)

    return NextResponse.json({
      success: true,
      message: 'Email address deleted successfully'
    })

  } catch (error) {
    console.error(`❌ DELETE /api/v1.1/email-addresses/${params.id} - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to delete email address',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 
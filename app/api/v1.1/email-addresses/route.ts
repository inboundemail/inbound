import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/app/api/v1/lib/auth'
import { db } from '@/lib/db'
import { emailAddresses, emailDomains, endpoints, webhooks } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/v1.1/email-addresses - Fetching user email addresses')
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const domainId = searchParams.get('domainId')
    const active = searchParams.get('active')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where conditions
    const conditions = [eq(emailAddresses.userId, userId)]

    if (domainId) {
      conditions.push(eq(emailAddresses.domainId, domainId))
    }

    if (active !== null) {
      const isActive = active === 'true'
      conditions.push(eq(emailAddresses.isActive, isActive))
    }

    const whereConditions = conditions.length > 1 ? and(...conditions) : conditions[0]

    // Build query with joins to get domain and endpoint information
    const query = db
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
      .where(whereConditions)

    const results = await query
      .orderBy(desc(emailAddresses.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(eq(emailAddresses.userId, userId))
    
    const totalCount = totalCountResult[0]?.count || 0

    // Transform results to enhanced format
    const enhancedEmailAddresses = results.map((result: any) => ({
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
    }))

    console.log(`✅ GET /api/v1.1/email-addresses - Retrieved ${results.length} email addresses for user ${userId}`)

    return NextResponse.json({
      success: true,
      data: enhancedEmailAddresses,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount
      },
      meta: {
        totalCount,
        activeCount: enhancedEmailAddresses.filter((e: any) => e.isActive).length,
        routingBreakdown: {
          endpoint: enhancedEmailAddresses.filter((e: any) => e.routing.type === 'endpoint').length,
          webhook: enhancedEmailAddresses.filter((e: any) => e.routing.type === 'webhook').length,
          none: enhancedEmailAddresses.filter((e: any) => e.routing.type === 'none').length
        }
      }
    })

  } catch (error) {
    console.error('❌ GET /api/v1.1/email-addresses - Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch email addresses',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📝 POST /api/v1.1/email-addresses - Creating new email address')
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const data = await request.json()
    
    // Validate required fields
    if (!data.address || !data.domainId) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required fields',
          required: ['address', 'domainId']
        },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.address)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid email address format'
        },
        { status: 400 }
      )
    }

    // Check if domain exists and belongs to user
    const domainResult = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, data.domainId),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!domainResult[0]) {
      return NextResponse.json({
        success: false,
        error: 'Domain not found or access denied'
      }, { status: 404 })
    }

    // Check if email already exists
    const existingEmail = await db
      .select()
      .from(emailAddresses)
      .where(eq(emailAddresses.address, data.address))
      .limit(1)

    if (existingEmail[0]) {
      return NextResponse.json({
        success: false,
        error: 'Email address already exists'
      }, { status: 409 })
    }

    // Validate endpoint/webhook if provided
    let endpointId = null
    let webhookId = null
    
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
      endpointId = data.endpointId
    } else if (data.webhookId) {
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
      webhookId = data.webhookId
    }

    // Create the email address
    const newEmailAddress = {
      id: nanoid(),
      address: data.address,
      domainId: data.domainId,
      endpointId,
      webhookId,
      isActive: data.isActive !== undefined ? data.isActive : true,
      isReceiptRuleConfigured: false,
      receiptRuleName: null,
      userId,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const [createdEmailAddress] = await db.insert(emailAddresses).values(newEmailAddress).returning()

    // Get enhanced response with domain and routing information
    const enhancedResponse = {
      ...createdEmailAddress,
      domain: {
        id: domainResult[0].id,
        name: domainResult[0].domain,
        status: domainResult[0].status
      },
      routing: endpointId ? {
        type: 'endpoint',
        id: endpointId,
        name: null, // Would need another query to get name
        endpointType: null,
        isActive: true
      } : webhookId ? {
        type: 'webhook',
        id: webhookId,
        name: null, // Would need another query to get name
        url: null,
        isActive: true
      } : {
        type: 'none',
        id: null,
        name: null,
        isActive: false
      }
    }

    console.log(`✅ POST /api/v1.1/email-addresses - Successfully created email address ${createdEmailAddress.id}`)

    return NextResponse.json({
      success: true,
      data: enhancedResponse,
      message: 'Email address created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('❌ POST /api/v1.1/email-addresses - Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create email address',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
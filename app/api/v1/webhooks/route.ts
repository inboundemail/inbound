import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { endpoints, webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * BACKWARD COMPATIBILITY LAYER
 * This API maintains compatibility with existing webhook integrations
 * while internally using the new endpoints system
 */

export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/v1/webhooks - Fetching webhooks (compatibility layer)')
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn('❌ GET /api/v1/webhooks - Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch webhook-type endpoints and legacy webhooks
    const webhookEndpoints = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.userId, session.user.id),
        eq(endpoints.type, 'webhook')
      ))
      .orderBy(endpoints.createdAt)

    // Also fetch legacy webhooks for complete compatibility
    const legacyWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, session.user.id))
      .orderBy(webhooks.createdAt)

    // Convert endpoints to webhook format
    const webhooksFromEndpoints = webhookEndpoints.map(endpoint => {
      const config = JSON.parse(endpoint.config)
      return {
        id: endpoint.id,
        name: endpoint.name,
        url: config.url,
        secret: config.secret || null,
        isActive: endpoint.isActive,
        description: endpoint.description,
        headers: config.headers ? JSON.stringify(config.headers) : null,
        timeout: config.timeout || 30,
        retryAttempts: config.retryAttempts || 3,
        lastUsed: null, // TODO: Get from delivery stats
        totalDeliveries: 0, // TODO: Calculate from endpoint deliveries
        successfulDeliveries: 0, // TODO: Calculate from endpoint deliveries
        failedDeliveries: 0, // TODO: Calculate from endpoint deliveries
        createdAt: endpoint.createdAt,
        updatedAt: endpoint.updatedAt,
        userId: endpoint.userId,
        _source: 'endpoint' // Internal flag to indicate source
      }
    })

    // Add legacy webhooks with source flag
    const legacyWebhooksWithSource = legacyWebhooks.map(webhook => ({
      ...webhook,
      _source: 'legacy'
    }))

    // Combine both sources
    const allWebhooks = [...webhooksFromEndpoints, ...legacyWebhooksWithSource]

    console.log(`✅ GET /api/v1/webhooks - Retrieved ${allWebhooks.length} webhooks (${webhookEndpoints.length} from endpoints, ${legacyWebhooks.length} legacy)`)

    return NextResponse.json({ 
      webhooks: allWebhooks,
      _deprecationNotice: 'This API is deprecated. Please migrate to /api/v1/endpoints for enhanced functionality.'
    })

  } catch (error) {
    console.error('❌ GET /api/v1/webhooks - Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch webhooks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📝 POST /api/v1/webhooks - Creating webhook (compatibility layer)')
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn('❌ POST /api/v1/webhooks - Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    
    // Validate required webhook fields
    if (!data.name || !data.url) {
      return NextResponse.json(
        { error: 'Missing required fields: name, url' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(data.url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    console.log(`📝 POST /api/v1/webhooks - Creating webhook endpoint: ${data.name}`)

    // Create as webhook endpoint (new system)
    const webhookConfig = {
      url: data.url,
      secret: data.secret || undefined,
      headers: data.headers ? JSON.parse(data.headers) : undefined,
      timeout: data.timeout || 30,
      retryAttempts: data.retryAttempts || 3
    }

    const newEndpoint = {
      id: nanoid(),
      name: data.name,
      type: 'webhook' as const,
      config: JSON.stringify(webhookConfig),
      description: data.description || null,
      userId: session.user.id,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const [createdEndpoint] = await db.insert(endpoints).values(newEndpoint).returning()

    // Convert back to webhook format for response
    const webhookResponse = {
      id: createdEndpoint.id,
      name: createdEndpoint.name,
      url: webhookConfig.url,
      secret: webhookConfig.secret || null,
      isActive: createdEndpoint.isActive,
      description: createdEndpoint.description,
      headers: webhookConfig.headers ? JSON.stringify(webhookConfig.headers) : null,
      timeout: webhookConfig.timeout,
      retryAttempts: webhookConfig.retryAttempts,
      lastUsed: null,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      createdAt: createdEndpoint.createdAt,
      updatedAt: createdEndpoint.updatedAt,
      userId: createdEndpoint.userId
    }

    console.log(`✅ POST /api/v1/webhooks - Successfully created webhook endpoint ${createdEndpoint.id}`)

    return NextResponse.json({ 
      webhook: webhookResponse,
      _deprecationNotice: 'This API is deprecated. Please migrate to /api/v1/endpoints for enhanced functionality.'
    }, { status: 201 })

  } catch (error) {
    console.error('❌ POST /api/v1/webhooks - Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to create webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 
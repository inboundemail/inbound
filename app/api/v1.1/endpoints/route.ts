import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/app/api/v1/lib/auth'
import { db } from '@/lib/db'
import { endpoints, emailGroups, endpointDeliveries } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { CreateEndpointData } from '@/features/endpoints/types'

export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/v1.1/endpoints - Fetching user endpoints')
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const active = searchParams.get('active')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where conditions
    const conditions = [eq(endpoints.userId, userId)]

    if (type && ['webhook', 'email', 'email_group'].includes(type)) {
      conditions.push(eq(endpoints.type, type))
    }

    if (active !== null) {
      const isActive = active === 'true'
      conditions.push(eq(endpoints.isActive, isActive))
    }

    const whereConditions = conditions.length > 1 ? and(...conditions) : conditions[0]

    const query = db
      .select({
        id: endpoints.id,
        name: endpoints.name,
        type: endpoints.type,
        config: endpoints.config,
        isActive: endpoints.isActive,
        description: endpoints.description,
        userId: endpoints.userId,
        createdAt: endpoints.createdAt,
        updatedAt: endpoints.updatedAt,
      })
      .from(endpoints)
      .where(whereConditions)

    const userEndpoints = await query
      .orderBy(desc(endpoints.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: count() })
      .from(endpoints)
      .where(eq(endpoints.userId, userId))
    
    const totalCount = totalCountResult[0]?.count || 0

    // For email_group endpoints, also fetch the group emails and delivery stats
    const endpointsWithEnhancedData = await Promise.all(
      userEndpoints.map(async (endpoint: any) => {
        const enhancedEndpoint = {
          ...endpoint,
          config: JSON.parse(endpoint.config),
          groupEmails: null as string[] | null,
          deliveryStats: {
            total: 0,
            successful: 0,
            failed: 0,
            lastDelivery: null as string | null
          }
        }

        // Add group emails for email_group endpoints
        if (endpoint.type === 'email_group') {
          const groupEmails = await db
            .select({ emailAddress: emailGroups.emailAddress })
            .from(emailGroups)
            .where(eq(emailGroups.endpointId, endpoint.id))
            .orderBy(emailGroups.createdAt)

          enhancedEndpoint.groupEmails = groupEmails.map(g => g.emailAddress)
        }

        // Add delivery statistics
        const deliveryStats = await db
          .select({
            total: count(),
            status: endpointDeliveries.status,
          })
          .from(endpointDeliveries)
          .where(eq(endpointDeliveries.endpointId, endpoint.id))
          .groupBy(endpointDeliveries.status)

        let totalDeliveries = 0
        let successfulDeliveries = 0
        let failedDeliveries = 0

        for (const stat of deliveryStats) {
          totalDeliveries += stat.total
          if (stat.status === 'success') successfulDeliveries += stat.total
          if (stat.status === 'failed') failedDeliveries += stat.total
        }

        // Get the most recent delivery date separately
        const lastDeliveryResult = await db
          .select({ lastDelivery: endpointDeliveries.lastAttemptAt })
          .from(endpointDeliveries)
          .where(eq(endpointDeliveries.endpointId, endpoint.id))
          .orderBy(desc(endpointDeliveries.lastAttemptAt))
          .limit(1)

        const lastDeliveryDate = lastDeliveryResult[0]?.lastDelivery?.toISOString() || null

        enhancedEndpoint.deliveryStats = {
          total: totalDeliveries,
          successful: successfulDeliveries,
          failed: failedDeliveries,
          lastDelivery: lastDeliveryDate
        }

        return enhancedEndpoint
      })
    )

    console.log(`✅ GET /api/v1.1/endpoints - Retrieved ${userEndpoints.length} endpoints for user ${userId}`)

    return NextResponse.json({ 
      success: true,
      data: endpointsWithEnhancedData,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount
      },
      meta: {
        totalCount,
        activeCount: endpointsWithEnhancedData.filter((e: any) => e.isActive).length,
        typeBreakdown: {
          webhook: endpointsWithEnhancedData.filter((e: any) => e.type === 'webhook').length,
          email: endpointsWithEnhancedData.filter((e: any) => e.type === 'email').length,
          email_group: endpointsWithEnhancedData.filter((e: any) => e.type === 'email_group').length
        }
      }
    })

  } catch (error) {
    console.error('❌ GET /api/v1.1/endpoints - Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch endpoints',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📝 POST /api/v1.1/endpoints - Creating new endpoint')
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const data: CreateEndpointData = await request.json()
    
    // Validate required fields
    if (!data.name || !data.type || !data.config) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required fields',
          required: ['name', 'type', 'config']
        },
        { status: 400 }
      )
    }

    // Validate endpoint type
    if (!['webhook', 'email', 'email_group'].includes(data.type)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid endpoint type',
          validTypes: ['webhook', 'email', 'email_group']
        },
        { status: 400 }
      )
    }

    // Validate config based on type
    const validationResult = validateEndpointConfig(data.type, data.config)
    if (!validationResult.valid) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid configuration',
          details: validationResult.error,
          configRequirements: getConfigRequirements(data.type)
        },
        { status: 400 }
      )
    }

    console.log(`📝 POST /api/v1.1/endpoints - Creating ${data.type} endpoint: ${data.name}`)

    const newEndpoint = {
      id: nanoid(),
      name: data.name,
      type: data.type,
      config: JSON.stringify(data.config),
      description: data.description || null,
      userId: userId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const [createdEndpoint] = await db.insert(endpoints).values(newEndpoint).returning()
    
    // If it's an email group, create the group entries
    if (data.type === 'email_group' && 'emails' in data.config) {
      const groupEntries = data.config.emails.map(email => ({
        id: nanoid(),
        endpointId: createdEndpoint.id,
        emailAddress: email,
        createdAt: new Date()
      }))
      
      if (groupEntries.length > 0) {
        await db.insert(emailGroups).values(groupEntries)
        console.log(`📮 POST /api/v1.1/endpoints - Created ${groupEntries.length} email group entries`)
      }
    }

    // Return enhanced response with parsed config
    const response = {
      ...createdEndpoint,
      config: JSON.parse(createdEndpoint.config),
      groupEmails: data.type === 'email_group' && 'emails' in data.config ? data.config.emails : null,
      deliveryStats: {
        total: 0,
        successful: 0,
        failed: 0,
        lastDelivery: null
      }
    }

    console.log(`✅ POST /api/v1.1/endpoints - Successfully created endpoint ${createdEndpoint.id}`)

    return NextResponse.json({ 
      success: true,
      data: response,
      message: `${data.type} endpoint created successfully`
    }, { status: 201 })

  } catch (error) {
    console.error('❌ POST /api/v1.1/endpoints - Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create endpoint',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Validate endpoint configuration based on type
 */
function validateEndpointConfig(type: string, config: any): { valid: boolean; error?: string } {
  try {
    switch (type) {
      case 'webhook':
        if (!config.url) {
          return { valid: false, error: 'Webhook URL is required' }
        }
        if (typeof config.url !== 'string') {
          return { valid: false, error: 'Webhook URL must be a string' }
        }
        // Basic URL validation
        try {
          new URL(config.url)
        } catch {
          return { valid: false, error: 'Invalid webhook URL format' }
        }
        // Validate optional fields
        if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 1 || config.timeout > 300)) {
          return { valid: false, error: 'Timeout must be a number between 1 and 300 seconds' }
        }
        if (config.retryAttempts && (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0 || config.retryAttempts > 10)) {
          return { valid: false, error: 'Retry attempts must be a number between 0 and 10' }
        }
        break

      case 'email':
        if (!config.forwardTo) {
          return { valid: false, error: 'Forward-to email address is required' }
        }
        if (typeof config.forwardTo !== 'string') {
          return { valid: false, error: 'Forward-to email must be a string' }
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(config.forwardTo)) {
          return { valid: false, error: 'Invalid forward-to email address format' }
        }
        break

      case 'email_group':
        if (!config.emails || !Array.isArray(config.emails)) {
          return { valid: false, error: 'Email group must have an emails array' }
        }
        if (config.emails.length === 0) {
          return { valid: false, error: 'Email group must have at least one email address' }
        }
        if (config.emails.length > 50) {
          return { valid: false, error: 'Email group cannot have more than 50 email addresses' }
        }
        // Validate each email in the group
        const emailRegexGroup = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        for (const email of config.emails) {
          if (typeof email !== 'string' || !emailRegexGroup.test(email)) {
            return { valid: false, error: `Invalid email address in group: ${email}` }
          }
        }
        // Check for duplicates
        const uniqueEmails = new Set(config.emails)
        if (uniqueEmails.size !== config.emails.length) {
          return { valid: false, error: 'Email group contains duplicate email addresses' }
        }
        break

      default:
        return { valid: false, error: 'Unknown endpoint type' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: 'Configuration validation failed' }
  }
}

/**
 * Get configuration requirements for endpoint type
 */
function getConfigRequirements(type: string) {
  switch (type) {
    case 'webhook':
      return {
        required: ['url'],
        optional: ['secret', 'headers', 'timeout', 'retryAttempts'],
        description: 'Webhook endpoint that receives HTTP POST requests with email data'
      }
    case 'email':
      return {
        required: ['forwardTo'],
        optional: ['includeAttachments', 'subjectPrefix', 'fromAddress'],
        description: 'Forward emails to a single email address'
      }
    case 'email_group':
      return {
        required: ['emails'],
        optional: ['includeAttachments', 'subjectPrefix', 'fromAddress'],
        description: 'Forward emails to multiple email addresses (max 50)'
      }
    default:
      return { required: [], optional: [], description: 'Unknown endpoint type' }
  }
}
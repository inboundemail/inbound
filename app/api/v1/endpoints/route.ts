import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { endpoints, emailGroups } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { CreateEndpointData } from '@/features/endpoints/types'

export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/v1/endpoints - Fetching user endpoints')
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn('❌ GET /api/v1/endpoints - Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's endpoints with delivery statistics
    const userEndpoints = await db
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
      .where(eq(endpoints.userId, session.user.id))
      .orderBy(endpoints.createdAt)

    // For email_group endpoints, also fetch the group emails
    const endpointsWithGroups = await Promise.all(
      userEndpoints.map(async (endpoint) => {
        if (endpoint.type === 'email_group') {
          const groupEmails = await db
            .select({ emailAddress: emailGroups.emailAddress })
            .from(emailGroups)
            .where(eq(emailGroups.endpointId, endpoint.id))

          return {
            ...endpoint,
            groupEmails: groupEmails.map(g => g.emailAddress)
          }
        }
        return endpoint
      })
    )

    console.log(`✅ GET /api/v1/endpoints - Retrieved ${userEndpoints.length} endpoints for user ${session.user.id}`)

    return NextResponse.json({ 
      success: true,
      endpoints: endpointsWithGroups 
    })

  } catch (error) {
    console.error('❌ GET /api/v1/endpoints - Error:', error)
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
    console.log('📝 POST /api/v1/endpoints - Creating new endpoint')
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn('❌ POST /api/v1/endpoints - Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data: CreateEndpointData = await request.json()
    
    // Validate required fields
    if (!data.name || !data.type || !data.config) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, config' },
        { status: 400 }
      )
    }

    // Validate endpoint type
    if (!['webhook', 'email', 'email_group'].includes(data.type)) {
      return NextResponse.json(
        { error: 'Invalid endpoint type. Must be webhook, email, or email_group' },
        { status: 400 }
      )
    }

    // Validate config based on type
    const validationResult = validateEndpointConfig(data.type, data.config)
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: `Invalid configuration: ${validationResult.error}` },
        { status: 400 }
      )
    }

    console.log(`📝 POST /api/v1/endpoints - Creating ${data.type} endpoint: ${data.name}`)

    const newEndpoint = {
      id: nanoid(),
      name: data.name,
      type: data.type,
      webhookFormat: data.type === 'webhook' ? (data.webhookFormat || 'inbound') : null,
      config: JSON.stringify(data.config),
      description: data.description || null,
      userId: session.user.id,
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
        console.log(`📮 POST /api/v1/endpoints - Created ${groupEntries.length} email group entries`)
      }
    }

    console.log(`✅ POST /api/v1/endpoints - Successfully created endpoint ${createdEndpoint.id}`)

    return NextResponse.json({ 
      success: true,
      endpoint: createdEndpoint 
    }, { status: 201 })

  } catch (error) {
    console.error('❌ POST /api/v1/endpoints - Error:', error)
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
        // Validate each email in the group
        const emailRegexGroup = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        for (const email of config.emails) {
          if (typeof email !== 'string' || !emailRegexGroup.test(email)) {
            return { valid: false, error: `Invalid email address in group: ${email}` }
          }
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
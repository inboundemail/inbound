import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { db } from '@/lib/db'
import { endpoints, emailGroups, endpointDeliveries } from '@/lib/db/schema'
import { eq, and, desc, asc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { CreateEndpointData, Endpoint, EndpointConfig } from '@/features/endpoints/types'

/**
 * GET /api/v2/endpoints
 * Gets all endpoints for the user with filtering and pagination
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/endpoints types
export interface GetEndpointsRequest {
    limit?: number
    offset?: number
    type?: 'webhook' | 'email' | 'email_group'
    active?: 'true' | 'false'
    sortBy?: 'newest' | 'oldest'
}

export interface EndpointWithStats {
    id: string
    name: string
    type: 'webhook' | 'email' | 'email_group'
    config: EndpointConfig
    isActive: boolean
    description: string | null
    userId: string
    createdAt: Date
    updatedAt: Date
    groupEmails: string[] | null
    deliveryStats: {
        total: number
        successful: number
        failed: number
        lastDelivery: string | null
    }
}

export interface GetEndpointsResponse {
    data: EndpointWithStats[]
    pagination: {
        limit: number
        offset: number
        total: number
        hasMore: boolean
    }
}

export async function GET(request: NextRequest) {
    console.log('🔗 GET /api/v2/endpoints - Starting request')
    
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

        const { searchParams } = new URL(request.url)

        // Extract query parameters
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
        const offset = parseInt(searchParams.get('offset') || '0')
        const type = searchParams.get('type')
        const active = searchParams.get('active')
        const sortBy = searchParams.get('sortBy') as 'newest' | 'oldest' | null

        console.log('📊 Query parameters:', {
            limit,
            offset,
            type,
            active,
            sortBy
        })

        // Validate parameters
        if (limit < 1 || limit > 100) {
            console.log('⚠️ Invalid limit parameter:', limit)
            return NextResponse.json(
                { error: 'Limit must be between 1 and 100' },
                { status: 400 }
            )
        }

        if (offset < 0) {
            console.log('⚠️ Invalid offset parameter:', offset)
            return NextResponse.json(
                { error: 'Offset must be non-negative' },
                { status: 400 }
            )
        }

        // Build where conditions
        const conditions = [eq(endpoints.userId, userId)]

        if (type && ['webhook', 'email', 'email_group'].includes(type)) {
            conditions.push(eq(endpoints.type, type))
            console.log('🔍 Filtering by type:', type)
        }

        if (active !== null) {
            const isActive = active === 'true'
            conditions.push(eq(endpoints.isActive, isActive))
            console.log('🔍 Filtering by active status:', isActive)
        }

        const whereConditions = conditions.length > 1 ? and(...conditions) : conditions[0]

        console.log('🔍 Querying endpoints from database')
        
        // Determine sort order - default to newest first
        const sortOrder = sortBy === 'oldest' ? asc(endpoints.createdAt) : desc(endpoints.createdAt)
        
        // Get endpoints
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
            .where(whereConditions)
            .orderBy(sortOrder)
            .limit(limit)
            .offset(offset)

        console.log('📊 Retrieved endpoints count:', userEndpoints.length)

        // Get total count for pagination
        const totalCountResult = await db
            .select({ count: count() })
            .from(endpoints)
            .where(whereConditions)
        
        const totalCount = totalCountResult[0]?.count || 0
        console.log('📊 Total endpoints count:', totalCount)

        // Enhance endpoints with additional data
        console.log('🔧 Enhancing endpoints with additional data')
        const enhancedEndpoints = await Promise.all(
            userEndpoints.map(async (endpoint) => {
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
                    console.log('📧 Loading group emails for endpoint:', endpoint.id)
                    const groupEmails = await db
                        .select({ emailAddress: emailGroups.emailAddress })
                        .from(emailGroups)
                        .where(eq(emailGroups.endpointId, endpoint.id))
                        .orderBy(emailGroups.createdAt)

                    enhancedEndpoint.groupEmails = groupEmails.map(g => g.emailAddress)
                }

                // Add delivery statistics
                console.log('📊 Loading delivery stats for endpoint:', endpoint.id)
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

                // Get the most recent delivery date
                const lastDeliveryResult = await db
                    .select({ lastDelivery: endpointDeliveries.lastAttemptAt })
                    .from(endpointDeliveries)
                    .where(eq(endpointDeliveries.endpointId, endpoint.id))
                    .orderBy(desc(endpointDeliveries.lastAttemptAt))
                    .limit(1)

                const lastDeliveryDate = lastDeliveryResult[0]?.lastDelivery || null

                enhancedEndpoint.deliveryStats = {
                    total: totalDeliveries,
                    successful: successfulDeliveries,
                    failed: failedDeliveries,
                    lastDelivery: lastDeliveryDate ? new Date(lastDeliveryDate).toISOString() : null
                }

                return enhancedEndpoint
            })
        )

        console.log('✅ Successfully enhanced all endpoints')
        return NextResponse.json({
            data: enhancedEndpoints,
            pagination: {
                limit,
                offset,
                total: totalCount,
                hasMore: offset + limit < totalCount
            }
        })

    } catch (error) {
        console.error('💥 Unexpected error in GET /api/v2/endpoints:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/v2/endpoints
 * Creates a new endpoint
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/endpoints types
export interface PostEndpointsRequest {
    name: string
    type: 'webhook' | 'email' | 'email_group'
    config: EndpointConfig
    description?: string
}

export interface PostEndpointsResponse {
    id: string
    name: string
    type: 'webhook' | 'email' | 'email_group'
    config: EndpointConfig
    isActive: boolean
    description: string | null
    userId: string
    createdAt: Date
    updatedAt: Date
    groupEmails: string[] | null
    deliveryStats: {
        total: number
        successful: number
        failed: number
        lastDelivery: string | null
    }
}

export async function POST(request: NextRequest) {
    console.log('➕ POST /api/v2/endpoints - Starting create request')
    
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

        const data: CreateEndpointData = await request.json()
        console.log('📝 Received endpoint data:', {
            name: data.name,
            type: data.type,
            hasConfig: !!data.config,
            description: data.description
        })

        // Validate required fields
        if (!data.name || !data.type || !data.config) {
            console.log('❌ Missing required fields')
            return NextResponse.json(
                { 
                    error: 'Missing required fields',
                    required: ['name', 'type', 'config']
                },
                { status: 400 }
            )
        }

        // Validate endpoint type
        if (!['webhook', 'email', 'email_group'].includes(data.type)) {
            console.log('❌ Invalid endpoint type:', data.type)
            return NextResponse.json(
                { 
                    error: 'Invalid endpoint type',
                    validTypes: ['webhook', 'email', 'email_group']
                },
                { status: 400 }
            )
        }

        // Validate config based on type
        console.log('🔍 Validating endpoint configuration')
        const validationResult = validateEndpointConfig(data.type, data.config)
        if (!validationResult.valid) {
            console.log('❌ Invalid configuration:', validationResult.error)
            return NextResponse.json(
                { 
                    error: 'Invalid configuration',
                    details: validationResult.error
                },
                { status: 400 }
            )
        }

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

        console.log('💾 Creating endpoint in database')
        const [createdEndpoint] = await db.insert(endpoints).values(newEndpoint).returning()
        
        // If it's an email group, create the group entries
        if (data.type === 'email_group' && 'emails' in data.config) {
            console.log('📧 Creating email group entries, count:', data.config.emails.length)
            const groupEntries = data.config.emails.map(email => ({
                id: nanoid(),
                endpointId: createdEndpoint.id,
                emailAddress: email,
                createdAt: new Date()
            }))
            
            if (groupEntries.length > 0) {
                await db.insert(emailGroups).values(groupEntries)
            }
        }

        // Return enhanced response
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

        console.log('✅ Successfully created endpoint:', createdEndpoint.id)
        return NextResponse.json(response, { status: 201 })

    } catch (error) {
        console.error('💥 Unexpected error in POST /api/v2/endpoints:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
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
                try {
                    new URL(config.url)
                } catch {
                    return { valid: false, error: 'Invalid webhook URL format' }
                }
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
                const emailRegexGroup = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                for (const email of config.emails) {
                    if (typeof email !== 'string' || !emailRegexGroup.test(email)) {
                        return { valid: false, error: `Invalid email address in group: ${email}` }
                    }
                }
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
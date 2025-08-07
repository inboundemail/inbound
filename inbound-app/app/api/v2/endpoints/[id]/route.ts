import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { endpoints, emailGroups, endpointDeliveries, emailAddresses, emailDomains } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { UpdateEndpointData, Endpoint, EndpointConfig } from '@/features/endpoints/types'

/**
 * GET /api/v2/endpoints/{id}
 * Gets detailed information about a specific endpoint
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/endpoints/{id} types
export interface GetEndpointByIdRequest {
    id: string // from params
}

export interface EndpointDeliveryItem {
    id: string
    emailId: string
    deliveryType: string
    status: string
    attempts: number
    lastAttemptAt: string | null
    responseData: any
    createdAt: string | null
}

export interface AssociatedEmailAddress {
    id: string
    address: string
    isActive: boolean
    createdAt: string | null
}

export interface CatchAllDomain {
    id: string
    domain: string
    status: string
}

export interface GetEndpointByIdResponse {
    id: string
    name: string
    type: 'webhook' | 'email' | 'email_group'
    config: EndpointConfig
    isActive: boolean
    description: string | null
    userId: string
    createdAt: string | null
    updatedAt: string | null
    groupEmails: string[] | null
    deliveryStats: {
        total: number
        successful: number
        failed: number
        lastDelivery: string | null
    }
    recentDeliveries: EndpointDeliveryItem[]
    associatedEmails: AssociatedEmailAddress[]
    catchAllDomains: CatchAllDomain[]
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    console.log('🔍 GET /api/v2/endpoints/{id} - Starting request for endpoint:', id)
    
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

        // Get endpoint with user verification
        console.log('🔍 Querying endpoint from database')
        const endpointResult = await db
            .select()
            .from(endpoints)
            .where(and(
                eq(endpoints.id, id),
                eq(endpoints.userId, userId)
            ))
            .limit(1)

        if (!endpointResult[0]) {
            console.log('❌ Endpoint not found for user:', userId, 'endpoint:', id)
            return NextResponse.json(
                { error: 'Endpoint not found' },
                { status: 404 }
            )
        }

        const endpoint = endpointResult[0]
        console.log('✅ Found endpoint:', endpoint.name, 'type:', endpoint.type)

        // Get group emails if it's an email_group endpoint
        let groupEmails: string[] | null = null
        if (endpoint.type === 'email_group') {
            console.log('📧 Fetching group emails for email_group endpoint')
            const groupEmailsResult = await db
                .select({ emailAddress: emailGroups.emailAddress })
                .from(emailGroups)
                .where(eq(emailGroups.endpointId, endpoint.id))
                .orderBy(emailGroups.createdAt)

            groupEmails = groupEmailsResult.map(g => g.emailAddress)
            console.log('📧 Found', groupEmails.length, 'group emails')
        }

        // Get delivery statistics
        console.log('📊 Fetching delivery statistics')
        const deliveryStatsResult = await db
            .select({
                total: count(),
                status: endpointDeliveries.status
            })
            .from(endpointDeliveries)
            .where(eq(endpointDeliveries.endpointId, endpoint.id))
            .groupBy(endpointDeliveries.status)

        let totalDeliveries = 0
        let successfulDeliveries = 0
        let failedDeliveries = 0

        for (const stat of deliveryStatsResult) {
            totalDeliveries += stat.total
            if (stat.status === 'success') successfulDeliveries += stat.total
            if (stat.status === 'failed') failedDeliveries += stat.total
        }

        console.log('📊 Delivery stats - Total:', totalDeliveries, 'Success:', successfulDeliveries, 'Failed:', failedDeliveries)

        // Get recent deliveries
        console.log('📋 Fetching recent deliveries')
        const recentDeliveries = await db
            .select({
                id: endpointDeliveries.id,
                emailId: endpointDeliveries.emailId,
                deliveryType: endpointDeliveries.deliveryType,
                status: endpointDeliveries.status,
                attempts: endpointDeliveries.attempts,
                lastAttemptAt: endpointDeliveries.lastAttemptAt,
                responseData: endpointDeliveries.responseData,
                createdAt: endpointDeliveries.createdAt
            })
            .from(endpointDeliveries)
            .where(eq(endpointDeliveries.endpointId, endpoint.id))
            .orderBy(desc(endpointDeliveries.createdAt))
            .limit(10)

        console.log('📋 Found', recentDeliveries.length, 'recent deliveries')

        // Get associated email addresses
        console.log('📮 Fetching associated email addresses')
        const associatedEmails = await db
            .select({
                id: emailAddresses.id,
                address: emailAddresses.address,
                isActive: emailAddresses.isActive,
                createdAt: emailAddresses.createdAt
            })
            .from(emailAddresses)
            .where(eq(emailAddresses.endpointId, endpoint.id))
            .orderBy(emailAddresses.createdAt)

        console.log('📮 Found', associatedEmails.length, 'associated email addresses')

        // Get catch-all domains using this endpoint
        console.log('🌐 Fetching catch-all domains')
        const catchAllDomains = await db
            .select({
                id: emailDomains.id,
                domain: emailDomains.domain,
                status: emailDomains.status
            })
            .from(emailDomains)
            .where(eq(emailDomains.catchAllEndpointId, endpoint.id))

        console.log('🌐 Found', catchAllDomains.length, 'catch-all domains')

        // Get the most recent delivery date
        const lastDeliveryResult = await db
            .select({ lastDelivery: endpointDeliveries.lastAttemptAt })
            .from(endpointDeliveries)
            .where(eq(endpointDeliveries.endpointId, endpoint.id))
            .orderBy(desc(endpointDeliveries.lastAttemptAt))
            .limit(1)

        const lastDeliveryDate = lastDeliveryResult[0]?.lastDelivery || null

        const response = {
            ...endpoint,
            config: JSON.parse(endpoint.config),
            groupEmails,
            deliveryStats: {
                total: totalDeliveries,
                successful: successfulDeliveries,
                failed: failedDeliveries,
                lastDelivery: lastDeliveryDate ? new Date(lastDeliveryDate).toISOString() : null
            },
            recentDeliveries: recentDeliveries.map(d => ({
                ...d,
                lastAttemptAt: d.lastAttemptAt ? new Date(d.lastAttemptAt).toISOString() : null,
                createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
                responseData: d.responseData ? JSON.parse(d.responseData) : null
            })),
            associatedEmails: associatedEmails.map(e => ({
                ...e,
                createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null
            })),
            catchAllDomains,
            createdAt: endpoint.createdAt ? new Date(endpoint.createdAt).toISOString() : null,
            updatedAt: endpoint.updatedAt ? new Date(endpoint.updatedAt).toISOString() : null
        }

        console.log('✅ GET /api/v2/endpoints/{id} - Successfully returning endpoint data')
        return NextResponse.json(response)

    } catch (error) {
        console.error('💥 Unexpected error in GET /api/v2/endpoints/{id}:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * PUT /api/v2/endpoints/{id}
 * Updates an existing endpoint
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// PUT /api/v2/endpoints/{id} types
export interface PutEndpointByIdRequest {
    id: string // from params
    name?: string
    description?: string
    isActive?: boolean
    config?: EndpointConfig
}

export interface PutEndpointByIdResponse {
    id: string
    name: string
    type: 'webhook' | 'email' | 'email_group'
    config: EndpointConfig
    isActive: boolean
    description: string | null
    userId: string
    createdAt: string | null
    updatedAt: string | null
    groupEmails: string[] | null
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    console.log('✏️ PUT /api/v2/endpoints/{id} - Starting update for endpoint:', id)
    
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

        const data: UpdateEndpointData = await request.json()
        console.log('📝 Update data received:', {
            hasName: !!data.name,
            hasDescription: !!data.description,
            hasIsActive: data.isActive !== undefined,
            hasConfig: !!data.config
        })

        // Check if endpoint exists and belongs to user
        console.log('🔍 Checking if endpoint exists and belongs to user')
        const existingEndpoint = await db
            .select()
            .from(endpoints)
            .where(and(
                eq(endpoints.id, id),
                eq(endpoints.userId, userId)
            ))
            .limit(1)

        if (!existingEndpoint[0]) {
            console.log('❌ Endpoint not found for user:', userId, 'endpoint:', id)
            return NextResponse.json(
                { error: 'Endpoint not found' },
                { status: 404 }
            )
        }

        console.log('✅ Found existing endpoint:', existingEndpoint[0].name, 'type:', existingEndpoint[0].type)

        // Validate config if provided
        if (data.config) {
            console.log('🔍 Validating endpoint configuration')
            const validationResult = validateEndpointConfig(existingEndpoint[0].type, data.config)
            if (!validationResult.valid) {
                console.log('❌ Configuration validation failed:', validationResult.error)
                return NextResponse.json(
                    {
                        error: 'Invalid configuration',
                        details: validationResult.error
                    },
                    { status: 400 }
                )
            }
            console.log('✅ Configuration validation passed')
        }

        // Prepare update data
        const updateData: any = {
            updatedAt: new Date()
        }

        if (data.name !== undefined) updateData.name = data.name
        if (data.description !== undefined) updateData.description = data.description
        if (data.isActive !== undefined) updateData.isActive = data.isActive
        if (data.config !== undefined) updateData.config = JSON.stringify(data.config)

        console.log('💾 Updating endpoint with fields:', Object.keys(updateData))

        // Update the endpoint
        const [updatedEndpoint] = await db
            .update(endpoints)
            .set(updateData)
            .where(eq(endpoints.id, id))
            .returning()

        console.log('✅ Endpoint updated successfully')

        // If config was updated and it's an email group, update the group entries
        if (data.config && existingEndpoint[0].type === 'email_group' && 'emails' in data.config) {
            console.log('📧 Updating email group entries')
            
            // Delete existing group entries
            await db.delete(emailGroups).where(eq(emailGroups.endpointId, id))
            console.log('🗑️ Deleted existing group entries')
            
            // Create new group entries
            const groupEntries = data.config.emails.map(email => ({
                id: nanoid(),
                endpointId: id,
                emailAddress: email,
                createdAt: new Date()
            }))
            
            if (groupEntries.length > 0) {
                await db.insert(emailGroups).values(groupEntries)
                console.log('✅ Created', groupEntries.length, 'new group entries')
            }
        }

        // Get updated group emails if needed
        let groupEmails: string[] | null = null
        if (updatedEndpoint.type === 'email_group') {
            console.log('📧 Fetching updated group emails')
            const groupEmailsResult = await db
                .select({ emailAddress: emailGroups.emailAddress })
                .from(emailGroups)
                .where(eq(emailGroups.endpointId, id))
                .orderBy(emailGroups.createdAt)

            groupEmails = groupEmailsResult.map(g => g.emailAddress)
            console.log('📧 Found', groupEmails.length, 'updated group emails')
        }

        const response = {
            ...updatedEndpoint,
            config: JSON.parse(updatedEndpoint.config),
            groupEmails,
            createdAt: updatedEndpoint.createdAt ? new Date(updatedEndpoint.createdAt).toISOString() : null,
            updatedAt: updatedEndpoint.updatedAt ? new Date(updatedEndpoint.updatedAt).toISOString() : null
        }

        console.log('✅ PUT /api/v2/endpoints/{id} - Successfully returning updated endpoint')
        return NextResponse.json(response)

    } catch (error) {
        console.error('💥 Unexpected error in PUT /api/v2/endpoints/{id}:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/v2/endpoints/{id}
 * Deletes an endpoint and handles cleanup
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// DELETE /api/v2/endpoints/{id} types
export interface DeleteEndpointByIdRequest {
    id: string // from params
}

export interface DeleteEndpointByIdResponse {
    message: string
    cleanup: {
        emailAddressesUpdated: number
        emailAddresses: string[]
        domainsUpdated: number
        domains: string[]
        groupEmailsDeleted: number
        deliveriesDeleted: number
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    console.log('🗑️ DELETE /api/v2/endpoints/{id} - Starting deletion for endpoint:', id)
    
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

        // Check if endpoint exists and belongs to user
        console.log('🔍 Checking if endpoint exists and belongs to user')
        const existingEndpoint = await db
            .select()
            .from(endpoints)
            .where(and(
                eq(endpoints.id, id),
                eq(endpoints.userId, userId)
            ))
            .limit(1)

        if (!existingEndpoint[0]) {
            console.log('❌ Endpoint not found for user:', userId, 'endpoint:', id)
            return NextResponse.json(
                { error: 'Endpoint not found' },
                { status: 404 }
            )
        }

        console.log('✅ Found endpoint to delete:', existingEndpoint[0].name, 'type:', existingEndpoint[0].type)

        // Update email addresses to "store only" (clear endpointId) before deleting the endpoint
        console.log('📮 Updating email addresses to store-only mode')
        const updatedEmailAddresses = await db
            .update(emailAddresses)
            .set({ 
                endpointId: null,
                updatedAt: new Date()
            })
            .where(eq(emailAddresses.endpointId, id))
            .returning({ address: emailAddresses.address })

        console.log('📮 Updated', updatedEmailAddresses.length, 'email addresses to store-only')

        // Update domain catch-all configurations to remove this endpoint
        console.log('🌐 Removing endpoint from catch-all domain configurations')
        const updatedDomains = await db
            .update(emailDomains)
            .set({ 
                catchAllEndpointId: null,
                updatedAt: new Date()
            })
            .where(eq(emailDomains.catchAllEndpointId, id))
            .returning({ domain: emailDomains.domain })

        console.log('🌐 Updated', updatedDomains.length, 'domains to remove catch-all endpoint')

        // Delete email group entries if it's an email group
        let deletedGroupEmails = 0
        if (existingEndpoint[0].type === 'email_group') {
            console.log('📧 Deleting email group entries')
            const deletedGroups = await db
                .delete(emailGroups)
                .where(eq(emailGroups.endpointId, id))
                .returning()
            deletedGroupEmails = deletedGroups.length
            console.log('📧 Deleted', deletedGroupEmails, 'group email entries')
        }

        // Delete endpoint delivery history
        console.log('📊 Deleting endpoint delivery history')
        const deletedDeliveries = await db
            .delete(endpointDeliveries)
            .where(eq(endpointDeliveries.endpointId, id))
            .returning()

        console.log('📊 Deleted', deletedDeliveries.length, 'delivery records')

        // Delete the endpoint
        console.log('🗑️ Deleting the endpoint')
        await db.delete(endpoints).where(eq(endpoints.id, id))

        console.log('✅ DELETE /api/v2/endpoints/{id} - Successfully deleted endpoint and cleaned up')

        return NextResponse.json({
            message: 'Endpoint deleted successfully',
            cleanup: {
                emailAddressesUpdated: updatedEmailAddresses.length,
                emailAddresses: updatedEmailAddresses.map(e => e.address),
                domainsUpdated: updatedDomains.length,
                domains: updatedDomains.map(d => d.domain),
                groupEmailsDeleted: deletedGroupEmails,
                deliveriesDeleted: deletedDeliveries.length
            }
        })

    } catch (error) {
        console.error('💥 Unexpected error in DELETE /api/v2/endpoints/{id}:', error)
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
        console.log('🔍 Validating config for type:', type)
        
        switch (type) {
            case 'webhook':
                if (!config.url) {
                    console.log('❌ Webhook validation failed: URL is required')
                    return { valid: false, error: 'Webhook URL is required' }
                }
                if (typeof config.url !== 'string') {
                    console.log('❌ Webhook validation failed: URL must be string')
                    return { valid: false, error: 'Webhook URL must be a string' }
                }
                try {
                    new URL(config.url)
                } catch {
                    console.log('❌ Webhook validation failed: Invalid URL format')
                    return { valid: false, error: 'Invalid webhook URL format' }
                }
                if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 1 || config.timeout > 300)) {
                    console.log('❌ Webhook validation failed: Invalid timeout')
                    return { valid: false, error: 'Timeout must be a number between 1 and 300 seconds' }
                }
                if (config.retryAttempts && (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0 || config.retryAttempts > 10)) {
                    console.log('❌ Webhook validation failed: Invalid retry attempts')
                    return { valid: false, error: 'Retry attempts must be a number between 0 and 10' }
                }
                break

            case 'email':
                if (!config.forwardTo) {
                    console.log('❌ Email validation failed: forwardTo is required')
                    return { valid: false, error: 'Forward-to email address is required' }
                }
                if (typeof config.forwardTo !== 'string') {
                    console.log('❌ Email validation failed: forwardTo must be string')
                    return { valid: false, error: 'Forward-to email must be a string' }
                }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                if (!emailRegex.test(config.forwardTo)) {
                    console.log('❌ Email validation failed: Invalid email format')
                    return { valid: false, error: 'Invalid forward-to email address format' }
                }
                break

            case 'email_group':
                if (!config.emails || !Array.isArray(config.emails)) {
                    console.log('❌ Email group validation failed: emails array required')
                    return { valid: false, error: 'Email group must have an emails array' }
                }
                if (config.emails.length === 0) {
                    console.log('❌ Email group validation failed: empty emails array')
                    return { valid: false, error: 'Email group must have at least one email address' }
                }
                if (config.emails.length > 50) {
                    console.log('❌ Email group validation failed: too many emails')
                    return { valid: false, error: 'Email group cannot have more than 50 email addresses' }
                }
                const emailRegexGroup = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                for (const email of config.emails) {
                    if (typeof email !== 'string' || !emailRegexGroup.test(email)) {
                        console.log('❌ Email group validation failed: invalid email in group:', email)
                        return { valid: false, error: `Invalid email address in group: ${email}` }
                    }
                }
                const uniqueEmails = new Set(config.emails)
                if (uniqueEmails.size !== config.emails.length) {
                    console.log('❌ Email group validation failed: duplicate emails')
                    return { valid: false, error: 'Email group contains duplicate email addresses' }
                }
                break

            default:
                console.log('❌ Validation failed: unknown endpoint type:', type)
                return { valid: false, error: 'Unknown endpoint type' }
        }

        console.log('✅ Configuration validation passed for type:', type)
        return { valid: true }
    } catch (error) {
        console.error('💥 Error during config validation:', error)
        return { valid: false, error: 'Configuration validation failed' }
    }
} 
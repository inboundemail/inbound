import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { db } from '@/lib/db'
import { emailAddresses, emailDomains, endpoints, webhooks } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'
import type { EmailAddress, NewEmailAddress } from '@/lib/db/schema'

/**
 * GET /api/v2/email-addresses
 * Lists all email addresses for the authenticated user with filtering and pagination
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/email-addresses types
export interface GetEmailAddressesRequest {
    limit?: number
    offset?: number
    domainId?: string
    isActive?: 'true' | 'false'
    isReceiptRuleConfigured?: 'true' | 'false'
}

export interface EmailAddressWithDomain {
    id: string
    address: string
    domainId: string
    webhookId: string | null
    endpointId: string | null
    isActive: boolean
    isReceiptRuleConfigured: boolean
    receiptRuleName: string | null
    createdAt: Date
    updatedAt: Date
    userId: string
    domain: {
        id: string
        name: string
        status: string
    }
    routing: {
        type: 'webhook' | 'endpoint' | 'none'
        id: string | null
        name: string | null
        config?: any
        isActive: boolean
    }
}

export interface GetEmailAddressesResponse {
    data: EmailAddressWithDomain[]
    pagination: {
        limit: number
        offset: number
        total: number
        hasMore: boolean
    }
}

export async function GET(request: NextRequest) {
    console.log('📧 GET /api/v2/email-addresses - Starting request')
    
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
        const domainId = searchParams.get('domainId')
        const isActive = searchParams.get('isActive')
        const isReceiptRuleConfigured = searchParams.get('isReceiptRuleConfigured')

        console.log('📊 Query parameters:', {
            limit,
            offset,
            domainId,
            isActive,
            isReceiptRuleConfigured
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
        const conditions = [eq(emailAddresses.userId, userId)]

        if (domainId) {
            conditions.push(eq(emailAddresses.domainId, domainId))
            console.log('🔍 Filtering by domainId:', domainId)
        }

        if (isActive !== null) {
            const activeValue = isActive === 'true'
            conditions.push(eq(emailAddresses.isActive, activeValue))
            console.log('🔍 Filtering by active status:', activeValue)
        }

        if (isReceiptRuleConfigured !== null) {
            const configuredValue = isReceiptRuleConfigured === 'true'
            conditions.push(eq(emailAddresses.isReceiptRuleConfigured, configuredValue))
            console.log('🔍 Filtering by receipt rule configured:', configuredValue)
        }

        const whereConditions = conditions.length > 1 ? and(...conditions) : conditions[0]

        console.log('🔍 Querying email addresses from database')
        // Get email addresses with domains
        const userEmailAddresses = await db
            .select({
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
                userId: emailAddresses.userId,
                domainName: emailDomains.domain,
                domainStatus: emailDomains.status,
            })
            .from(emailAddresses)
            .innerJoin(emailDomains, eq(emailAddresses.domainId, emailDomains.id))
            .where(whereConditions)
            .orderBy(desc(emailAddresses.createdAt))
            .limit(limit)
            .offset(offset)

        console.log('📊 Retrieved email addresses count:', userEmailAddresses.length)

        // Get total count for pagination
        const totalCountResult = await db
            .select({ count: count() })
            .from(emailAddresses)
            .where(whereConditions)
        
        const totalCount = totalCountResult[0]?.count || 0
        console.log('📊 Total email addresses count:', totalCount)

        // Enhance email addresses with routing information
        console.log('🔧 Enhancing email addresses with routing information')
        const enhancedEmailAddresses: EmailAddressWithDomain[] = []

        for (const emailAddress of userEmailAddresses) {
            let routing: EmailAddressWithDomain['routing'] = {
                type: 'none',
                id: null,
                name: null,
                isActive: false
            }

            // Get endpoint or webhook routing info
            if (emailAddress.endpointId) {
                const endpoint = await db
                    .select({
                        id: endpoints.id,
                        name: endpoints.name,
                        type: endpoints.type,
                        config: endpoints.config,
                        isActive: endpoints.isActive,
                    })
                    .from(endpoints)
                    .where(eq(endpoints.id, emailAddress.endpointId))
                    .limit(1)

                if (endpoint[0]) {
                    routing = {
                        type: 'endpoint',
                        id: endpoint[0].id,
                        name: endpoint[0].name,
                        config: JSON.parse(endpoint[0].config),
                        isActive: endpoint[0].isActive || false
                    }
                }
            } else if (emailAddress.webhookId) {
                const webhook = await db
                    .select({
                        id: webhooks.id,
                        name: webhooks.name,
                        url: webhooks.url,
                        isActive: webhooks.isActive,
                    })
                    .from(webhooks)
                    .where(eq(webhooks.id, emailAddress.webhookId))
                    .limit(1)

                if (webhook[0]) {
                    routing = {
                        type: 'webhook',
                        id: webhook[0].id,
                        name: webhook[0].name,
                        config: { url: webhook[0].url },
                        isActive: webhook[0].isActive || false
                    }
                }
            }

            enhancedEmailAddresses.push({
                id: emailAddress.id,
                address: emailAddress.address,
                domainId: emailAddress.domainId,
                webhookId: emailAddress.webhookId,
                endpointId: emailAddress.endpointId,
                isActive: emailAddress.isActive || false,
                isReceiptRuleConfigured: emailAddress.isReceiptRuleConfigured || false,
                receiptRuleName: emailAddress.receiptRuleName,
                createdAt: emailAddress.createdAt || new Date(),
                updatedAt: emailAddress.updatedAt || new Date(),
                userId: emailAddress.userId,
                domain: {
                    id: emailAddress.domainId,
                    name: emailAddress.domainName,
                    status: emailAddress.domainStatus
                },
                routing
            })
        }

        const response: GetEmailAddressesResponse = {
            data: enhancedEmailAddresses,
            pagination: {
                limit,
                offset,
                total: totalCount,
                hasMore: offset + limit < totalCount
            }
        }

        console.log('✅ GET /api/v2/email-addresses - Successfully retrieved email addresses')
        return NextResponse.json(response, { status: 200 })

    } catch (error) {
        console.error('❌ GET /api/v2/email-addresses - Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/v2/email-addresses
 * Creates a new email address and configures SES receipt rules
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/email-addresses types
export interface PostEmailAddressesRequest {
    address: string
    domainId: string
    endpointId?: string
    webhookId?: string
    isActive?: boolean
}

export interface PostEmailAddressesResponse {
    id: string
    address: string
    domainId: string
    webhookId: string | null
    endpointId: string | null
    isActive: boolean
    isReceiptRuleConfigured: boolean
    receiptRuleName: string | null
    createdAt: Date
    updatedAt: Date
    userId: string
    domain: {
        id: string
        name: string
        status: string
    }
    routing: {
        type: 'webhook' | 'endpoint' | 'none'
        id: string | null
        name: string | null
        config?: any
        isActive: boolean
    }
    warning?: string
}

export async function POST(request: NextRequest) {
    console.log('📝 POST /api/v2/email-addresses - Starting request')
    
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

        const data: PostEmailAddressesRequest = await request.json()
        console.log('📋 Request data:', {
            address: data.address,
            domainId: data.domainId,
            endpointId: data.endpointId,
            webhookId: data.webhookId,
            isActive: data.isActive
        })

        // Validate required fields
        if (!data.address || !data.domainId) {
            console.log('❌ Missing required fields')
            return NextResponse.json(
                { 
                    error: 'Missing required fields',
                    required: ['address', 'domainId']
                },
                { status: 400 }
            )
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(data.address)) {
            console.log('❌ Invalid email address format:', data.address)
            return NextResponse.json(
                { error: 'Invalid email address format' },
                { status: 400 }
            )
        }

        // Check if domain exists and belongs to user
        console.log('🔍 Checking domain ownership')
        const domainResult = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, data.domainId),
                eq(emailDomains.userId, userId)
            ))
            .limit(1)

        if (!domainResult[0]) {
            console.log('❌ Domain not found or access denied:', data.domainId)
            return NextResponse.json({
                error: 'Domain not found or access denied'
            }, { status: 404 })
        }

        // Validate email domain matches domain record
        const emailDomain = data.address.split('@')[1]
        if (emailDomain !== domainResult[0].domain) {
            console.log('❌ Email domain mismatch:', emailDomain, 'vs', domainResult[0].domain)
            return NextResponse.json({
                error: `Email address must belong to domain ${domainResult[0].domain}`
            }, { status: 400 })
        }

        // Check if email already exists
        console.log('🔍 Checking if email address already exists')
        const existingEmail = await db
            .select()
            .from(emailAddresses)
            .where(eq(emailAddresses.address, data.address))
            .limit(1)

        if (existingEmail[0]) {
            console.log('❌ Email address already exists:', data.address)
            return NextResponse.json({
                error: 'Email address already exists'
            }, { status: 409 })
        }

        // Validate endpoint/webhook if provided
        let endpointId = null
        let webhookId = null
        let routingInfo = null
        
        if (data.endpointId) {
            console.log('🔍 Validating endpoint:', data.endpointId)
            const endpointResult = await db
                .select()
                .from(endpoints)
                .where(and(
                    eq(endpoints.id, data.endpointId),
                    eq(endpoints.userId, userId)
                ))
                .limit(1)

            if (!endpointResult[0]) {
                console.log('❌ Endpoint not found or access denied:', data.endpointId)
                return NextResponse.json({
                    error: 'Endpoint not found or access denied'
                }, { status: 404 })
            }
            endpointId = data.endpointId
            routingInfo = {
                type: 'endpoint' as const,
                id: endpointResult[0].id,
                name: endpointResult[0].name,
                config: JSON.parse(endpointResult[0].config),
                isActive: endpointResult[0].isActive || false
            }
        } else if (data.webhookId) {
            console.log('🔍 Validating webhook:', data.webhookId)
            const webhookResult = await db
                .select()
                .from(webhooks)
                .where(and(
                    eq(webhooks.id, data.webhookId),
                    eq(webhooks.userId, userId)
                ))
                .limit(1)

            if (!webhookResult[0]) {
                console.log('❌ Webhook not found or access denied:', data.webhookId)
                return NextResponse.json({
                    error: 'Webhook not found or access denied'
                }, { status: 404 })
            }
            webhookId = data.webhookId
            routingInfo = {
                type: 'webhook' as const,
                id: webhookResult[0].id,
                name: webhookResult[0].name,
                config: { url: webhookResult[0].url },
                isActive: webhookResult[0].isActive || false
            }
        }

        // Create the email address
        console.log('📝 Creating email address record')
        const newEmailAddress: NewEmailAddress = {
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
        console.log('✅ Email address record created:', createdEmailAddress.id)

        // Configure AWS SES receipt rule for the new email
        let isReceiptRuleConfigured = false
        let receiptRuleName = null
        let awsConfigurationWarning = null

        try {
            console.log('🔧 Configuring AWS SES receipt rules')
            const sesManager = new AWSSESReceiptRuleManager()
            
            // Get AWS configuration
            const awsRegion = process.env.AWS_REGION || 'us-east-2'
            const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
            const s3BucketName = process.env.S3_BUCKET_NAME
            const awsAccountId = process.env.AWS_ACCOUNT_ID

            if (!s3BucketName || !awsAccountId) {
                awsConfigurationWarning = 'AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID'
                console.warn(`⚠️ ${awsConfigurationWarning}`)
            } else {
                const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
                    lambdaFunctionName,
                    awsAccountId,
                    awsRegion
                )

                console.log('🔧 Configuring SES receipt rule for:', data.address)
                const receiptResult = await sesManager.configureEmailReceiving({
                    domain: domainResult[0].domain,
                    emailAddresses: [data.address],
                    lambdaFunctionArn: lambdaArn,
                    s3BucketName
                })
                
                if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
                    // Update email record with receipt rule information
                    await db
                        .update(emailAddresses)
                        .set({
                            isReceiptRuleConfigured: true,
                            receiptRuleName: receiptResult.ruleName,
                            updatedAt: new Date(),
                        })
                        .where(eq(emailAddresses.id, createdEmailAddress.id))

                    isReceiptRuleConfigured = true
                    receiptRuleName = receiptResult.ruleName
                    console.log('✅ AWS SES configured successfully')
                } else {
                    awsConfigurationWarning = `SES configuration failed: ${receiptResult.error}`
                    console.warn(`⚠️ ${awsConfigurationWarning}`)
                }
            }
        } catch (error) {
            awsConfigurationWarning = `SES configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error('❌ AWS SES configuration failed:', error)
        }

        // Build response
        const response: PostEmailAddressesResponse = {
            id: createdEmailAddress.id,
            address: createdEmailAddress.address,
            domainId: createdEmailAddress.domainId,
            webhookId: createdEmailAddress.webhookId,
            endpointId: createdEmailAddress.endpointId,
            isActive: createdEmailAddress.isActive || false,
            isReceiptRuleConfigured,
            receiptRuleName,
            createdAt: createdEmailAddress.createdAt || new Date(),
            updatedAt: createdEmailAddress.updatedAt || new Date(),
            userId: createdEmailAddress.userId,
            domain: {
                id: domainResult[0].id,
                name: domainResult[0].domain,
                status: domainResult[0].status
            },
            routing: routingInfo || {
                type: 'none',
                id: null,
                name: null,
                isActive: false
            },
            ...(awsConfigurationWarning && { warning: awsConfigurationWarning })
        }

        console.log('✅ POST /api/v2/email-addresses - Successfully created email address')
        return NextResponse.json(response, { status: 201 })

    } catch (error) {
        console.error('❌ POST /api/v2/email-addresses - Error:', error)
        return NextResponse.json(
            { 
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
} 
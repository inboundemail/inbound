import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { emailAddresses, emailDomains, endpoints, webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'
import type { EmailAddress } from '@/lib/db/schema'

/**
 * GET /api/v2/email-addresses/[id]
 * Gets a specific email address by ID with detailed information
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/email-addresses/[id] types
export interface GetEmailAddressByIdResponse {
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

/**
 * Get email address details
 * @description Get detailed information about a specific email address including domain and routing configuration.
 * @pathParams EmailAddressIdParam
 * @response GetEmailAddressByIdResponse:Detailed email address information
 * @add 404:NotFoundError:Email address not found or doesn't belong to the user
 * @responseSet auth
 * @auth apikey
 * @tag Email Addresses
 * @openapi
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('📧 GET /api/v2/email-addresses/[id] - Starting request')
    
    try {
        const { id } = await params

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

        console.log('🔍 Looking up email address:', id)
        
        // Get email address with domain information
        const emailAddressResult = await db
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
            .where(and(
                eq(emailAddresses.id, id),
                eq(emailAddresses.userId, userId)
            ))
            .limit(1)

        if (!emailAddressResult[0]) {
            console.log('❌ Email address not found:', id)
            return NextResponse.json(
                { error: 'Email address not found' },
                { status: 404 }
            )
        }

        const emailAddress = emailAddressResult[0]
        console.log('✅ Found email address:', emailAddress.address)

        // Get routing information
        let routing: GetEmailAddressByIdResponse['routing'] = {
            type: 'none',
            id: null,
            name: null,
            isActive: false
        }

        if (emailAddress.endpointId) {
            console.log('🔍 Looking up endpoint routing:', emailAddress.endpointId)
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
            console.log('🔍 Looking up webhook routing:', emailAddress.webhookId)
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

        const response: GetEmailAddressByIdResponse = {
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
        }

        console.log('✅ GET /api/v2/email-addresses/[id] - Successfully retrieved email address')
        return NextResponse.json(response, { status: 200 })

    } catch (error) {
        console.error('❌ GET /api/v2/email-addresses/[id] - Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * PUT /api/v2/email-addresses/[id]
 * Updates an email address and reconfigures SES rules if needed
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// PUT /api/v2/email-addresses/[id] types
export interface PutEmailAddressByIdRequest {
    endpointId?: string | null
    webhookId?: string | null
    isActive?: boolean
}

export interface PutEmailAddressByIdResponse {
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

/**
 * Update email address routing
 * @description Update an email address's routing configuration (endpoint, webhook, or disable routing).
 * @pathParams EmailAddressIdParam
 * @body PutEmailAddressByIdRequest
 * @response PutEmailAddressByIdResponse:Updated email address information
 * @add 404:NotFoundError:Email address, endpoint, or webhook not found
 * @responseSet crud
 * @auth apikey
 * @tag Email Addresses
 * @openapi
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('📝 PUT /api/v2/email-addresses/[id] - Starting request')
    
    try {
        const { id } = await params

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

        const data: PutEmailAddressByIdRequest = await request.json()
        console.log('📋 Request data:', {
            endpointId: data.endpointId,
            webhookId: data.webhookId,
            isActive: data.isActive
        })

        // Get current email address
        console.log('🔍 Looking up current email address:', id)
        const currentEmailAddress = await db
            .select()
            .from(emailAddresses)
            .where(and(
                eq(emailAddresses.id, id),
                eq(emailAddresses.userId, userId)
            ))
            .limit(1)

        if (!currentEmailAddress[0]) {
            console.log('❌ Email address not found:', id)
            return NextResponse.json(
                { error: 'Email address not found' },
                { status: 404 }
            )
        }

        // Get domain information
        const domainResult = await db
            .select()
            .from(emailDomains)
            .where(eq(emailDomains.id, currentEmailAddress[0].domainId))
            .limit(1)

        if (!domainResult[0]) {
            console.log('❌ Domain not found for email address:', currentEmailAddress[0].domainId)
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            )
        }

        // Validate endpoint/webhook if provided
        let endpointId = data.endpointId
        let webhookId = data.webhookId
        let routingInfo = null

        // Clear conflicting routing (can't have both endpoint and webhook)
        if (endpointId !== undefined && webhookId !== undefined) {
            if (endpointId && webhookId) {
                console.log('❌ Cannot specify both endpoint and webhook')
                return NextResponse.json(
                    { error: 'Cannot specify both endpoint and webhook' },
                    { status: 400 }
                )
            }
        }

        // NOTE: We should NOT modify the input values here!
        // The logic below will handle what to update in the database

        // Validate endpoint if provided
        if (endpointId) {
            console.log('🔍 Validating endpoint:', endpointId)
            const endpointResult = await db
                .select()
                .from(endpoints)
                .where(and(
                    eq(endpoints.id, endpointId),
                    eq(endpoints.userId, userId)
                ))
                .limit(1)

            if (!endpointResult[0]) {
                console.log('❌ Endpoint not found or access denied:', endpointId)
                return NextResponse.json({
                    error: 'Endpoint not found or access denied'
                }, { status: 404 })
            }
            routingInfo = {
                type: 'endpoint' as const,
                id: endpointResult[0].id,
                name: endpointResult[0].name,
                config: JSON.parse(endpointResult[0].config),
                isActive: endpointResult[0].isActive || false
            }
        } else if (webhookId) {
            console.log('🔍 Validating webhook:', webhookId)
            const webhookResult = await db
                .select()
                .from(webhooks)
                .where(and(
                    eq(webhooks.id, webhookId),
                    eq(webhooks.userId, userId)
                ))
                .limit(1)

            if (!webhookResult[0]) {
                console.log('❌ Webhook not found or access denied:', webhookId)
                return NextResponse.json({
                    error: 'Webhook not found or access denied'
                }, { status: 404 })
            }
            routingInfo = {
                type: 'webhook' as const,
                id: webhookResult[0].id,
                name: webhookResult[0].name,
                config: { url: webhookResult[0].url },
                isActive: webhookResult[0].isActive || false
            }
        }

        // Update email address
        console.log('📝 Updating email address record')
        const updateData: Partial<EmailAddress> = {
            updatedAt: new Date()
        }

        if (data.endpointId !== undefined) {
            updateData.endpointId = endpointId
            updateData.webhookId = null
        }
        if (data.webhookId !== undefined) {
            updateData.webhookId = webhookId
            updateData.endpointId = null
        }
        if (data.isActive !== undefined) {
            updateData.isActive = data.isActive
        }

        const [updatedEmailAddress] = await db
            .update(emailAddresses)
            .set(updateData)
            .where(eq(emailAddresses.id, id))
            .returning()

        console.log('✅ Email address updated successfully')

        // Note: We don't reconfigure SES rules on update since the email address itself doesn't change
        // The SES rules are configured at the domain level and will continue to work

        const response: PutEmailAddressByIdResponse = {
            id: updatedEmailAddress.id,
            address: updatedEmailAddress.address,
            domainId: updatedEmailAddress.domainId,
            webhookId: updatedEmailAddress.webhookId,
            endpointId: updatedEmailAddress.endpointId,
            isActive: updatedEmailAddress.isActive || false,
            isReceiptRuleConfigured: updatedEmailAddress.isReceiptRuleConfigured || false,
            receiptRuleName: updatedEmailAddress.receiptRuleName,
            createdAt: updatedEmailAddress.createdAt || new Date(),
            updatedAt: updatedEmailAddress.updatedAt || new Date(),
            userId: updatedEmailAddress.userId,
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
            }
        }

        console.log('✅ PUT /api/v2/email-addresses/[id] - Successfully updated email address')
        return NextResponse.json(response, { status: 200 })

    } catch (error) {
        console.error('❌ PUT /api/v2/email-addresses/[id] - Error:', error)
        return NextResponse.json(
            { 
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/v2/email-addresses/[id]
 * Deletes an email address and cleans up SES rules
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// DELETE /api/v2/email-addresses/[id] types
export interface DeleteEmailAddressByIdResponse {
    message: string
    cleanup: {
        sesRuleUpdated: boolean
        emailAddress: string
        domain: string
        warning?: string
    }
}

// Path parameter type for OpenAPI documentation
export interface EmailAddressIdParam {
    id: string // The ID of the email address
}

// Error response types for OpenAPI documentation
export interface NotFoundError {
    error: string
    code: 'NOT_FOUND'
    details?: string
}

/**
 * Delete an email address
 * @description Permanently delete an email address and update AWS SES receipt rules accordingly.
 * @pathParams EmailAddressIdParam
 * @response DeleteEmailAddressByIdResponse:Email address deleted successfully with cleanup details
 * @add 404:NotFoundError:Email address not found or doesn't belong to the user
 * @responseSet crud
 * @auth apikey
 * @tag Email Addresses
 * @openapi
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('🗑️ DELETE /api/v2/email-addresses/[id] - Starting request')
    
    try {
        const { id } = await params

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

        // Get email address with domain information
        console.log('🔍 Looking up email address:', id)
        const emailAddressResult = await db
            .select({
                id: emailAddresses.id,
                address: emailAddresses.address,
                domainId: emailAddresses.domainId,
                isReceiptRuleConfigured: emailAddresses.isReceiptRuleConfigured,
                receiptRuleName: emailAddresses.receiptRuleName,
                userId: emailAddresses.userId,
                domainName: emailDomains.domain,
            })
            .from(emailAddresses)
            .innerJoin(emailDomains, eq(emailAddresses.domainId, emailDomains.id))
            .where(and(
                eq(emailAddresses.id, id),
                eq(emailAddresses.userId, userId)
            ))
            .limit(1)

        if (!emailAddressResult[0]) {
            console.log('❌ Email address not found:', id)
            return NextResponse.json(
                { error: 'Email address not found' },
                { status: 404 }
            )
        }

        const emailAddress = emailAddressResult[0]
        console.log('✅ Found email address:', emailAddress.address)

        // Get all other email addresses for this domain (to update SES rules)
        console.log('🔍 Getting other email addresses for domain:', emailAddress.domainName)
        const otherEmailAddresses = await db
            .select({
                address: emailAddresses.address,
            })
            .from(emailAddresses)
            .where(and(
                eq(emailAddresses.domainId, emailAddress.domainId),
                eq(emailAddresses.userId, userId),
                eq(emailAddresses.isActive, true)
            ))

        const remainingEmailAddresses = otherEmailAddresses
            .filter(e => e.address !== emailAddress.address)
            .map(e => e.address)

        console.log('📊 Remaining email addresses after deletion:', remainingEmailAddresses.length)

        // Delete the email address
        console.log('🗑️ Deleting email address record')
        await db
            .delete(emailAddresses)
            .where(eq(emailAddresses.id, id))

        console.log('✅ Email address deleted from database')

        // Update SES rules if needed
        let sesRuleUpdated = false
        let awsWarning = null

        if (emailAddress.isReceiptRuleConfigured) {
            try {
                console.log('🔧 Updating SES receipt rules')
                const sesManager = new AWSSESReceiptRuleManager()
                
                // Get AWS configuration
                const awsRegion = process.env.AWS_REGION || 'us-east-2'
                const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
                const s3BucketName = process.env.S3_BUCKET_NAME
                const awsAccountId = process.env.AWS_ACCOUNT_ID

                if (!s3BucketName || !awsAccountId) {
                    awsWarning = 'AWS configuration incomplete. SES rules may need manual cleanup.'
                    console.warn(`⚠️ ${awsWarning}`)
                } else {
                    const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
                        lambdaFunctionName,
                        awsAccountId,
                        awsRegion
                    )

                    if (remainingEmailAddresses.length > 0) {
                        // Update SES rule with remaining email addresses
                        console.log('🔄 Updating SES rule with remaining email addresses')
                        const receiptResult = await sesManager.configureEmailReceiving({
                            domain: emailAddress.domainName,
                            emailAddresses: remainingEmailAddresses,
                            lambdaFunctionArn: lambdaArn,
                            s3BucketName
                        })
                        
                        if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
                            sesRuleUpdated = true
                            console.log('✅ SES rule updated successfully')
                        } else {
                            awsWarning = `SES rule update failed: ${receiptResult.error}`
                            console.warn(`⚠️ ${awsWarning}`)
                        }
                    } else {
                        // Delete SES rule if no email addresses remain
                        console.log('🗑️ Deleting SES rule (no remaining email addresses)')
                        try {
                            const deleteSuccess = await sesManager.removeEmailReceiving(emailAddress.domainName)
                            if (deleteSuccess) {
                                sesRuleUpdated = true
                                console.log('✅ SES rule deleted successfully')
                            } else {
                                awsWarning = 'SES rule deletion failed: Unable to remove receipt rule'
                                console.warn(`⚠️ ${awsWarning}`)
                            }
                        } catch (deleteError) {
                            awsWarning = `SES rule deletion failed: ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}`
                            console.warn(`⚠️ ${awsWarning}`)
                        }
                    }
                }
            } catch (error) {
                awsWarning = `SES rule update error: ${error instanceof Error ? error.message : 'Unknown error'}`
                console.error('❌ SES rule update failed:', error)
            }
        }

        const response: DeleteEmailAddressByIdResponse = {
            message: 'Email address deleted successfully',
            cleanup: {
                sesRuleUpdated,
                emailAddress: emailAddress.address,
                domain: emailAddress.domainName,
                ...(awsWarning && { warning: awsWarning })
            }
        }

        console.log('✅ DELETE /api/v2/email-addresses/[id] - Successfully deleted email address')
        return NextResponse.json(response, { status: 200 })

    } catch (error) {
        console.error('❌ DELETE /api/v2/email-addresses/[id] - Error:', error)
        return NextResponse.json(
            { 
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
} 
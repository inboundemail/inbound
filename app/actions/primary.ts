"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Autumn as autumn, Customer } from "autumn-js"
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, webhooks, sesEvents, structuredEmails, DOMAIN_STATUS } from '@/lib/db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses-rules'
import { parseEmail as libParseEmail } from '@/lib/email-parser'

// ============================================================================
// PAYMENTS AND BILLING VIA AUTUMN
// ============================================================================

export async function generateAutumnBillingPortal() {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session?.user?.id) {
        return { error: "Unauthorized" }
    }

    const { data: billingPortal, error } = await autumn.customers.billingPortal(
        session.user.id,
        {
            return_url: `${process.env.BETTER_AUTH_URL}/settings`
        }
    )

    if (error || !billingPortal?.url) {
        return { error: "Failed to create billing portal session" }
    }

    return { url: billingPortal.url }
}

export async function getAutumnCustomer() {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session?.user?.id) {
        return { error: "Unauthorized" }
    }

    const { data: customer, error } = await autumn.customers.get(session.user.id)

    if (error || !customer) {
        return { error: "Failed to fetch customer" }
    }

    return { customer: customer as Customer }
}

// ============================================================================
// EMAIL ADDRESS MANAGEMENT
// ============================================================================

export async function addEmailAddress(domainId: string, emailAddress: string, webhookId?: string, endpointId?: string) {
    try {
        // Get user session
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        console.log('📧 Creating email address:', { emailAddress, webhookId, endpointId, domainId })

        if (!domainId || !emailAddress) {
            return { error: 'Domain ID and email address are required' }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(emailAddress)) {
            return { error: 'Invalid email address format' }
        }

        // Validate endpoint or webhook (priority: endpointId > webhookId)
        if (endpointId) {
            const { endpoints } = await import('@/lib/db/schema')
            const endpointRecord = await db
                .select()
                .from(endpoints)
                .where(and(
                    eq(endpoints.id, endpointId),
                    eq(endpoints.userId, session.user.id)
                ))
                .limit(1)

            if (!endpointRecord[0]) {
                return { error: 'Endpoint not found or does not belong to user' }
            }

            if (!endpointRecord[0].isActive) {
                return { error: 'Selected endpoint is disabled' }
            }
        } else if (webhookId) {
            // Legacy webhook support for backward compatibility
            const webhookRecord = await db
                .select()
                .from(webhooks)
                .where(and(
                    eq(webhooks.id, webhookId),
                    eq(webhooks.userId, session.user.id)
                ))
                .limit(1)

            if (!webhookRecord[0]) {
                return { error: 'Webhook not found or does not belong to user' }
            }

            if (!webhookRecord[0].isActive) {
                return { error: 'Selected webhook is disabled' }
            }
        }

        // Get domain record
        const domainRecord = await db
            .select()
            .from(emailDomains)
            .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
            .limit(1)

        if (!domainRecord[0]) {
            return { error: 'Domain not found' }
        }

        const domain = domainRecord[0]

        // Check if domain is verified
        if (domain.status !== 'verified') {
            return { error: 'Domain must be fully verified before adding email addresses' }
        }

        // Check if email address already exists
        const existingEmail = await db
            .select()
            .from(emailAddresses)
            .where(eq(emailAddresses.address, emailAddress))
            .limit(1)

        if (existingEmail[0]) {
            return { error: 'Email address already exists' }
        }

        // Verify the email address belongs to this domain
        const emailDomain = emailAddress.split('@')[1]
        if (emailDomain !== domain.domain) {
            return { error: `Email address must belong to domain ${domain.domain}` }
        }

        // Create email address record
        const emailRecord = {
            id: nanoid(),
            address: emailAddress,
            domainId: domainId,
            webhookId: webhookId || null,
            endpointId: endpointId || null,
            userId: session.user.id,
            isActive: true,
            isReceiptRuleConfigured: false,
            updatedAt: new Date(),
        }

        const [createdEmail] = await db.insert(emailAddresses).values(emailRecord).returning()

        // Configure SES receipt rule for the new email
        try {
            const sesManager = new AWSSESReceiptRuleManager()
            
            // Get AWS configuration
            const awsRegion = process.env.AWS_REGION || 'us-east-2'
            const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
            const s3BucketName = process.env.S3_BUCKET_NAME
            const awsAccountId = process.env.AWS_ACCOUNT_ID

            if (!s3BucketName || !awsAccountId) {
                return {
                    success: true,
                    data: {
                        id: createdEmail.id,
                        address: createdEmail.address,
                        isActive: true,
                        isReceiptRuleConfigured: false,
                        receiptRuleName: null,
                        createdAt: createdEmail.createdAt,
                        emailsLast24h: 0,
                        warning: 'AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID'
                    }
                }
            }

            const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
                lambdaFunctionName,
                awsAccountId,
                awsRegion
            )

            const receiptResult = await sesManager.configureEmailReceiving({
                domain: domain.domain,
                emailAddresses: [emailAddress],
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
                    .where(eq(emailAddresses.id, createdEmail.id))

                return {
                    success: true,
                    data: {
                        id: createdEmail.id,
                        address: createdEmail.address,
                        isActive: true,
                        isReceiptRuleConfigured: true,
                        receiptRuleName: receiptResult.ruleName,
                        createdAt: createdEmail.createdAt,
                        emailsLast24h: 0
                    }
                }
            } else {
                // SES configuration failed, but email record was created
                return {
                    success: true,
                    data: {
                        id: createdEmail.id,
                        address: createdEmail.address,
                        isActive: true,
                        isReceiptRuleConfigured: false,
                        receiptRuleName: null,
                        createdAt: createdEmail.createdAt,
                        emailsLast24h: 0,
                        warning: 'Email address created but SES configuration failed'
                    }
                }
            }
        } catch (sesError) {
            console.error('SES configuration error:', sesError)
            return {
                success: true,
                data: {
                    id: createdEmail.id,
                    address: createdEmail.address,
                    isActive: true,
                    isReceiptRuleConfigured: false,
                    receiptRuleName: null,
                    createdAt: createdEmail.createdAt,
                    emailsLast24h: 0,
                    warning: 'Email address created but SES configuration failed'
                }
            }
        }

    } catch (error) {
        console.error('Error adding email address:', error)
        return { error: 'Failed to add email address' }
    }
}

export async function deleteEmailAddress(domainId: string, emailAddressId: string) {
    try {
        // Get user session
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        if (!domainId || !emailAddressId) {
            return { error: 'Domain ID and email address ID are required' }
        }

        // Get domain record
        const domainRecord = await db
            .select()
            .from(emailDomains)
            .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
            .limit(1)

        if (!domainRecord[0]) {
            return { error: 'Domain not found' }
        }

        // Get email address record
        const emailRecord = await db
            .select()
            .from(emailAddresses)
            .where(and(
                eq(emailAddresses.id, emailAddressId),
                eq(emailAddresses.domainId, domainId),
                eq(emailAddresses.userId, session.user.id)
            ))
            .limit(1)

        if (!emailRecord[0]) {
            return { error: 'Email address not found' }
        }

        // Delete the email address record
        await db
            .delete(emailAddresses)
            .where(eq(emailAddresses.id, emailAddressId))

        // Note: We don't remove the SES receipt rule here as it might be shared
        // with other email addresses. The SES rules should be managed separately.

        return {
            success: true,
            message: 'Email address deleted successfully'
        }

    } catch (error) {
        console.error('Error deleting email address:', error)
        return { error: 'Failed to delete email address' }
    }
}

export async function getEmailAddresses(domainId: string) {
    try {
        // Get user session
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        if (!domainId) {
            return { error: 'Domain ID is required' }
        }

        // Get domain record to verify ownership
        const domainRecord = await db
            .select()
            .from(emailDomains)
            .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
            .limit(1)

        if (!domainRecord[0]) {
            return { error: 'Domain not found' }
        }

        // Get all email addresses for this domain
        const emailAddressList = await db
            .select()
            .from(emailAddresses)
            .where(and(
                eq(emailAddresses.domainId, domainId),
                eq(emailAddresses.userId, session.user.id)
            ))

        return {
            success: true,
            data: emailAddressList
        }

    } catch (error) {
        console.error('Error fetching email addresses:', error)
        return { error: 'Failed to fetch email addresses' }
    }
}

export async function updateEmailWebhook(domainId: string, emailId: string, webhookId?: string, endpointId?: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        console.log('🔗 Updating endpoint assignment:', { emailId, webhookId, endpointId, domainId })

        // Get domain record to verify ownership
        const domainRecord = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, domainId),
                eq(emailDomains.userId, session.user.id)
            ))
            .limit(1)

        if (!domainRecord[0]) {
            return { error: 'Domain not found' }
        }

        // Get email address record to verify it exists and belongs to user
        const emailRecord = await db
            .select()
            .from(emailAddresses)
            .where(and(
                eq(emailAddresses.id, emailId),
                eq(emailAddresses.domainId, domainId),
                eq(emailAddresses.userId, session.user.id)
            ))
            .limit(1)

        if (!emailRecord[0]) {
            return { error: 'Email address not found' }
        }

        // Validate endpoint or webhook (priority: endpointId > webhookId)
        if (endpointId) {
            const { endpoints } = await import('@/lib/db/schema')
            const endpointRecord = await db
                .select()
                .from(endpoints)
                .where(and(
                    eq(endpoints.id, endpointId),
                    eq(endpoints.userId, session.user.id)
                ))
                .limit(1)

            if (!endpointRecord[0]) {
                return { error: 'Endpoint not found or does not belong to user' }
            }

            if (!endpointRecord[0].isActive) {
                return { error: 'Selected endpoint is disabled' }
            }
        } else if (webhookId) {
            // Legacy webhook support for backward compatibility
            const webhookRecord = await db
                .select()
                .from(webhooks)
                .where(and(
                    eq(webhooks.id, webhookId),
                    eq(webhooks.userId, session.user.id)
                ))
                .limit(1)

            if (!webhookRecord[0]) {
                return { error: 'Webhook not found or does not belong to user' }
            }

            if (!webhookRecord[0].isActive) {
                return { error: 'Selected webhook is disabled' }
            }
        }

        // Update the email address with the new endpoint/webhook assignment
        const [updatedEmail] = await db
            .update(emailAddresses)
            .set({
                endpointId: endpointId || null,
                webhookId: webhookId || null,
                updatedAt: new Date()
            })
            .where(and(
                eq(emailAddresses.id, emailId),
                eq(emailAddresses.userId, session.user.id)
            ))
            .returning()

        return {
            success: true,
            data: updatedEmail,
            message: endpointId 
                ? 'Endpoint assigned successfully' 
                : webhookId 
                ? 'Webhook assigned successfully' 
                : 'Assignment removed successfully'
        }

    } catch (error) {
        console.error('Error updating endpoint assignment:', error)
        return { error: 'Failed to update endpoint assignment' }
    }
}

// ============================================================================
// CATCH-ALL DOMAIN MANAGEMENT
// ============================================================================

export async function enableDomainCatchAll(domainId: string, webhookId?: string, endpointId?: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        console.log('🌐 Enabling catch-all for domain:', { domainId, webhookId, endpointId })

        if (!domainId || (!webhookId && !endpointId)) {
            return { error: 'Domain ID and either webhook ID or endpoint ID are required' }
        }

        // Get domain record to verify ownership
        const domainRecord = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, domainId),
                eq(emailDomains.userId, session.user.id)
            ))
            .limit(1)

        if (!domainRecord[0]) {
            return { error: 'Domain not found' }
        }

        const domain = domainRecord[0]

        // Check if domain is verified
        if (domain.status !== 'verified') {
            return { error: 'Domain must be fully verified before enabling catch-all' }
        }

        // Validate endpoint or webhook (priority: endpointId > webhookId)
        let targetWebhookId = null
        let targetEndpointId = null

        if (endpointId) {
            const { endpoints } = await import('@/lib/db/schema')
            const endpointRecord = await db
                .select()
                .from(endpoints)
                .where(and(
                    eq(endpoints.id, endpointId),
                    eq(endpoints.userId, session.user.id)
                ))
                .limit(1)

            if (!endpointRecord[0]) {
                return { error: 'Endpoint not found or does not belong to user' }
            }

            if (!endpointRecord[0].isActive) {
                return { error: 'Selected endpoint is disabled' }
            }

            targetEndpointId = endpointId
        } else if (webhookId) {
            // Legacy webhook support for backward compatibility
            const webhookRecord = await db
                .select()
                .from(webhooks)
                .where(and(
                    eq(webhooks.id, webhookId),
                    eq(webhooks.userId, session.user.id)
                ))
                .limit(1)

            if (!webhookRecord[0]) {
                return { error: 'Webhook not found or does not belong to user' }
            }

            if (!webhookRecord[0].isActive) {
                return { error: 'Selected webhook is disabled' }
            }

            targetWebhookId = webhookId
        }

        // Configure SES catch-all receipt rule
        try {
            const sesManager = new AWSSESReceiptRuleManager()
            
            // Get AWS configuration
            const awsRegion = process.env.AWS_REGION || 'us-east-2'
            const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
            const s3BucketName = process.env.S3_BUCKET_NAME
            const awsAccountId = process.env.AWS_ACCOUNT_ID

            if (!s3BucketName || !awsAccountId) {
                return {
                    error: 'AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID'
                }
            }

            const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
                lambdaFunctionName,
                awsAccountId,
                awsRegion
            )

            const receiptResult = await sesManager.configureCatchAllDomain({
                domain: domain.domain,
                webhookId: targetWebhookId || 'endpoint-based',
                lambdaFunctionArn: lambdaArn,
                s3BucketName
            })
            
            if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
                // Update domain record with catch-all configuration
                const [updatedDomain] = await db
                    .update(emailDomains)
                    .set({
                        isCatchAllEnabled: true,
                        catchAllWebhookId: targetWebhookId,
                        catchAllEndpointId: targetEndpointId,
                        catchAllReceiptRuleName: receiptResult.ruleName,
                        updatedAt: new Date(),
                    })
                    .where(eq(emailDomains.id, domainId))
                    .returning()

                return {
                    success: true,
                    data: {
                        domain: updatedDomain.domain,
                        isCatchAllEnabled: true,
                        catchAllWebhookId: targetWebhookId,
                        catchAllEndpointId: targetEndpointId,
                        receiptRuleName: receiptResult.ruleName,
                        webhookUrl: targetWebhookId ? 'legacy-webhook' : 'endpoint-based'
                    },
                    message: 'Catch-all enabled successfully'
                }
            } else {
                return {
                    error: 'Failed to configure SES catch-all rule',
                    details: receiptResult.error
                }
            }
        } catch (sesError) {
            console.error('SES catch-all configuration error:', sesError)
            return {
                error: 'Failed to configure SES catch-all rule',
                details: sesError instanceof Error ? sesError.message : 'Unknown SES error'
            }
        }

    } catch (error) {
        console.error('Error enabling domain catch-all:', error)
        return { error: 'Failed to enable catch-all for domain' }
    }
}

export async function disableDomainCatchAll(domainId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        console.log('🚫 Disabling catch-all for domain:', { domainId })

        if (!domainId) {
            return { error: 'Domain ID is required' }
        }

        // Get domain record to verify ownership
        const domainRecord = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, domainId),
                eq(emailDomains.userId, session.user.id)
            ))
            .limit(1)

        if (!domainRecord[0]) {
            return { error: 'Domain not found' }
        }

        const domain = domainRecord[0]

        // Check if catch-all is currently enabled
        if (!domain.isCatchAllEnabled) {
            return { error: 'Catch-all is not currently enabled for this domain' }
        }

        // Get existing email addresses for this domain to restore them
        const existingEmails = await db
            .select()
            .from(emailAddresses)
            .where(and(
                eq(emailAddresses.domainId, domainId),
                eq(emailAddresses.userId, session.user.id),
                eq(emailAddresses.isActive, true)
            ))

        // Remove SES catch-all receipt rule and restore individual rules
        try {
            const sesManager = new AWSSESReceiptRuleManager()
            
            // Remove catch-all rule
            const ruleRemoved = await sesManager.removeCatchAllDomain(domain.domain)

            if (ruleRemoved) {
                // Restore individual email rules if there are existing email addresses
                if (existingEmails.length > 0) {
                    const awsRegion = process.env.AWS_REGION || 'us-east-2'
                    const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
                    const s3BucketName = process.env.S3_BUCKET_NAME
                    const awsAccountId = process.env.AWS_ACCOUNT_ID

                    if (s3BucketName && awsAccountId) {
                        const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
                            lambdaFunctionName,
                            awsAccountId,
                            awsRegion
                        )

                        const emailAddressList = existingEmails.map(email => email.address)
                        
                        const restoreResult = await sesManager.restoreIndividualEmailRules(
                            domain.domain,
                            emailAddressList,
                            lambdaArn,
                            s3BucketName
                        )

                        if (restoreResult.status === 'created') {
                            console.log(`✅ Restored individual email rules for ${existingEmails.length} addresses`)
                        } else {
                            console.warn(`⚠️ Failed to restore individual email rules: ${restoreResult.error}`)
                        }
                    }
                }

                // Update domain record to disable catch-all
                const [updatedDomain] = await db
                    .update(emailDomains)
                    .set({
                        isCatchAllEnabled: false,
                        catchAllWebhookId: null,
                        catchAllEndpointId: null,
                        catchAllReceiptRuleName: null,
                        updatedAt: new Date(),
                    })
                    .where(eq(emailDomains.id, domainId))
                    .returning()

                return {
                    success: true,
                    data: {
                        domain: updatedDomain.domain,
                        isCatchAllEnabled: false,
                        restoredEmailCount: existingEmails.length
                    },
                    message: `Catch-all disabled successfully${existingEmails.length > 0 ? ` and restored ${existingEmails.length} individual email addresses` : ''}`
                }
            } else {
                return {
                    error: 'Failed to remove SES catch-all rule'
                }
            }
        } catch (sesError) {
            console.error('SES catch-all removal error:', sesError)
            return {
                error: 'Failed to remove SES catch-all rule',
                details: sesError instanceof Error ? sesError.message : 'Unknown SES error'
            }
        }

    } catch (error) {
        console.error('Error disabling domain catch-all:', error)
        return { error: 'Failed to disable catch-all for domain' }
    }
}

export async function getDomainCatchAllStatus(domainId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        if (!domainId) {
            return { error: 'Domain ID is required' }
        }

        // Get domain record with catch-all configuration
        const domainRecord = await db
            .select({
                id: emailDomains.id,
                domain: emailDomains.domain,
                status: emailDomains.status,
                isCatchAllEnabled: emailDomains.isCatchAllEnabled,
                catchAllWebhookId: emailDomains.catchAllWebhookId,
                catchAllEndpointId: emailDomains.catchAllEndpointId,
                catchAllReceiptRuleName: emailDomains.catchAllReceiptRuleName
            })
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, domainId),
                eq(emailDomains.userId, session.user.id)
            ))
            .limit(1)

        if (!domainRecord[0]) {
            return { error: 'Domain not found' }
        }

        const domain = domainRecord[0]

        // If catch-all is enabled, get webhook or endpoint details
        let webhookDetails = null
        let endpointDetails = null
        
        if (domain.isCatchAllEnabled) {
            if (domain.catchAllEndpointId) {
                // New endpoints system
                const { endpoints } = await import('@/lib/db/schema')
                const endpointRecord = await db
                    .select({
                        id: endpoints.id,
                        name: endpoints.name,
                        type: endpoints.type,
                        isActive: endpoints.isActive
                    })
                    .from(endpoints)
                    .where(eq(endpoints.id, domain.catchAllEndpointId))
                    .limit(1)

                endpointDetails = endpointRecord[0] || null
            } else if (domain.catchAllWebhookId) {
                // Legacy webhook system
                const webhookRecord = await db
                    .select({
                        id: webhooks.id,
                        name: webhooks.name,
                        url: webhooks.url,
                        isActive: webhooks.isActive
                    })
                    .from(webhooks)
                    .where(eq(webhooks.id, domain.catchAllWebhookId))
                    .limit(1)

                webhookDetails = webhookRecord[0] || null
            }
        }

        return {
            success: true,
            data: {
                domain: domain.domain,
                domainStatus: domain.status,
                isCatchAllEnabled: domain.isCatchAllEnabled,
                catchAllWebhookId: domain.catchAllWebhookId,
                catchAllEndpointId: domain.catchAllEndpointId,
                receiptRuleName: domain.catchAllReceiptRuleName,
                webhook: webhookDetails,
                endpoint: endpointDetails
            }
        }

    } catch (error) {
        console.error('Error fetching domain catch-all status:', error)
        return { error: 'Failed to fetch catch-all status' }
    }
}

// ============================================================================
// DOMAIN STATUS
// ============================================================================

export async function getDomainStats() {
    try {
        // Get user session
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        // Check user's domain limits
        const { data: domainLimits, error: limitsError } = await autumn.check({
            customer_id: session.user.id,
            feature_id: "domains",
        })

        if (limitsError) {
            console.error('Failed to check domain limits:', limitsError)
        }

        // Calculate 24 hours ago
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

        // Get domains with aggregated data using a single optimized query
        const domainsWithStats = await db
            .select({
                id: emailDomains.id,
                domain: emailDomains.domain,
                status: emailDomains.status,
                canReceiveEmails: emailDomains.canReceiveEmails,
                createdAt: emailDomains.createdAt,
                updatedAt: emailDomains.updatedAt,
                emailAddressCount: sql<number>`COALESCE(${sql`(
                    SELECT COUNT(*)::int 
                    FROM ${emailAddresses} 
                    WHERE ${emailAddresses.domainId} = ${emailDomains.id} 
                    AND ${emailAddresses.isActive} = true
                )`}, 0)`,
                emailsLast24h: sql<number>`COALESCE(${sql`(
                    SELECT COUNT(*)::int 
                    FROM ${sesEvents} 
                    WHERE EXISTS (
                        SELECT 1 
                        FROM jsonb_array_elements_text(${sesEvents.destination}::jsonb) AS dest_email
                        WHERE dest_email LIKE '%@' || ${emailDomains.domain}
                    )
                    AND ${sesEvents.timestamp} >= ${twentyFourHoursAgo}
                )`}, 0)`
            })
            .from(emailDomains)
            .where(eq(emailDomains.userId, session.user.id))
            .orderBy(emailDomains.createdAt)

        // Transform the data for the frontend
        const transformedDomains = domainsWithStats.map(domain => ({
            id: domain.id,
            domain: domain.domain,
            status: domain.status,
            isVerified: domain.status === DOMAIN_STATUS.VERIFIED && (domain.canReceiveEmails || false),
            emailAddressCount: domain.emailAddressCount,
            emailsLast24h: domain.emailsLast24h,
            createdAt: domain.createdAt?.toISOString() || '',
            updatedAt: domain.updatedAt?.toISOString() || ''
        }))

        return {
            domains: transformedDomains,
            totalDomains: transformedDomains.length,
            verifiedDomains: transformedDomains.filter(d => d.isVerified).length,
            totalEmailAddresses: transformedDomains.reduce((sum, d) => sum + d.emailAddressCount, 0),
            totalEmailsLast24h: transformedDomains.reduce((sum, d) => sum + d.emailsLast24h, 0),
            limits: domainLimits ? {
                allowed: domainLimits.allowed,
                unlimited: domainLimits.unlimited || false,
                balance: domainLimits.balance || null,
                current: transformedDomains.length,
                remaining: (domainLimits.unlimited || false) ? null : Math.max(0, (domainLimits.balance || 0) - transformedDomains.length)
            } : null
        }

    } catch (error) {
        console.error('Error fetching domain stats:', error)
        return { error: 'Failed to fetch domain statistics' }
    }
}

export async function syncDomainsWithAWS() {
    try {
        // Get user session
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        const userId = session.user.id

        // Get all domains for the user
        const userDomains = await db
            .select({
                id: emailDomains.id,
                domain: emailDomains.domain,
                status: emailDomains.status,
                canReceiveEmails: emailDomains.canReceiveEmails
            })
            .from(emailDomains)
            .where(eq(emailDomains.userId, userId))

        if (userDomains.length === 0) {
            return {
                success: true,
                message: 'No domains found for user',
                synced: 0
            }
        }

        // Import AWS SES client dynamically to avoid issues if AWS SDK is not available
        try {
            const { SESClient, GetIdentityVerificationAttributesCommand } = await import('@aws-sdk/client-ses')
            
            const sesClient = new SESClient({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
                },
            })

            // Get verification status from AWS SES
            const domainNames = userDomains.map(d => d.domain)
            const sesCommand = new GetIdentityVerificationAttributesCommand({
                Identities: domainNames
            })

            const sesResponse = await sesClient.send(sesCommand)
            const verificationAttributes = sesResponse.VerificationAttributes || {}

            let syncedCount = 0
            const syncResults = []

            // Update each domain based on SES status
            for (const domain of userDomains) {
                const sesStatus = verificationAttributes[domain.domain]
                
                if (sesStatus) {
                    const isVerified = sesStatus.VerificationStatus === 'Success'

                    const newStatus = isVerified ? DOMAIN_STATUS.VERIFIED : domain.status
                    const canReceiveEmails = isVerified

                    // Update the domain if there are changes
                    if (
                        domain.status !== newStatus ||
                        domain.canReceiveEmails !== canReceiveEmails
                    ) {
                        await db
                            .update(emailDomains)
                            .set({
                                canReceiveEmails,
                                status: newStatus,
                                lastSesCheck: new Date(),
                                updatedAt: new Date()
                            })
                            .where(eq(emailDomains.id, domain.id))

                        syncedCount++
                        syncResults.push({
                            domain: domain.domain,
                            oldStatus: domain.status,
                            newStatus: newStatus,
                            canReceiveEmails,
                            updated: true
                        })
                    } else {
                        syncResults.push({
                            domain: domain.domain,
                            status: domain.status,
                            canReceiveEmails: domain.canReceiveEmails,
                            updated: false
                        })
                    }
                }
            }

            return {
                success: true,
                message: `Synced ${syncedCount} domains with AWS SES`,
                synced: syncedCount,
                total: userDomains.length,
                results: syncResults
            }

        } catch (awsError) {
            console.error('AWS SES sync error:', awsError)
            return {
                error: 'Failed to sync with AWS SES',
                details: awsError instanceof Error ? awsError.message : 'Unknown AWS error'
            }
        }

    } catch (error) {
        console.error('Domain sync error:', error)
        return { error: 'Failed to sync domains with AWS SES' }
    }
}

// ============================================================================
// EMAIL MANAGEMENT
// ============================================================================

export async function getEmailDetails(emailId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        if (!emailId) {
            return { error: 'Email ID is required' }
        }

        // Fetch email details with SES event data
        const emailDetails = await db
            .select({
                // Structured email details
                id: structuredEmails.id,
                emailId: structuredEmails.emailId,
                messageId: structuredEmails.messageId,
                subject: structuredEmails.subject,
                date: structuredEmails.date,
                fromData: structuredEmails.fromData,
                toData: structuredEmails.toData,
                ccData: structuredEmails.ccData,
                bccData: structuredEmails.bccData,
                replyToData: structuredEmails.replyToData,
                inReplyTo: structuredEmails.inReplyTo,
                references: structuredEmails.references,
                textBody: structuredEmails.textBody,
                htmlBody: structuredEmails.htmlBody,
                rawContent: structuredEmails.rawContent,
                attachments: structuredEmails.attachments,
                headers: structuredEmails.headers,
                priority: structuredEmails.priority,
                parseSuccess: structuredEmails.parseSuccess,
                parseError: structuredEmails.parseError,
                userId: structuredEmails.userId,
                sesEventId: structuredEmails.sesEventId,
                createdAt: structuredEmails.createdAt,
                updatedAt: structuredEmails.updatedAt,
                
                // SES event details
                emailContent: sesEvents.emailContent,
                spamVerdict: sesEvents.spamVerdict,
                virusVerdict: sesEvents.virusVerdict,
                spfVerdict: sesEvents.spfVerdict,
                dkimVerdict: sesEvents.dkimVerdict,
                dmarcVerdict: sesEvents.dmarcVerdict,
                actionType: sesEvents.actionType,
                s3BucketName: sesEvents.s3BucketName,
                s3ObjectKey: sesEvents.s3ObjectKey,
                s3ContentFetched: sesEvents.s3ContentFetched,
                s3ContentSize: sesEvents.s3ContentSize,
                s3Error: sesEvents.s3Error,
                commonHeaders: sesEvents.commonHeaders,
                processingTimeMillis: sesEvents.processingTimeMillis,
                timestamp: sesEvents.timestamp,
                receiptTimestamp: sesEvents.receiptTimestamp,
            })
            .from(structuredEmails)
            .leftJoin(sesEvents, eq(structuredEmails.sesEventId, sesEvents.id))
            .where(
                and(
                    eq(structuredEmails.id, emailId),
                    eq(structuredEmails.userId, session.user.id)
                )
            )
            .limit(1)

        if (emailDetails.length === 0) {
            return { error: 'Email not found' }
        }

        const email = emailDetails[0]

        // Parse JSON fields from structured emails
        let parsedFromData = null
        if (email.fromData) {
            try {
                parsedFromData = JSON.parse(email.fromData)
            } catch (e) {
                console.error('Failed to parse fromData:', e)
            }
        }

        let parsedToData = null
        if (email.toData) {
            try {
                parsedToData = JSON.parse(email.toData)
            } catch (e) {
                console.error('Failed to parse toData:', e)
            }
        }

        let parsedAttachments = []
        if (email.attachments) {
            try {
                parsedAttachments = JSON.parse(email.attachments)
            } catch (e) {
                console.error('Failed to parse attachments:', e)
            }
        }

        let parsedHeaders = {}
        if (email.headers) {
            try {
                parsedHeaders = JSON.parse(email.headers)
            } catch (e) {
                console.error('Failed to parse headers:', e)
            }
        }

        let parsedReferences = []
        if (email.references) {
            try {
                parsedReferences = JSON.parse(email.references)
            } catch (e) {
                console.error('Failed to parse references:', e)
            }
        }

        // Parse common headers if available
        let parsedCommonHeaders = null
        if (email.commonHeaders) {
            try {
                parsedCommonHeaders = JSON.parse(email.commonHeaders)
            } catch (e) {
                console.error('Failed to parse common headers:', e)
            }
        }

        // Sanitize HTML content
        const { sanitizeHtml } = await import('@/lib/email-parser')
        const sanitizedHtmlBody = email.htmlBody ? sanitizeHtml(email.htmlBody) : null

        // Extract recipient from toData for backward compatibility
        const recipient = parsedToData?.addresses?.[0]?.address || 'unknown'
        const fromAddress = parsedFromData?.addresses?.[0]?.address || 'unknown'

        // Format the response
        const response = {
            id: email.id,
            emailId: email.emailId,
            messageId: email.messageId,
            from: fromAddress,
            to: parsedToData?.text || '',
            recipient: recipient,
            subject: email.subject,
            receivedAt: email.date,
            processedAt: email.createdAt, // Use createdAt as processedAt equivalent
            status: 'processed', // Default status since structuredEmails are processed
            emailContent: {
                htmlBody: sanitizedHtmlBody,
                textBody: email.textBody,
                attachments: parsedAttachments,
                headers: parsedHeaders,
                rawContent: email.rawContent,
            },
            parsedData: {
                fromData: parsedFromData,
                toData: parsedToData,
                ccData: email.ccData ? JSON.parse(email.ccData) : null,
                bccData: email.bccData ? JSON.parse(email.bccData) : null,
                replyToData: email.replyToData ? JSON.parse(email.replyToData) : null,
                inReplyTo: email.inReplyTo,
                references: parsedReferences,
                priority: email.priority,
                parseSuccess: email.parseSuccess,
                parseError: email.parseError,
            },
            authResults: {
                spf: email.spfVerdict || 'UNKNOWN',
                dkim: email.dkimVerdict || 'UNKNOWN',
                dmarc: email.dmarcVerdict || 'UNKNOWN',
                spam: email.spamVerdict || 'UNKNOWN',
                virus: email.virusVerdict || 'UNKNOWN',
            },
            metadata: {
                processingTime: email.processingTimeMillis,
                timestamp: email.timestamp,
                receiptTimestamp: email.receiptTimestamp,
                actionType: email.actionType,
                s3Info: {
                    bucketName: email.s3BucketName,
                    objectKey: email.s3ObjectKey,
                    contentFetched: email.s3ContentFetched,
                    contentSize: email.s3ContentSize,
                    error: email.s3Error,
                },
                commonHeaders: parsedCommonHeaders,
            },
            createdAt: email.createdAt,
            updatedAt: email.updatedAt,
        }

        return { success: true, data: response }
    } catch (error) {
        console.error('Error fetching email details:', error)
        return { error: 'Failed to fetch email details' }
    }
}

export async function getEmailDetailsFromParsed(emailId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        if (!emailId) {
            return { error: 'Email ID is required' }
        }

        // Fetch email details from structuredEmails table
        const emailDetails = await db
            .select({
                // Structured email details
                id: structuredEmails.id,
                emailId: structuredEmails.emailId,
                messageId: structuredEmails.messageId,
                subject: structuredEmails.subject,
                date: structuredEmails.date,
                fromData: structuredEmails.fromData,
                toData: structuredEmails.toData,
                ccData: structuredEmails.ccData,
                bccData: structuredEmails.bccData,
                replyToData: structuredEmails.replyToData,
                inReplyTo: structuredEmails.inReplyTo,
                references: structuredEmails.references,
                textBody: structuredEmails.textBody,
                htmlBody: structuredEmails.htmlBody,
                rawContent: structuredEmails.rawContent,
                attachments: structuredEmails.attachments,
                headers: structuredEmails.headers,
                priority: structuredEmails.priority,
                parseSuccess: structuredEmails.parseSuccess,
                parseError: structuredEmails.parseError,
                isRead: structuredEmails.isRead,
                readAt: structuredEmails.readAt,
                userId: structuredEmails.userId,
                createdAt: structuredEmails.createdAt,
                updatedAt: structuredEmails.updatedAt,
            })
            .from(structuredEmails)
            .where(
                and(
                    eq(structuredEmails.id, emailId),
                    eq(structuredEmails.userId, session.user.id)
                )
            )
            .limit(1)

        if (emailDetails.length === 0) {
            return { error: 'Email not found' }
        }

        const email = emailDetails[0]

        // Parse JSON fields from structured emails
        let parsedFromData = null
        if (email.fromData) {
            try {
                parsedFromData = JSON.parse(email.fromData)
            } catch (e) {
                console.error('Failed to parse fromData:', e)
            }
        }

        let parsedToData = null
        if (email.toData) {
            try {
                parsedToData = JSON.parse(email.toData)
            } catch (e) {
                console.error('Failed to parse toData:', e)
            }
        }

        let parsedAttachments = []
        if (email.attachments) {
            try {
                parsedAttachments = JSON.parse(email.attachments)
            } catch (e) {
                console.error('Failed to parse attachments:', e)
            }
        }

        let parsedHeaders = {}
        if (email.headers) {
            try {
                parsedHeaders = JSON.parse(email.headers)
            } catch (e) {
                console.error('Failed to parse headers:', e)
            }
        }

        let parsedReferences = []
        if (email.references) {
            try {
                parsedReferences = JSON.parse(email.references)
            } catch (e) {
                console.error('Failed to parse references:', e)
            }
        }

        // Sanitize HTML content
        const { sanitizeHtml } = await import('@/lib/email-parser')
        const sanitizedHtmlBody = email.htmlBody ? sanitizeHtml(email.htmlBody) : null

        // Extract recipient and from address for backward compatibility
        const recipient = parsedToData?.addresses?.[0]?.address || 'unknown'
        const fromAddress = parsedFromData?.addresses?.[0]?.address || 'unknown'

        // Format the response
        const response = {
            id: email.id,
            emailId: email.emailId,
            messageId: email.messageId,
            from: fromAddress,
            to: parsedToData?.text || '',
            recipient: recipient,
            subject: email.subject,
            receivedAt: email.date,
            processedAt: email.createdAt, // Use createdAt as processedAt equivalent
            status: 'processed', // Default status since structuredEmails are processed
            isRead: email.isRead || false,
            readAt: email.readAt,
            emailContent: {
                htmlBody: sanitizedHtmlBody,
                textBody: email.textBody,
                attachments: parsedAttachments,
                headers: parsedHeaders,
            },
            parsedData: {
                fromData: parsedFromData,
                toData: parsedToData,
                ccData: email.ccData ? JSON.parse(email.ccData) : null,
                bccData: email.bccData ? JSON.parse(email.bccData) : null,
                replyToData: email.replyToData ? JSON.parse(email.replyToData) : null,
                subject: email.subject,
                emailDate: email.date,
                inReplyTo: email.inReplyTo,
                references: parsedReferences,
                priority: email.priority,
                attachmentCount: parsedAttachments.length,
                hasAttachments: parsedAttachments.length > 0,
                hasTextBody: !!email.textBody,
                hasHtmlBody: !!email.htmlBody,
                parseSuccess: email.parseSuccess,
                parseError: email.parseError,
            },
            createdAt: email.createdAt,
            updatedAt: email.updatedAt,
        }

        return { success: true, data: response }
    } catch (error) {
        console.error('Error fetching email details from parsed:', error)
        return { error: 'Failed to fetch email details' }
    }
}

export async function getEmailsList(options?: {
    limit?: number
    offset?: number
    searchQuery?: string
    statusFilter?: string
    domainFilter?: string
}) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        const {
            limit = 50,
            offset = 0,
            searchQuery = '',
            statusFilter = 'all',
            domainFilter = 'all'
        } = options || {}

        // Build where conditions
        let whereConditions = [eq(structuredEmails.userId, session.user.id)]

        // Add status filter - since structuredEmails are all processed, we'll ignore this filter
        // or we could add a parseSuccess filter instead
        if (statusFilter !== 'all' && statusFilter === 'failed') {
            whereConditions.push(eq(structuredEmails.parseSuccess, false))
        } else if (statusFilter !== 'all' && statusFilter === 'processed') {
            whereConditions.push(eq(structuredEmails.parseSuccess, true))
        }

        // Add domain filter - extract domain from toData JSON
        if (domainFilter !== 'all') {
            whereConditions.push(
                sql`${structuredEmails.toData}::jsonb->'addresses'->0->>'address' LIKE ${`%@${domainFilter}`}`
            )
        }

        // Add search filter
        if (searchQuery) {
            whereConditions.push(
                sql`(
                    ${structuredEmails.subject} ILIKE ${`%${searchQuery}%`} OR
                    ${structuredEmails.messageId} ILIKE ${`%${searchQuery}%`} OR
                    ${structuredEmails.fromData}::text ILIKE ${`%${searchQuery}%`} OR
                    ${structuredEmails.toData}::text ILIKE ${`%${searchQuery}%`}
                )`
            )
        }

        // Fetch emails from structuredEmails
        const emailsList = await db
            .select({
                // Structured email info
                id: structuredEmails.id,
                emailId: structuredEmails.emailId,
                messageId: structuredEmails.messageId,
                subject: structuredEmails.subject,
                date: structuredEmails.date,
                fromData: structuredEmails.fromData,
                toData: structuredEmails.toData,
                attachments: structuredEmails.attachments,
                parseSuccess: structuredEmails.parseSuccess,
                parseError: structuredEmails.parseError,
                createdAt: structuredEmails.createdAt,
                isRead: structuredEmails.isRead,
                readAt: structuredEmails.readAt,
            })
            .from(structuredEmails)
            .where(and(...whereConditions))
            .orderBy(desc(structuredEmails.date))
            .limit(limit)
            .offset(offset)

        // Get total count for pagination
        const totalCountResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(structuredEmails)
            .where(and(...whereConditions))

        const totalCount = totalCountResult[0]?.count || 0

        // Get unread count for the user (regardless of filters)
        const unreadCountResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(structuredEmails)
            .where(and(
                eq(structuredEmails.userId, session.user.id),
                eq(structuredEmails.isRead, false)
            ))

        const unreadCount = unreadCountResult[0]?.count || 0

        // Get unique domains for filter options - extract from toData JSON
        const uniqueDomainsResult = await db
            .select({
                domain: sql<string>`DISTINCT SPLIT_PART(${structuredEmails.toData}::jsonb->'addresses'->0->>'address', '@', 2)`
            })
            .from(structuredEmails)
            .where(eq(structuredEmails.userId, session.user.id))
            .orderBy(sql`SPLIT_PART(${structuredEmails.toData}::jsonb->'addresses'->0->>'address', '@', 2)`)

        const uniqueDomains = uniqueDomainsResult.map(row => row.domain).filter(Boolean)

        // Format the emails
        const formattedEmails = emailsList.map(email => {
            // Parse JSON fields for display
            let parsedFromData = null
            let parsedToData = null
            let parsedAttachments = []

            try {
                if (email.fromData) parsedFromData = JSON.parse(email.fromData)
                if (email.toData) parsedToData = JSON.parse(email.toData)
                if (email.attachments) parsedAttachments = JSON.parse(email.attachments)
            } catch (e) {
                console.error('Failed to parse email data for display:', e)
            }

            const fromAddress = parsedFromData?.addresses?.[0]?.address || 'unknown'
            const recipient = parsedToData?.addresses?.[0]?.address || 'unknown'
            const domain = recipient.split('@')[1] || ''

            return {
                id: email.id,
                emailId: email.emailId,
                messageId: email.messageId,
                from: fromAddress,
                recipient: recipient,
                subject: email.subject || 'No Subject',
                receivedAt: email.date?.toISOString() || email.createdAt?.toISOString(),
                status: email.parseSuccess ? 'processed' : 'failed',
                domain: domain,
                isRead: email.isRead || false,
                readAt: email.readAt?.toISOString() || null,
                parsedData: {
                    fromData: parsedFromData,
                    toData: parsedToData,
                    subject: email.subject,
                    attachmentCount: parsedAttachments.length,
                    hasAttachments: parsedAttachments.length > 0,
                    emailDate: email.date?.toISOString(),
                    parseSuccess: email.parseSuccess,
                    parseError: email.parseError,
                }
            }
        })

        return {
            success: true,
            data: {
                emails: formattedEmails,
                pagination: {
                    total: totalCount,
                    limit,
                    offset,
                    hasMore: offset + limit < totalCount
                },
                filters: {
                    uniqueDomains
                },
                unreadCount: unreadCount
            }
        }
    } catch (error) {
        console.error('Error fetching emails list:', error)
        return { error: 'Failed to fetch emails list' }
    }
}

export async function markEmailAsRead(emailId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        if (!emailId) {
            return { error: 'Email ID is required' }
        }

        // Update the email to mark it as read
        const updatedEmails = await db
            .update(structuredEmails)
            .set({
                isRead: true,
                readAt: new Date(),
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(structuredEmails.id, emailId),
                    eq(structuredEmails.userId, session.user.id)
                )
            )
            .returning({ id: structuredEmails.id })

        if (updatedEmails.length === 0) {
            return { error: 'Email not found or access denied' }
        }

        return { 
            success: true, 
            message: 'Email marked as read',
            data: { id: emailId }
        }
    } catch (error) {
        console.error('Error marking email as read:', error)
        return { error: 'Failed to mark email as read' }
    }
}

export async function markAllEmailsAsRead() {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        // Update all unread emails for the user
        const updatedEmails = await db
            .update(structuredEmails)
            .set({
                isRead: true,
                readAt: new Date(),
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(structuredEmails.userId, session.user.id),
                    eq(structuredEmails.isRead, false)
                )
            )
            .returning({ id: structuredEmails.id })

        return { 
            success: true, 
            message: `Marked ${updatedEmails.length} emails as read`,
            data: { count: updatedEmails.length }
        }
    } catch (error) {
        console.error('Error marking all emails as read:', error)
        return { error: 'Failed to mark all emails as read' }
    }
}

// ============================================================================
// EMAIL PARSING
// ============================================================================

export async function parseEmail(emailContent: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        if (!emailContent) {
            return { error: 'Email content is required' }
        }

        // Use the lib version of parseEmail
        const emailData = await libParseEmail(emailContent);
        
        // Output parsed email data as JSON
        console.log('📧 Parsed Email Data:', JSON.stringify(emailData, null, 2));
        
        // Return the full parsed data for programmatic use
        return {
            success: true,
            data: emailData
        };
        
    } catch (error) {
        console.error('Error parsing email:', error);
        return { 
            error: 'Failed to parse email',
            details: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}


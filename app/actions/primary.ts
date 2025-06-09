"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Autumn as autumn, Customer } from "autumn-js"
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, webhooks, sesEvents, receivedEmails, DOMAIN_STATUS } from '@/lib/db/schema'
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

export async function addEmailAddress(domainId: string, emailAddress: string, webhookId?: string) {
    try {
        // Get user session
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        console.log('📧 Creating email address:', { emailAddress, webhookId, domainId })

        if (!domainId || !emailAddress) {
            return { error: 'Domain ID and email address are required' }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(emailAddress)) {
            return { error: 'Invalid email address format' }
        }

        // If webhookId is provided, verify it exists and belongs to the user
        if (webhookId) {
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

export async function updateEmailWebhook(domainId: string, emailId: string, webhookId?: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        console.log('🔗 Updating webhook assignment:', { emailId, webhookId, domainId })

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

        // If webhookId is provided, verify it exists and belongs to the user
        if (webhookId) {
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

        // Update the email address with the new webhook assignment
        const [updatedEmail] = await db
            .update(emailAddresses)
            .set({
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
            message: webhookId 
                ? 'Webhook assigned successfully' 
                : 'Webhook removed successfully'
        }

    } catch (error) {
        console.error('Error updating webhook assignment:', error)
        return { error: 'Failed to update webhook assignment' }
    }
}

// ============================================================================
// CATCH-ALL DOMAIN MANAGEMENT
// ============================================================================

export async function enableDomainCatchAll(domainId: string, webhookId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user?.id) {
            return { error: 'Unauthorized' }
        }

        console.log('🌐 Enabling catch-all for domain:', { domainId, webhookId })

        if (!domainId || !webhookId) {
            return { error: 'Domain ID and webhook ID are required' }
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

        // Verify webhook exists and belongs to the user
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
                webhookId: webhookId,
                lambdaFunctionArn: lambdaArn,
                s3BucketName
            })
            
            if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
                // Update domain record with catch-all configuration
                const [updatedDomain] = await db
                    .update(emailDomains)
                    .set({
                        isCatchAllEnabled: true,
                        catchAllWebhookId: webhookId,
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
                        catchAllWebhookId: webhookId,
                        receiptRuleName: receiptResult.ruleName,
                        webhookUrl: webhookRecord[0].url
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

        // If catch-all is enabled, get webhook details
        let webhookDetails = null
        if (domain.isCatchAllEnabled && domain.catchAllWebhookId) {
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

        return {
            success: true,
            data: {
                domain: domain.domain,
                domainStatus: domain.status,
                isCatchAllEnabled: domain.isCatchAllEnabled,
                catchAllWebhookId: domain.catchAllWebhookId,
                receiptRuleName: domain.catchAllReceiptRuleName,
                webhook: webhookDetails
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
                // Email details
                id: receivedEmails.id,
                messageId: receivedEmails.messageId,
                from: receivedEmails.from,
                to: receivedEmails.to,
                recipient: receivedEmails.recipient,
                subject: receivedEmails.subject,
                receivedAt: receivedEmails.receivedAt,
                processedAt: receivedEmails.processedAt,
                status: receivedEmails.status,
                metadata: receivedEmails.metadata,
                userId: receivedEmails.userId,
                sesEventId: receivedEmails.sesEventId,
                createdAt: receivedEmails.createdAt,
                updatedAt: receivedEmails.updatedAt,
                
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
            .from(receivedEmails)
            .leftJoin(sesEvents, eq(receivedEmails.sesEventId, sesEvents.id))
            .where(
                and(
                    eq(receivedEmails.id, emailId),
                    eq(receivedEmails.userId, session.user.id)
                )
            )
            .limit(1)

        if (emailDetails.length === 0) {
            return { error: 'Email not found' }
        }

        const email = emailDetails[0]

        // Parse common headers if available
        let parsedHeaders = null
        if (email.commonHeaders) {
            try {
                parsedHeaders = JSON.parse(email.commonHeaders)
            } catch (e) {
                console.error('Failed to parse common headers:', e)
            }
        }

        // Parse metadata if available
        let parsedMetadata = null
        if (email.metadata) {
            try {
                parsedMetadata = JSON.parse(email.metadata)
            } catch (e) {
                console.error('Failed to parse metadata:', e)
            }
        }

        // Parse email content
        const { parseEmailContent, sanitizeHtml } = await import('@/lib/email-parser')
        const parsedEmail = await parseEmailContent(email.emailContent || '')

        // Format the response
        const response = {
            id: email.id,
            messageId: email.messageId,
            from: email.from,
            to: email.to,
            recipient: email.recipient,
            subject: email.subject,
            receivedAt: email.receivedAt,
            processedAt: email.processedAt,
            status: email.status,
            emailContent: {
                htmlBody: parsedEmail.htmlBody ? sanitizeHtml(parsedEmail.htmlBody) : null,
                textBody: parsedEmail.textBody,
                attachments: parsedEmail.attachments,
                headers: parsedEmail.headers,
                rawContent: email.emailContent, // Include raw content for debugging
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
                commonHeaders: parsedHeaders,
                emailMetadata: parsedMetadata,
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

        // Import parsedEmails table
        const { parsedEmails } = await import('@/lib/db/schema')

        // Fetch email details from both receivedEmails and parsedEmails tables
        const emailDetails = await db
            .select({
                // Received email details
                id: receivedEmails.id,
                messageId: receivedEmails.messageId,
                from: receivedEmails.from,
                to: receivedEmails.to,
                recipient: receivedEmails.recipient,
                subject: receivedEmails.subject,
                receivedAt: receivedEmails.receivedAt,
                processedAt: receivedEmails.processedAt,
                status: receivedEmails.status,
                isRead: receivedEmails.isRead,
                readAt: receivedEmails.readAt,
                userId: receivedEmails.userId,
                createdAt: receivedEmails.createdAt,
                updatedAt: receivedEmails.updatedAt,
                
                // Parsed email details
                parsedFromText: parsedEmails.fromText,
                parsedFromAddress: parsedEmails.fromAddress,
                parsedFromName: parsedEmails.fromName,
                parsedToText: parsedEmails.toText,
                parsedToAddresses: parsedEmails.toAddresses,
                parsedSubject: parsedEmails.subject,
                parsedTextBody: parsedEmails.textBody,
                parsedHtmlBody: parsedEmails.htmlBody,
                parsedAttachments: parsedEmails.attachments,
                parsedAttachmentCount: parsedEmails.attachmentCount,
                parsedHasAttachments: parsedEmails.hasAttachments,
                parsedHeaders: parsedEmails.headers,
                parsedEmailDate: parsedEmails.emailDate,
                parsedInReplyTo: parsedEmails.inReplyTo,
                parsedReferences: parsedEmails.references,
                parsedPriority: parsedEmails.priority,
                parsedHasTextBody: parsedEmails.hasTextBody,
                parsedHasHtmlBody: parsedEmails.hasHtmlBody,
                parseSuccess: parsedEmails.parseSuccess,
                parseError: parsedEmails.parseError,
            })
            .from(receivedEmails)
            .leftJoin(parsedEmails, eq(receivedEmails.id, parsedEmails.emailId))
            .where(
                and(
                    eq(receivedEmails.id, emailId),
                    eq(receivedEmails.userId, session.user.id)
                )
            )
            .limit(1)

        if (emailDetails.length === 0) {
            return { error: 'Email not found' }
        }

        const email = emailDetails[0]

        // Parse JSON fields
        let parsedAttachments = []
        if (email.parsedAttachments) {
            try {
                parsedAttachments = JSON.parse(email.parsedAttachments)
            } catch (e) {
                console.error('Failed to parse attachments:', e)
            }
        }

        let parsedHeaders = {}
        if (email.parsedHeaders) {
            try {
                parsedHeaders = JSON.parse(email.parsedHeaders)
            } catch (e) {
                console.error('Failed to parse headers:', e)
            }
        }

        let parsedToAddresses = []
        if (email.parsedToAddresses) {
            try {
                parsedToAddresses = JSON.parse(email.parsedToAddresses)
            } catch (e) {
                console.error('Failed to parse to addresses:', e)
            }
        }

        let parsedReferences = []
        if (email.parsedReferences) {
            try {
                parsedReferences = JSON.parse(email.parsedReferences)
            } catch (e) {
                console.error('Failed to parse references:', e)
            }
        }

        // Sanitize HTML content
        const { sanitizeHtml } = await import('@/lib/email-parser')
        const sanitizedHtmlBody = email.parsedHtmlBody ? sanitizeHtml(email.parsedHtmlBody) : null

        // Format the response
        const response = {
            id: email.id,
            messageId: email.messageId,
            from: email.from,
            to: email.to,
            recipient: email.recipient,
            subject: email.subject || email.parsedSubject,
            receivedAt: email.receivedAt,
            processedAt: email.processedAt,
            status: email.status,
            isRead: email.isRead,
            readAt: email.readAt,
            emailContent: {
                htmlBody: sanitizedHtmlBody,
                textBody: email.parsedTextBody,
                attachments: parsedAttachments,
                headers: parsedHeaders,
            },
            parsedData: {
                fromText: email.parsedFromText,
                fromAddress: email.parsedFromAddress,
                fromName: email.parsedFromName,
                toText: email.parsedToText,
                toAddresses: parsedToAddresses,
                subject: email.parsedSubject,
                emailDate: email.parsedEmailDate,
                inReplyTo: email.parsedInReplyTo,
                references: parsedReferences,
                priority: email.parsedPriority,
                attachmentCount: email.parsedAttachmentCount,
                hasAttachments: email.parsedHasAttachments,
                hasTextBody: email.parsedHasTextBody,
                hasHtmlBody: email.parsedHasHtmlBody,
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

        // Import parsedEmails table
        const { parsedEmails } = await import('@/lib/db/schema')

        // Build where conditions
        let whereConditions = [eq(receivedEmails.userId, session.user.id)]

        // Add status filter
        if (statusFilter !== 'all') {
            whereConditions.push(eq(receivedEmails.status, statusFilter))
        }

        // Add domain filter
        if (domainFilter !== 'all') {
            whereConditions.push(sql`SPLIT_PART(${receivedEmails.recipient}, '@', 2) = ${domainFilter}`)
        }

        // Add search filter
        if (searchQuery) {
            whereConditions.push(
                sql`(
                    ${receivedEmails.from} ILIKE ${`%${searchQuery}%`} OR
                    ${receivedEmails.recipient} ILIKE ${`%${searchQuery}%`} OR
                    ${receivedEmails.subject} ILIKE ${`%${searchQuery}%`} OR
                    ${receivedEmails.messageId} ILIKE ${`%${searchQuery}%`} OR
                    ${parsedEmails.fromText} ILIKE ${`%${searchQuery}%`} OR
                    ${parsedEmails.subject} ILIKE ${`%${searchQuery}%`}
                )`
            )
        }

        // Fetch emails with parsed data
        const emailsList = await db
            .select({
                // Basic email info
                id: receivedEmails.id,
                messageId: receivedEmails.messageId,
                from: receivedEmails.from,
                recipient: receivedEmails.recipient,
                subject: receivedEmails.subject,
                receivedAt: receivedEmails.receivedAt,
                status: receivedEmails.status,
                isRead: receivedEmails.isRead,
                readAt: receivedEmails.readAt,
                
                // Parsed email info
                parsedFromText: parsedEmails.fromText,
                parsedFromAddress: parsedEmails.fromAddress,
                parsedFromName: parsedEmails.fromName,
                parsedSubject: parsedEmails.subject,
                parsedAttachmentCount: parsedEmails.attachmentCount,
                parsedHasAttachments: parsedEmails.hasAttachments,
                parsedEmailDate: parsedEmails.emailDate,
                parseSuccess: parsedEmails.parseSuccess,
            })
            .from(receivedEmails)
            .leftJoin(parsedEmails, eq(receivedEmails.id, parsedEmails.emailId))
            .where(and(...whereConditions))
            .orderBy(desc(receivedEmails.receivedAt))
            .limit(limit)
            .offset(offset)

        // Get total count for pagination
        const totalCountResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(receivedEmails)
            .leftJoin(parsedEmails, eq(receivedEmails.id, parsedEmails.emailId))
            .where(and(...whereConditions))

        const totalCount = totalCountResult[0]?.count || 0

        // Get unique domains for filter options
        const uniqueDomainsResult = await db
            .select({
                domain: sql<string>`DISTINCT SPLIT_PART(${receivedEmails.recipient}, '@', 2)`
            })
            .from(receivedEmails)
            .where(eq(receivedEmails.userId, session.user.id))
            .orderBy(sql`SPLIT_PART(${receivedEmails.recipient}, '@', 2)`)

        const uniqueDomains = uniqueDomainsResult.map(row => row.domain).filter(Boolean)

        // Format the emails
        const formattedEmails = emailsList.map(email => ({
            id: email.id,
            messageId: email.messageId,
            from: email.from,
            recipient: email.recipient,
            subject: email.subject || email.parsedSubject || 'No Subject',
            receivedAt: email.receivedAt.toISOString(),
            status: email.status,
            domain: email.recipient.split('@')[1] || '',
            isRead: email.isRead || false,
            readAt: email.readAt?.toISOString(),
            parsedData: {
                fromText: email.parsedFromText,
                fromAddress: email.parsedFromAddress,
                fromName: email.parsedFromName,
                subject: email.parsedSubject,
                attachmentCount: email.parsedAttachmentCount || 0,
                hasAttachments: email.parsedHasAttachments || false,
                emailDate: email.parsedEmailDate?.toISOString(),
                parseSuccess: email.parseSuccess,
            }
        }))

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
                }
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
        const result = await db
            .update(receivedEmails)
            .set({
                isRead: true,
                readAt: new Date(),
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(receivedEmails.id, emailId),
                    eq(receivedEmails.userId, session.user.id)
                )
            )
            .returning()

        if (result.length === 0) {
            return { error: 'Email not found or access denied' }
        }

        return { 
            success: true, 
            data: result[0] 
        }
    } catch (error) {
        console.error('Error marking email as read:', error)
        return { error: 'Failed to mark email as read' }
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


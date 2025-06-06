"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Autumn as autumn, Customer } from "autumn-js"
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses-rules'

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
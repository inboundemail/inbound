import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { authenticatedProcedure } from '../_lib/procedures'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, domainDnsRecords } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getDependentSubdomains } from '@/lib/db/domains'
import { isRootDomain } from '@/lib/domains-and-dns/domain-utils'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'
import { deleteDomainFromSES } from '@/lib/domains-and-dns/domain-verification'
import { Autumn as autumn } from 'autumn-js'

/**
 * Input schema for domain deletion
 */
const DeleteDomainInput = z.object({
  id: z
    .string()
    .uuid()
    .describe('The unique identifier of the domain to delete'),
})

/**
 * Deletion statistics schema
 */
const DeletionStatsSchema = z.object({
  domain: z.string().describe('The domain name that was deleted'),
  emailAddresses: z.number().describe('Number of email addresses deleted'),
  dnsRecords: z.number().describe('Number of DNS records deleted'),
  blockedEmails: z.number().describe('Number of blocked emails deleted'),
  sesIdentity: z.boolean().describe('Whether SES identity was successfully deleted'),
  sesReceiptRules: z.boolean().describe('Whether SES receipt rules were successfully deleted'),
})

/**
 * Output schema for domain deletion
 */
const DeleteDomainOutput = z.object({
  success: z.boolean().describe('Whether the deletion was successful'),
  message: z.string().optional().describe('Success message with details'),
  stats: DeletionStatsSchema.describe('Statistics about deleted resources'),
})

/**
 * DELETE /api/v3/domains/{id}
 *
 * Deletes a domain and all associated resources
 * - Verifies domain ownership
 * - Checks for dependent subdomains (blocks deletion if found)
 * - Removes AWS SES receipt rules (catch-all and individual)
 * - Deletes AWS SES identity verification
 * - Deletes all email addresses
 * - Deletes all DNS records
 * - Deletes the domain record
 * - Decrements usage tracking with Autumn
 *
 * @authenticated Required - Session or API key
 * @rateLimit Standard (100/min session, 50/min API key)
 */
export const deleteDomain = authenticatedProcedure
  .route({
    method: 'DELETE',
    path: '/domains/{id}',
    summary: 'Delete domain',
    description: 'Delete a domain and all associated resources including email addresses, DNS records, and AWS SES configuration. Cannot delete root domains with dependent subdomains.',
    tags: ['domains'],
  })
  .input(DeleteDomainInput)
  .output(DeleteDomainOutput)
  .handler(async ({ input, context }) => {
    const { id } = input
    const { userId } = context

    console.log('🗑️ v3: Deleting domain:', id, 'for userId:', userId)

    // Get domain with user verification
    const domainResult = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, id),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!domainResult[0]) {
      console.log('❌ v3: Domain not found for user:', userId, 'domain:', id)
      throw new ORPCError('NOT_FOUND', {
        message: 'Domain not found',
      })
    }

    const domain = domainResult[0]
    console.log('✅ v3: Found domain:', domain.domain, 'status:', domain.status)

    // Check if this is a root domain with dependent subdomains
    if (isRootDomain(domain.domain)) {
      const dependentSubdomains = await getDependentSubdomains(domain.domain, userId)

      if (dependentSubdomains.length > 0) {
        console.log(`❌ v3: Cannot delete root domain ${domain.domain} - ${dependentSubdomains.length} subdomain(s) depend on it`)
        throw new ORPCError('CONFLICT', {
          message: `Cannot delete root domain. This domain has ${dependentSubdomains.length} subdomain(s) that depend on it: ${dependentSubdomains.map(d => d.domain).join(', ')}`,
          data: {
            code: 'DOMAIN_HAS_DEPENDENT_SUBDOMAINS',
            dependentSubdomains: dependentSubdomains.map(d => ({
              id: d.id,
              domain: d.domain,
              status: d.status
            }))
          }
        })
      }
    }

    // Track deletion stats
    const deletionStats = {
      domain: domain.domain,
      emailAddresses: 0,
      dnsRecords: 0,
      blockedEmails: 0,
      sesIdentity: false,
      sesReceiptRules: false
    }

    // 1. Delete AWS SES receipt rules (both catch-all and individual)
    if (domain.domain) {
      try {
        console.log('🔧 v3: Removing AWS SES receipt rules')
        const sesManager = new AWSSESReceiptRuleManager()

        // Remove catch-all rule if exists
        if (domain.isCatchAllEnabled || domain.catchAllReceiptRuleName) {
          console.log('🔧 v3: Removing catch-all receipt rule')
          const catchAllRemoved = await sesManager.removeCatchAllDomain(domain.domain)
          if (catchAllRemoved) {
            deletionStats.sesReceiptRules = true
            console.log('✅ v3: Catch-all receipt rule removed')
          }
        }

        // Remove individual email receipt rule
        console.log('🔧 v3: Removing individual email receipt rule')
        const individualRemoved = await sesManager.removeEmailReceiving(domain.domain)
        if (individualRemoved) {
          deletionStats.sesReceiptRules = true
          console.log('✅ v3: Individual email receipt rule removed')
        }
      } catch (sesRuleError) {
        console.error('⚠️ v3: Failed to remove SES receipt rules:', sesRuleError)
        // Continue with deletion even if SES rule removal fails
      }
    }

    // 2. Delete AWS SES identity
    if (domain.domain) {
      try {
        console.log('🔧 v3: Deleting AWS SES identity')
        const sesResult = await deleteDomainFromSES(domain.domain)
        deletionStats.sesIdentity = sesResult.success
        if (sesResult.success) {
          console.log('✅ v3: SES identity deleted')
        } else {
          console.warn('⚠️ v3: Failed to delete SES identity:', sesResult.error)
        }
      } catch (sesError) {
        console.error('⚠️ v3: Failed to delete SES identity:', sesError)
        // Continue with deletion even if SES identity deletion fails
      }
    }

    // 3. Delete blocked emails for this domain
    try {
      console.log('🔧 v3: Deleting blocked emails')
      const { blockedEmails } = await import('@/lib/db/schema')
      const blockedResult = await db
        .delete(blockedEmails)
        .where(eq(blockedEmails.domainId, id))
        .returning({ id: blockedEmails.id })

      deletionStats.blockedEmails = blockedResult.length
      console.log(`✅ v3: Deleted ${blockedResult.length} blocked emails`)
    } catch (blockedError) {
      console.error('⚠️ v3: Failed to delete blocked emails:', blockedError)
      // Continue with deletion
    }

    // 4. Delete email addresses
    try {
      console.log('🔧 v3: Deleting email addresses')
      const emailResult = await db
        .delete(emailAddresses)
        .where(eq(emailAddresses.domainId, id))
        .returning({ id: emailAddresses.id })

      deletionStats.emailAddresses = emailResult.length
      console.log(`✅ v3: Deleted ${emailResult.length} email addresses`)
    } catch (emailError) {
      console.error('❌ v3: Failed to delete email addresses:', emailError)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to delete email addresses',
        data: {
          details: emailError instanceof Error ? emailError.message : 'Unknown error'
        }
      })
    }

    // 5. Delete DNS records
    try {
      console.log('🔧 v3: Deleting DNS records')
      const dnsResult = await db
        .delete(domainDnsRecords)
        .where(eq(domainDnsRecords.domainId, id))
        .returning({ id: domainDnsRecords.id })

      deletionStats.dnsRecords = dnsResult.length
      console.log(`✅ v3: Deleted ${dnsResult.length} DNS records`)
    } catch (dnsError) {
      console.error('❌ v3: Failed to delete DNS records:', dnsError)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to delete DNS records',
        data: {
          details: dnsError instanceof Error ? dnsError.message : 'Unknown error'
        }
      })
    }

    // 6. Delete the domain itself
    try {
      console.log('🔧 v3: Deleting domain record')
      await db
        .delete(emailDomains)
        .where(eq(emailDomains.id, id))

      console.log('✅ v3: Domain record deleted')
    } catch (domainError) {
      console.error('❌ v3: Failed to delete domain:', domainError)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to delete domain',
        data: {
          details: domainError instanceof Error ? domainError.message : 'Unknown error'
        }
      })
    }

    // 7. Track domain deletion with Autumn to free up domain spot
    try {
      console.log('📊 v3: Tracking domain deletion with Autumn for user:', userId)
      const { error: trackError } = await autumn.track({
        customer_id: userId,
        feature_id: "domains",
        value: -1,
      })

      if (trackError) {
        console.error('⚠️ v3: Failed to track domain deletion:', trackError)
        // Don't fail the deletion if tracking fails, just log it
        console.warn(`⚠️ v3: Domain deleted but usage tracking failed for user: ${userId}`)
      } else {
        console.log(`✅ v3: Successfully tracked domain deletion for user: ${userId}`)
      }
    } catch (trackingError) {
      console.error('⚠️ v3: Failed to import or use Autumn tracking:', trackingError)
      // Don't fail the deletion if tracking fails, just log it
    }

    console.log('✅ v3: Successfully deleted domain and all associated resources')

    return {
      success: true,
      message: `Successfully deleted domain ${domain.domain} and all associated resources`,
      stats: deletionStats
    }
  })

import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { authenticatedProcedure } from '../_lib/procedures'
import { db } from '@/lib/db'
import { emailDomains, endpoints } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'
import { BatchRuleManager } from '@/lib/aws-ses/batch-rule-manager'

/**
 * Input schema for updating a domain
 */
const UpdateDomainInput = z.object({
  id: z
    .string()
    .uuid()
    .describe('The unique identifier of the domain to update'),
  isCatchAllEnabled: z
    .boolean()
    .optional()
    .describe('Enable or disable catch-all email receiving for this domain'),
  catchAllEndpointId: z
    .string()
    .uuid()
    .optional()
    .describe('The endpoint ID to route catch-all emails to'),
  receiveDmarcEmails: z
    .boolean()
    .optional()
    .describe('Enable or disable receiving DMARC report emails (dmarc@domain)'),
})

/**
 * Catch-all endpoint schema for the response
 */
const CatchAllEndpointSchema = z.object({
  id: z.string().describe('Endpoint ID'),
  name: z.string().describe('Endpoint name'),
  type: z.string().describe('Endpoint type (webhook, email, etc.)'),
  isActive: z.boolean().describe('Whether the endpoint is active'),
})

/**
 * Output schema for domain update
 */
const UpdateDomainOutput = z.object({
  id: z.string().describe('Unique domain identifier'),
  domain: z.string().describe('The domain name'),
  status: z.enum(['pending', 'verified', 'failed']).describe('Domain verification status'),
  isCatchAllEnabled: z.boolean().describe('Whether catch-all is enabled for this domain'),
  catchAllEndpointId: z.string().nullable().describe('The endpoint ID for catch-all emails'),
  catchAllEndpoint: CatchAllEndpointSchema.nullable().describe('Full endpoint details for catch-all'),
  receiveDmarcEmails: z.boolean().describe('Whether DMARC report emails are enabled'),
  updatedAt: z.date().describe('Last update timestamp'),
})

/**
 * PATCH /api/v3/domains/{id}
 *
 * Updates domain configuration including catch-all settings
 * - Validates domain ownership and verification status
 * - Configures AWS SES batch receipt rules for catch-all
 * - Validates endpoint exists, is active, and belongs to user
 * - Updates domain record with new settings
 *
 * @authenticated Required - Session or API key
 * @rateLimit 100 requests per minute (session), 50 per minute (API key)
 */
export const updateDomain = authenticatedProcedure
  .route({
    method: 'PATCH',
    path: '/domains/{id}',
    summary: 'Update domain configuration',
    description: 'Update domain settings including catch-all configuration. Domain must be verified before enabling catch-all.',
    tags: ['domains'],
  })
  .input(UpdateDomainInput)
  .output(UpdateDomainOutput)
  .handler(async ({ input, context }) => {
    const { id, isCatchAllEnabled, catchAllEndpointId, receiveDmarcEmails } = input
    const { userId } = context

    console.log('✏️ v3: Updating domain:', id, 'for userId:', userId)
    console.log('📝 v3: Update data:', {
      isCatchAllEnabled,
      catchAllEndpointId,
      receiveDmarcEmails,
    })

    // Check if domain exists and belongs to user
    console.log('🔍 v3: Checking if domain exists and belongs to user')
    const existingDomain = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, id), eq(emailDomains.userId, userId)))
      .limit(1)

    if (!existingDomain[0]) {
      console.log('❌ v3: Domain not found for user:', userId, 'domain:', id)
      throw new ORPCError('NOT_FOUND', {
        message: 'Domain not found',
      })
    }

    const domain = existingDomain[0]
    console.log('✅ v3: Found existing domain:', domain.domain)

    // Check if domain is verified before enabling catch-all
    if (isCatchAllEnabled && domain.status !== 'verified') {
      console.log('❌ v3: Domain not verified:', domain.status)
      throw new ORPCError('BAD_REQUEST', {
        message: 'Domain must be verified before configuring catch-all',
      })
    }

    // Validate endpoint if enabling catch-all
    if (isCatchAllEnabled && catchAllEndpointId) {
      console.log('🔍 v3: Validating endpoint')
      const endpointResult = await db
        .select()
        .from(endpoints)
        .where(and(eq(endpoints.id, catchAllEndpointId), eq(endpoints.userId, userId)))
        .limit(1)

      if (!endpointResult[0]) {
        console.log('❌ v3: Endpoint not found:', catchAllEndpointId)
        throw new ORPCError('BAD_REQUEST', {
          message: 'Endpoint not found or does not belong to user',
        })
      }

      if (!endpointResult[0].isActive) {
        console.log('❌ v3: Endpoint is inactive:', catchAllEndpointId)
        throw new ORPCError('BAD_REQUEST', {
          message: 'Selected endpoint is not active',
        })
      }
    }

    // Configure AWS SES batch receipt rules
    const catchAllEnabled = isCatchAllEnabled ?? domain.isCatchAllEnabled ?? false
    const catchAllEndpoint = catchAllEnabled ? catchAllEndpointId ?? domain.catchAllEndpointId : null
    let updatedReceiptRuleName = domain.catchAllReceiptRuleName

    // ENABLE catch-all: Ensure domain is in a batch rule (if not already)
    if (catchAllEnabled && !domain.catchAllReceiptRuleName?.startsWith('batch-rule-')) {
      console.log('🔧 v3: Enabling catch-all - Adding domain to batch rule')

      try {
        // Get AWS configuration
        const awsRegion = process.env.AWS_REGION || 'us-east-2'
        const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
        const s3BucketName = process.env.S3_BUCKET_NAME
        const awsAccountId = process.env.AWS_ACCOUNT_ID

        if (!s3BucketName || !awsAccountId) {
          console.error('⚠️ v3: AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID')
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'AWS configuration incomplete. Cannot enable catch-all without proper AWS setup.',
          })
        }

        const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
          lambdaFunctionName,
          awsAccountId,
          awsRegion
        )

        const batchManager = new BatchRuleManager('inbound-catchall-domain-default')
        const sesManager = new AWSSESReceiptRuleManager(awsRegion)

        // Find or create rule with capacity
        const rule = await batchManager.findOrCreateRuleWithCapacity(1)
        console.log(`📋 v3: Using batch rule: ${rule.ruleName} (${rule.currentCapacity}/${rule.availableSlots + rule.currentCapacity})`)

        // Add domain catch-all to batch rule
        await sesManager.configureBatchCatchAllRule({
          domains: [domain.domain],
          lambdaFunctionArn: lambdaArn,
          s3BucketName,
          ruleSetName: 'inbound-catchall-domain-default',
          ruleName: rule.ruleName,
        })

        // Increment rule capacity
        await batchManager.incrementRuleCapacity(rule.id, 1)

        updatedReceiptRuleName = rule.ruleName
        console.log(`✅ v3: Added domain to batch rule: ${rule.ruleName}`)
      } catch (error) {
        console.error('❌ v3: Failed to add domain to batch rule:', error)
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to configure AWS SES for catch-all',
        })
      }
    } else if (catchAllEnabled) {
      console.log(`✅ v3: Domain already in batch rule: ${domain.catchAllReceiptRuleName}`)
    }

    // DISABLE catch-all: Just update database flag (domain stays in SES batch rule)
    // Note: Domain remains in SES to receive individual email addresses
    // Filtering is handled by email-router.ts based on isCatchAllEnabled flag

    // Update domain in database
    console.log('💾 v3: Updating domain in database')
    const [updatedDomain] = await db
      .update(emailDomains)
      .set({
        isCatchAllEnabled: catchAllEnabled,
        catchAllEndpointId: catchAllEndpoint,
        catchAllReceiptRuleName: updatedReceiptRuleName,
        receiveDmarcEmails: receiveDmarcEmails ?? domain.receiveDmarcEmails ?? false,
        updatedAt: new Date(),
      })
      .where(eq(emailDomains.id, id))
      .returning()

    // Get updated endpoint information
    let catchAllEndpointInfo = null
    if (updatedDomain.catchAllEndpointId) {
      const endpointResult = await db
        .select({
          id: endpoints.id,
          name: endpoints.name,
          type: endpoints.type,
          isActive: endpoints.isActive,
        })
        .from(endpoints)
        .where(eq(endpoints.id, updatedDomain.catchAllEndpointId))
        .limit(1)

      const endpoint = endpointResult[0]
      if (endpoint) {
        catchAllEndpointInfo = {
          id: endpoint.id,
          name: endpoint.name,
          type: endpoint.type,
          isActive: endpoint.isActive || false,
        }
      }
    }

    console.log('✅ v3: Successfully updated domain settings')

    return {
      id: updatedDomain.id,
      domain: updatedDomain.domain,
      status: updatedDomain.status as 'pending' | 'verified' | 'failed',
      isCatchAllEnabled: updatedDomain.isCatchAllEnabled || false,
      catchAllEndpointId: updatedDomain.catchAllEndpointId,
      catchAllEndpoint: catchAllEndpointInfo,
      receiveDmarcEmails: updatedDomain.receiveDmarcEmails || false,
      updatedAt: updatedDomain.updatedAt || new Date(),
    }
  })

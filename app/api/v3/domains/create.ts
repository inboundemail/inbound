import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { authenticatedProcedure } from '../_lib/procedures'
import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { checkDomainCanReceiveEmails } from '@/lib/domains-and-dns/dns'
import { createDomainVerification, getVerifiedParentDomain } from '@/lib/db/domains'
import { initiateDomainVerification } from '@/lib/domains-and-dns/domain-verification'
import { autumn } from '@/lib/autumn/client'
import { isSubdomain } from '@/lib/domains-and-dns/domain-utils'

// AWS configuration
const awsRegion = process.env.AWS_REGION || 'us-east-2'

/**
 * Input schema for domain creation
 */
const CreateDomainInput = z.object({
  domain: z
    .string()
    .min(1, 'Domain is required')
    .max(253, 'Domain name too long')
    .toLowerCase()
    .trim()
    .describe('The domain name to add for email receiving'),
})

/**
 * DNS record schema for the response
 */
const DnsRecordSchema = z.object({
  type: z.string().describe('DNS record type (TXT, MX, CNAME, etc.)'),
  name: z.string().describe('DNS record name/hostname'),
  value: z.string().describe('DNS record value'),
  description: z.string().optional().describe('Human-readable description of what this record does'),
  isRequired: z.boolean().describe('Whether this record is required for domain verification'),
})

/**
 * Output schema for domain creation
 */
const CreateDomainOutput = z.object({
  id: z.string().describe('Unique domain identifier'),
  domain: z.string().describe('The domain name'),
  status: z.enum(['pending', 'verified', 'failed']).describe('Domain verification status'),
  canReceiveEmails: z.boolean().describe('Whether the domain can receive emails'),
  hasMxRecords: z.boolean().describe('Whether the domain has existing MX records'),
  domainProvider: z.string().nullable().describe('Detected DNS provider (e.g., Cloudflare, AWS)'),
  providerConfidence: z.string().nullable().describe('Confidence level of provider detection'),
  mailFromDomain: z.string().optional().describe('Custom MAIL FROM domain for sending'),
  mailFromDomainStatus: z.string().optional().describe('MAIL FROM domain verification status'),
  dnsRecords: z.array(DnsRecordSchema).describe('DNS records to add for domain verification'),
  createdAt: z.date().describe('Domain creation timestamp'),
  updatedAt: z.date().describe('Domain last update timestamp'),
  parentDomain: z.string().optional().describe('Parent domain if this is a verified subdomain'),
  message: z.string().optional().describe('Additional information about the domain setup'),
})

/**
 * POST /api/v3/domains/create
 * 
 * Creates a new domain for email receiving
 * - Validates domain format and availability
 * - Checks DNS records for conflicts
 * - Enforces domain limits via Autumn
 * - Initiates AWS SES verification
 * - Handles subdomain inheritance from verified parents
 * 
 * @authenticated Required - Session or API key
 * @rateLimit 60 requests per minute
 */
export const createDomain = authenticatedProcedure
  .route({
    method: 'POST',
    path: '/domains',
    summary: 'Create a new domain',
    description: 'Add a new domain for receiving emails. Automatically detects DNS provider and generates required verification records.',
    tags: ['domains'],
    successStatus: 201,
  })
  .input(CreateDomainInput)
  .output(CreateDomainOutput)
  .handler(async ({ input, context }) => {
    const { domain } = input
    const { userId } = context

    console.log('➕ v3: Creating domain:', domain, 'for userId:', userId)

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domainRegex.test(domain) || domain.length > 253) {
      console.log('❌ v3: Invalid domain format:', domain)
      throw new ORPCError('BAD_REQUEST', {
        message: 'Invalid domain format. Please provide a valid domain name.',
      })
    }

    // Check if domain already exists on the platform (for any user)
    console.log('🔍 v3: Checking if domain already exists on platform')
    const existingDomainAnyUser = await db
      .select({
        id: emailDomains.id,
        userId: emailDomains.userId,
        status: emailDomains.status,
        createdAt: emailDomains.createdAt,
      })
      .from(emailDomains)
      .where(eq(emailDomains.domain, domain))
      .limit(1)

    if (existingDomainAnyUser[0]) {
      const isOwnDomain = existingDomainAnyUser[0].userId === userId

      if (isOwnDomain) {
        console.log('❌ v3: Domain already exists for current user:', domain)
        throw new ORPCError('CONFLICT', {
          message: 'You have already added this domain to your account',
        })
      } else {
        console.log('❌ v3: Domain already registered by another user:', domain)
        throw new ORPCError('CONFLICT', {
          message: 'This domain is already registered on our platform. If you believe this is an error or you need to transfer ownership, please contact our support team.',
        })
      }
    }

    // Check Autumn domain limits
    console.log('🔍 v3: Checking domain limits with Autumn')
    const { data: domainCheck, error: domainCheckError } = await autumn.check({
      customer_id: userId,
      feature_id: 'domains',
    })

    if (domainCheckError) {
      console.error('❌ v3: Autumn domain check error:', domainCheckError)
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to check domain limits',
      })
    }

    if (!domainCheck?.allowed) {
      console.log('❌ v3: Domain limit reached for user:', userId)
      throw new ORPCError('FORBIDDEN', {
        message: 'Domain limit reached. Please upgrade your plan to add more domains.',
      })
    }

    console.log('✅ v3: Domain limits check passed:', {
      allowed: domainCheck.allowed,
      balance: domainCheck.balance,
      unlimited: domainCheck.unlimited,
    })

    // Check DNS for conflicts (MX/CNAME records)
    console.log('🔍 v3: Checking DNS records for conflicts')
    const dnsResult = await checkDomainCanReceiveEmails(domain)

    if (!dnsResult.canReceiveEmails) {
      console.log('❌ v3: Domain cannot receive emails:', dnsResult.error)
      throw new ORPCError('BAD_REQUEST', {
        message: dnsResult.error || 'Domain has conflicting DNS records (MX or CNAME). Please remove them before adding this domain.',
      })
    }

    console.log('✅ v3: DNS check passed:', {
      canReceiveEmails: dnsResult.canReceiveEmails,
      hasMxRecords: dnsResult.hasMxRecords,
      provider: dnsResult.provider?.name,
    })

    // Create domain record in database
    console.log('💾 v3: Creating domain record in database')
    const domainRecord = await createDomainVerification(domain, userId, {
      canReceiveEmails: dnsResult.canReceiveEmails,
      hasMxRecords: dnsResult.hasMxRecords,
      provider: dnsResult.provider,
    })

    // Check if this is a subdomain with verified parent
    let parentDomain: string | null = null
    if (isSubdomain(domain)) {
      const parent = await getVerifiedParentDomain(domain, userId)
      if (parent) {
        console.log(`✅ v3: Subdomain detected with verified parent: ${parent.domain}`)
        parentDomain = parent.domain

        // Mark domain as verified immediately (inherits from parent)
        await db
          .update(emailDomains)
          .set({
            status: 'verified',
            verificationToken: null, // Not needed
            updatedAt: new Date(),
          })
          .where(eq(emailDomains.id, domainRecord.id))

        // Return simplified response with only MX record
        const response = {
          id: domainRecord.id,
          domain: domainRecord.domain,
          status: 'verified' as const,
          canReceiveEmails: domainRecord.canReceiveEmails || false,
          hasMxRecords: domainRecord.hasMxRecords || false,
          domainProvider: domainRecord.domainProvider,
          providerConfidence: domainRecord.providerConfidence,
          dnsRecords: [
            {
              type: 'MX',
              name: domain,
              value: `10 inbound-smtp.${awsRegion}.amazonaws.com`,
              description: 'Add this MX record to receive emails at this subdomain',
              isRequired: true,
            },
          ],
          createdAt: domainRecord.createdAt || new Date(),
          updatedAt: new Date(),
          parentDomain: parent.domain,
          message: `Subdomain inherits verification from ${parent.domain}. Only MX record needed for receiving.`,
        }

        console.log(`✅ v3: Subdomain created with parent verification: ${domain} inherits from ${parent.domain}`)
        return response
      }
    }

    // Initiate SES verification (includes tenant association for new domains)
    console.log('🔐 v3: Initiating SES domain verification with tenant integration')
    const verificationResult = await initiateDomainVerification(domain, userId)

    // Track domain usage with Autumn (only if not unlimited)
    if (!domainCheck.unlimited) {
      console.log('📊 v3: Tracking domain usage with Autumn')
      const { error: trackError } = await autumn.track({
        customer_id: userId,
        feature_id: 'domains',
        value: 1,
      })

      if (trackError) {
        console.error('⚠️ v3: Failed to track domain usage:', trackError)
        // Don't fail the request, just log the warning
      }
    }

    // Format response
    const response = {
      id: domainRecord.id,
      domain: domainRecord.domain,
      status: verificationResult.status as 'pending' | 'verified' | 'failed',
      canReceiveEmails: domainRecord.canReceiveEmails || false,
      hasMxRecords: domainRecord.hasMxRecords || false,
      domainProvider: domainRecord.domainProvider,
      providerConfidence: domainRecord.providerConfidence,
      mailFromDomain: verificationResult.mailFromDomain,
      mailFromDomainStatus: verificationResult.mailFromDomainStatus,
      dnsRecords: verificationResult.dnsRecords.map((record) => ({
        type: record.type,
        name: record.name,
        value: record.value,
        description: record.description,
        isRequired: true,
      })),
      createdAt: domainRecord.createdAt || new Date(),
      updatedAt: domainRecord.updatedAt || new Date(),
    }

    console.log('✅ v3: Successfully created domain:', domainRecord.id)
    return response
  })


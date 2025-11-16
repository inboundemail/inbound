import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { authenticatedProcedure } from '../_lib/procedures'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints, domainDnsRecords } from '@/lib/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { verifyDnsRecords } from '@/lib/domains-and-dns/dns'
import { SESClient, GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand, GetIdentityMailFromDomainAttributesCommand, SetIdentityMailFromDomainCommand } from '@aws-sdk/client-ses'

// AWS SES Client setup
const awsRegion = process.env.AWS_REGION || 'us-east-2'
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

let sesClient: SESClient | null = null

if (awsAccessKeyId && awsSecretAccessKey) {
  sesClient = new SESClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    }
  })
}

/**
 * Input schema for getting a domain
 */
const GetDomainInput = z.object({
  id: z
    .string()
    .uuid()
    .describe('The unique identifier of the domain'),
  check: z
    .boolean()
    .optional()
    .describe('Whether to perform real-time DNS and SES verification checks'),
})

/**
 * Catch-all endpoint schema
 */
const CatchAllEndpointSchema = z.object({
  id: z.string().describe('Endpoint unique identifier'),
  name: z.string().describe('Endpoint name'),
  type: z.string().describe('Endpoint type (webhook, email, etc.)'),
  isActive: z.boolean().describe('Whether endpoint is active'),
})

/**
 * Domain stats schema
 */
const DomainStatsSchema = z.object({
  totalEmailAddresses: z.number().describe('Total number of email addresses'),
  activeEmailAddresses: z.number().describe('Number of active email addresses'),
  emailsLast24h: z.number().describe('Emails received in last 24 hours'),
  emailsLast7d: z.number().describe('Emails received in last 7 days'),
  emailsLast30d: z.number().describe('Emails received in last 30 days'),
})

/**
 * DNS record schema
 */
const DnsRecordSchema = z.object({
  id: z.string().describe('DNS record unique identifier'),
  recordType: z.string().describe('DNS record type (TXT, MX, CNAME, etc.)'),
  name: z.string().describe('DNS record name/hostname'),
  value: z.string().describe('DNS record value'),
  isRequired: z.boolean().describe('Whether this record is required'),
  isVerified: z.boolean().describe('Whether this record has been verified'),
  lastChecked: z.date().nullable().describe('Last verification check timestamp'),
  priority: z.number().nullable().describe('Priority for MX records'),
  description: z.string().nullable().describe('Human-readable description'),
  createdAt: z.date().describe('Record creation timestamp'),
})

/**
 * Verification check result schema (when check=true)
 */
const VerificationCheckSchema = z.object({
  dnsRecords: z.array(z.object({
    type: z.string().describe('Record type'),
    name: z.string().describe('Record name'),
    value: z.string().describe('Expected value'),
    isVerified: z.boolean().describe('Whether verified'),
    error: z.string().optional().describe('Error message if verification failed'),
  })).describe('DNS record verification results'),
  sesStatus: z.string().describe('SES verification status'),
  dkimStatus: z.string().optional().describe('DKIM verification status'),
  dkimVerified: z.boolean().optional().describe('Whether DKIM is verified'),
  dkimTokens: z.array(z.string()).optional().describe('DKIM tokens'),
  mailFromDomain: z.string().optional().describe('Custom MAIL FROM domain'),
  mailFromStatus: z.string().optional().describe('MAIL FROM domain status'),
  mailFromVerified: z.boolean().optional().describe('Whether MAIL FROM is verified'),
  isFullyVerified: z.boolean().describe('Whether domain is fully verified'),
  lastChecked: z.date().describe('When this check was performed'),
})

/**
 * Auth recommendations schema
 */
const AuthRecommendationsSchema = z.object({
  spf: z.object({
    name: z.string().describe('SPF record name'),
    value: z.string().describe('SPF record value'),
    description: z.string().describe('Description'),
  }).optional().describe('SPF record recommendation'),
  dmarc: z.object({
    name: z.string().describe('DMARC record name'),
    value: z.string().describe('DMARC record value'),
    description: z.string().describe('Description'),
  }).optional().describe('DMARC record recommendation'),
})

/**
 * Output schema for getting a domain
 */
const GetDomainOutput = z.object({
  id: z.string().describe('Unique domain identifier'),
  domain: z.string().describe('The domain name'),
  status: z.enum(['pending', 'verified', 'failed']).describe('Domain verification status'),
  canReceiveEmails: z.boolean().describe('Whether the domain can receive emails'),
  hasMxRecords: z.boolean().describe('Whether the domain has MX records'),
  domainProvider: z.string().nullable().describe('Detected DNS provider'),
  providerConfidence: z.string().nullable().describe('Confidence level of provider detection'),
  lastDnsCheck: z.date().nullable().describe('Last DNS check timestamp'),
  lastSesCheck: z.date().nullable().describe('Last SES verification check timestamp'),
  isCatchAllEnabled: z.boolean().describe('Whether catch-all is enabled'),
  catchAllEndpointId: z.string().nullable().describe('Catch-all endpoint ID if configured'),
  mailFromDomain: z.string().nullable().describe('Custom MAIL FROM domain'),
  mailFromDomainStatus: z.string().nullable().describe('MAIL FROM domain status'),
  mailFromDomainVerifiedAt: z.date().nullable().describe('MAIL FROM domain verification timestamp'),
  receiveDmarcEmails: z.boolean().describe('Whether to receive DMARC emails'),
  createdAt: z.date().describe('Domain creation timestamp'),
  updatedAt: z.date().describe('Domain last update timestamp'),
  userId: z.string().describe('User ID who owns this domain'),
  stats: DomainStatsSchema.describe('Domain statistics'),
  catchAllEndpoint: CatchAllEndpointSchema.nullable().describe('Catch-all endpoint details'),
  dnsRecords: z.array(DnsRecordSchema).describe('DNS records for this domain'),
  verificationCheck: VerificationCheckSchema.optional().describe('Real-time verification results (when check=true)'),
  authRecommendations: AuthRecommendationsSchema.optional().describe('Recommended SPF/DMARC records'),
})

/**
 * GET /api/v3/domains/{id}
 *
 * Retrieves detailed information about a specific domain
 * - Returns domain metadata, statistics, and DNS records
 * - Includes catch-all endpoint details if configured
 * - Optional check parameter performs real-time DNS and SES verification
 * - Enforces ownership validation
 *
 * @authenticated Required - Session or API key
 * @rateLimit 100 requests per minute (session), 50 per minute (API key)
 */
export const getDomain = authenticatedProcedure
  .route({
    method: 'GET',
    path: '/domains/{id}',
    summary: 'Get domain by ID',
    description: 'Retrieve detailed information about a specific domain including stats, DNS records, and optional real-time verification.',
    tags: ['domains'],
  })
  .input(GetDomainInput)
  .output(GetDomainOutput)
  .handler(async ({ input, context }) => {
    const { id, check } = input
    const { userId } = context

    console.log('🔍 v3: Getting domain:', id, 'for userId:', userId, { check })

    // Get domain with user verification
    const domainResult = await db
      .select()
      .from(emailDomains)
      .where(eq(emailDomains.id, id))
      .limit(1)

    if (!domainResult[0]) {
      console.log('❌ v3: Domain not found:', id)
      throw new ORPCError('NOT_FOUND', {
        message: 'Domain not found',
      })
    }

    const domain = domainResult[0]

    // Check ownership
    if (domain.userId !== userId) {
      console.log('❌ v3: Access denied for domain:', id, 'userId:', userId)
      throw new ORPCError('FORBIDDEN', {
        message: 'You do not have access to this domain',
      })
    }

    console.log('✅ v3: Found domain:', domain.domain, 'status:', domain.status)

    // Get domain statistics
    console.log('📊 v3: Calculating domain statistics')
    const emailCountResult = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(eq(emailAddresses.domainId, id))

    const emailCount = emailCountResult[0]?.count || 0

    const activeEmailCountResult = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.domainId, id),
        eq(emailAddresses.isActive, true)
      ))

    const activeEmailCount = activeEmailCountResult[0]?.count || 0

    // Get catch-all endpoint information
    let catchAllEndpoint = null
    if (domain.catchAllEndpointId) {
      console.log('🔍 v3: Getting catch-all endpoint information')
      const endpointResult = await db
        .select({
          id: endpoints.id,
          name: endpoints.name,
          type: endpoints.type,
          isActive: endpoints.isActive
        })
        .from(endpoints)
        .where(eq(endpoints.id, domain.catchAllEndpointId))
        .limit(1)

      if (endpointResult[0]) {
        catchAllEndpoint = {
          id: endpointResult[0].id,
          name: endpointResult[0].name,
          type: endpointResult[0].type,
          isActive: endpointResult[0].isActive || false,
        }
      }
    }

    // Get DNS records from database
    console.log('🔍 v3: Getting DNS records')
    const dnsRecordsResult = await db
      .select()
      .from(domainDnsRecords)
      .where(eq(domainDnsRecords.domainId, id))

    const dnsRecords = dnsRecordsResult.map(record => ({
      id: record.id,
      recordType: record.recordType,
      name: record.name,
      value: record.value,
      isRequired: record.isRequired || true,
      isVerified: record.isVerified || false,
      lastChecked: record.lastChecked ? new Date(record.lastChecked) : null,
      priority: record.priority,
      description: record.description,
      createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
    }))

    // Calculate time-based email statistics (simplified for now)
    const stats = {
      totalEmailAddresses: emailCount,
      activeEmailAddresses: activeEmailCount,
      emailsLast24h: 0, // TODO: Implement actual email counting
      emailsLast7d: 0,
      emailsLast30d: 0
    }

    // Prepare base response
    let response: z.infer<typeof GetDomainOutput> = {
      id: domain.id,
      domain: domain.domain,
      status: domain.status as 'pending' | 'verified' | 'failed',
      canReceiveEmails: domain.canReceiveEmails || false,
      hasMxRecords: domain.hasMxRecords || false,
      domainProvider: domain.domainProvider,
      providerConfidence: domain.providerConfidence,
      lastDnsCheck: domain.lastDnsCheck ? new Date(domain.lastDnsCheck) : null,
      lastSesCheck: domain.lastSesCheck ? new Date(domain.lastSesCheck) : null,
      isCatchAllEnabled: domain.isCatchAllEnabled || false,
      catchAllEndpointId: domain.catchAllEndpointId,
      mailFromDomain: domain.mailFromDomain,
      mailFromDomainStatus: domain.mailFromDomainStatus,
      mailFromDomainVerifiedAt: domain.mailFromDomainVerifiedAt ? new Date(domain.mailFromDomainVerifiedAt) : null,
      receiveDmarcEmails: domain.receiveDmarcEmails || false,
      createdAt: domain.createdAt ? new Date(domain.createdAt) : new Date(),
      updatedAt: domain.updatedAt ? new Date(domain.updatedAt) : new Date(),
      userId: domain.userId,
      stats,
      catchAllEndpoint,
      dnsRecords,
    }

    // If check=true, perform DNS and SES verification checks
    if (check) {
      console.log(`🔍 v3: Performing verification check for domain: ${domain.domain}`)

      try {
        let verificationResults: Array<{
          type: string
          name: string
          value: string
          isVerified: boolean
          error?: string
        }> = []

        // Build list of records to verify
        const recordsToVerify: Array<{
          type: string
          name: string
          value: string
          dbId: string | null
        }> = dnsRecordsResult.map(record => ({
          type: record.recordType,
          name: record.name,
          value: record.value,
          dbId: record.id
        }))

        // Also check for SPF and DMARC even if not in database
        const spfRecord = dnsRecordsResult.find(r => r.recordType === 'TXT' && r.name === domain.domain && (r.value || '').toLowerCase().includes('v=spf1'))
        if (!spfRecord) {
          recordsToVerify.push({
            type: 'TXT',
            name: domain.domain,
            value: 'v=spf1 include:amazonses.com ~all',
            dbId: null
          })
        }

        const dmarcRecord = dnsRecordsResult.find(r => r.recordType === 'TXT' && r.name === `_dmarc.${domain.domain}`)
        if (!dmarcRecord) {
          recordsToVerify.push({
            type: 'TXT',
            name: `_dmarc.${domain.domain}`,
            value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
            dbId: null
          })
        }

        if (recordsToVerify.length > 0) {
          // Verify DNS records
          console.log(`🔍 v3: Verifying ${recordsToVerify.length} DNS records`)
          const results = await verifyDnsRecords(
            recordsToVerify.map(record => ({
              type: record.type,
              name: record.name,
              value: record.value
            }))
          )

          verificationResults = results.map((result) => ({
            type: result.type,
            name: result.name,
            value: result.expectedValue,
            isVerified: result.isVerified,
            error: result.error
          }))

          // Update DNS record verification status in database (only for records that exist in DB)
          await Promise.all(
            recordsToVerify.map(async (record, index) => {
              if (record.dbId) {
                const verificationResult = results[index]
                await db
                  .update(domainDnsRecords)
                  .set({
                    isVerified: verificationResult.isVerified,
                    lastChecked: new Date()
                  })
                  .where(eq(domainDnsRecords.id, record.dbId))
              }
            })
          )
        }

        // Check SES verification status
        let sesStatus = 'Unknown'
        let dkimStatus: string | undefined
        let dkimVerified = false
        let dkimTokens: string[] | undefined
        let mailFromDomain: string | undefined
        let mailFromStatus: string | undefined
        let mailFromVerified = false

        if (sesClient) {
          try {
            console.log(`🔍 v3: Checking SES verification status`)
            const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
              Identities: [domain.domain]
            })
            const attributesResponse = await sesClient.send(getAttributesCommand)
            const attributes = attributesResponse.VerificationAttributes?.[domain.domain]
            sesStatus = attributes?.VerificationStatus || 'NotFound'

            // DKIM status
            const dkimCmd = new GetIdentityDkimAttributesCommand({ Identities: [domain.domain] })
            const dkimResp = await sesClient.send(dkimCmd)
            const dkimAttrs = dkimResp.DkimAttributes?.[domain.domain]
            dkimStatus = dkimAttrs?.DkimVerificationStatus || 'Pending'
            dkimVerified = dkimStatus === 'Success'
            dkimTokens = dkimAttrs?.DkimTokens || []

            // MAIL FROM status
            const mailFromCmd = new GetIdentityMailFromDomainAttributesCommand({ Identities: [domain.domain] })
            const mailFromResp = await sesClient.send(mailFromCmd)
            const mailFromAttrs = mailFromResp.MailFromDomainAttributes?.[domain.domain]
            mailFromDomain = mailFromAttrs?.MailFromDomain
            mailFromStatus = mailFromAttrs?.MailFromDomainStatus || 'NotSet'
            mailFromVerified = mailFromStatus === 'Success'

            // Retry MAIL FROM setup if still pending, failed, or not set
            if (sesStatus === 'Success' && (mailFromStatus === 'Pending' || mailFromStatus === 'Failed' || mailFromStatus === 'NotSet')) {
              try {
                const expectedMailFromDomain = `mail.${domain.domain}`
                console.log(`🔄 v3: Retrying MAIL FROM domain setup: ${expectedMailFromDomain}`)

                const retryMailFromCommand = new SetIdentityMailFromDomainCommand({
                  Identity: domain.domain,
                  MailFromDomain: expectedMailFromDomain,
                  BehaviorOnMXFailure: 'UseDefaultValue'
                })
                await sesClient.send(retryMailFromCommand)

                // Wait a moment for AWS to process
                await new Promise(resolve => setTimeout(resolve, 1000))

                // Check status again after retry
                const recheckMailFromCmd = new GetIdentityMailFromDomainAttributesCommand({
                  Identities: [domain.domain]
                })
                const recheckMailFromResp = await sesClient.send(recheckMailFromCmd)
                const recheckMailFromAttrs = recheckMailFromResp.MailFromDomainAttributes?.[domain.domain]

                // Update with rechecked values
                if (recheckMailFromAttrs) {
                  mailFromDomain = recheckMailFromAttrs.MailFromDomain
                  mailFromStatus = recheckMailFromAttrs.MailFromDomainStatus || 'Pending'
                  mailFromVerified = mailFromStatus === 'Success'
                  console.log(`✅ v3: MAIL FROM retry completed: ${mailFromDomain} (new status: ${mailFromStatus})`)
                }
              } catch (retryError) {
                console.warn(`⚠️ v3: MAIL FROM retry failed for ${domain.domain}:`, retryError)
              }
            }

            // Update domain status based on SES verification
            const updateData: any = {
              lastSesCheck: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }

            // Update MAIL FROM status if it exists
            if (mailFromDomain && mailFromStatus) {
              updateData.mailFromDomain = mailFromDomain
              updateData.mailFromDomainStatus = mailFromStatus
              if (mailFromStatus === 'Success') {
                updateData.mailFromDomainVerifiedAt = new Date().toISOString()
              }
              // Update response with latest MAIL FROM data
              response.mailFromDomain = mailFromDomain
              response.mailFromDomainStatus = mailFromStatus
              response.mailFromDomainVerifiedAt = mailFromStatus === 'Success' ? new Date() : response.mailFromDomainVerifiedAt
            }

            if (sesStatus === 'Success' && domain.status !== 'verified') {
              updateData.status = 'verified'
              await db
                .update(emailDomains)
                .set(updateData)
                .where(eq(emailDomains.id, domain.id))
              response.status = 'verified'
              response.updatedAt = new Date()
            } else if (sesStatus === 'Failed' && domain.status !== 'failed') {
              updateData.status = 'failed'
              await db
                .update(emailDomains)
                .set(updateData)
                .where(eq(emailDomains.id, domain.id))
              response.status = 'failed'
              response.updatedAt = new Date()
            } else {
              // Just update last check time, MAIL FROM status, and updatedAt timestamp
              await db
                .update(emailDomains)
                .set(updateData)
                .where(eq(emailDomains.id, domain.id))
              response.updatedAt = new Date()
            }
          } catch (sesError) {
            console.error(`❌ v3: SES verification check failed:`, sesError)
            sesStatus = 'Error'
          }
        }

        const allDnsVerified = verificationResults.length > 0 &&
          verificationResults.every(r => r.isVerified)
        const isFullyVerified = allDnsVerified && sesStatus === 'Success'

        response.verificationCheck = {
          dnsRecords: verificationResults,
          sesStatus,
          dkimStatus,
          dkimVerified,
          dkimTokens,
          mailFromDomain,
          mailFromStatus,
          mailFromVerified,
          isFullyVerified,
          lastChecked: new Date()
        }

        console.log(`✅ v3: Verification check complete for ${domain.domain}:`, {
          dnsVerified: allDnsVerified,
          sesStatus,
          dkimStatus,
          mailFromStatus,
          isFullyVerified
        })

      } catch (checkError) {
        console.error(`❌ v3: Verification check failed for ${domain.domain}:`, checkError)
        response.verificationCheck = {
          dnsRecords: [],
          sesStatus: 'Error',
          dkimStatus: 'Unknown',
          dkimVerified: false,
          dkimTokens: [],
          mailFromStatus: 'Unknown',
          mailFromVerified: false,
          isFullyVerified: false,
          lastChecked: new Date()
        }
      }

      // Build recommendations if SPF/DMARC missing or not verified
      try {
        const verificationCheckResults = response.verificationCheck?.dnsRecords || []
        const spfVerified = verificationCheckResults.some((r: any) =>
          r.type === 'TXT' &&
          r.name === domain.domain &&
          r.isVerified
        )
        const dmarcVerified = verificationCheckResults.some((r: any) =>
          r.type === 'TXT' &&
          r.name === `_dmarc.${domain.domain}` &&
          r.isVerified
        )

        const recommendations: any = {}

        if (!spfVerified) {
          recommendations.spf = {
            name: domain.domain,
            value: 'v=spf1 include:amazonses.com ~all',
            description: 'SPF record for root domain (recommended)'
          }
        }

        if (!dmarcVerified) {
          recommendations.dmarc = {
            name: `_dmarc.${domain.domain}`,
            value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
            description: 'DMARC policy record (starts with p=none for monitoring)'
          }
        }

        if (recommendations.spf || recommendations.dmarc) {
          response.authRecommendations = recommendations
        }
      } catch (recError) {
        console.warn('⚠️ v3: Failed to build auth recommendations:', recError)
      }
    }

    console.log('✅ v3: Successfully retrieved domain details')
    return response
  })

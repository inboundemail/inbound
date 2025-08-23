import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../helper/main'
import { db } from '@/lib/db'
import { emailDomains, domainDnsRecords } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  SESClient,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  SetIdentityMailFromDomainCommand,
  GetIdentityVerificationAttributesCommand,
  GetIdentityDkimAttributesCommand,
  GetIdentityMailFromDomainAttributesCommand,
} from '@aws-sdk/client-ses'

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

// Shared types
export interface DnsRecordOut {
  type: 'TXT' | 'CNAME' | 'MX'
  name: string
  value: string
  priority?: number
  isRequired: boolean
  isVerified: boolean
  description: string
}

// POST /domains/{id}/auth → initialize auth
export interface PostDomainAuthInitRequest {
  mailFromDomain?: string
  generateSpf?: boolean
  generateDmarc?: boolean
}

export interface PostDomainAuthInitResponse {
  success: boolean
  domain: string
  sesIdentityStatus: string
  dkimEnabled: boolean
  dkimTokens: string[]
  mailFromDomain: string
  mailFromStatus: string
  records: DnsRecordOut[]
  message: string
}

// PATCH /domains/{id}/auth → verify auth
export interface DnsVerificationResultOut {
  type: string
  name: string
  value: string
  isRequired: boolean
  isVerified: boolean
  description: string
  error?: string
  lastChecked: string
}

export interface SesVerificationStatusOut {
  identityStatus: string
  identityVerified: boolean
  dkimStatus: string
  dkimVerified: boolean
  dkimTokens: string[]
  mailFromDomain?: string
  mailFromStatus: string
  mailFromVerified: boolean
}

export interface PatchDomainAuthVerifyResponse {
  success: boolean
  domain: string
  overallStatus: 'verified' | 'pending' | 'failed'
  dnsRecords: DnsVerificationResultOut[]
  sesStatus: SesVerificationStatusOut
  summary: {
    totalRecords: number
    verifiedRecords: number
    requiredRecords: number
    verifiedRequiredRecords: number
  }
  message: string
  nextSteps?: string[]
}

/**
 * Get description for DNS record based on type and name
 */
function getDnsRecordDescription(recordType: string, name: string): string {
  if (recordType === 'TXT' && name.includes('_amazonses.')) {
    return 'SES domain verification'
  }
  if (recordType === 'CNAME' && name.includes('._domainkey.')) {
    return 'DKIM authentication token'
  }
  if (recordType === 'MX' && name.includes('mail.')) {
    return 'MAIL FROM domain MX record for bounces and complaints'
  }
  if (recordType === 'TXT' && name.includes('mail.')) {
    return 'SPF record for MAIL FROM domain (recommended)'
  }
  if (recordType === 'TXT' && name.includes('_dmarc.')) {
    return 'DMARC policy record (starts with p=none for monitoring)'
  }
  if (recordType === 'TXT' && name.startsWith('v=spf1')) {
    return 'SPF record for root domain (recommended)'
  }
  return `${recordType} record`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('🔐 POST /api/v2/domains/{id}/auth - Init domain auth for:', id)
  
  try {
    const { userId, error } = await validateRequest(request)
    if (!userId) return NextResponse.json({ error }, { status: 401 })

    // Get domain
    const domainResult = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        userId: emailDomains.userId,
        status: emailDomains.status,
        verificationToken: emailDomains.verificationToken
      })
      .from(emailDomains)
      .where(and(eq(emailDomains.id, id), eq(emailDomains.userId, userId)))
      .limit(1)

    if (!domainResult[0]) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    const domain = domainResult[0]

    if (!sesClient) {
      return NextResponse.json({
        error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
      }, { status: 500 })
    }

    // Parse request
    let requestData: PostDomainAuthInitRequest = {}
    try { requestData = await request.json() } catch {}
    const { mailFromDomain = 'mail', generateSpf = true, generateDmarc = true } = requestData
    const fullMailFromDomain = `${mailFromDomain}.${domain.domain}`

    const records: DnsRecordOut[] = []
    let sesIdentityStatus = 'Unknown'
    let dkimEnabled = false
    let dkimTokens: string[] = []
    let mailFromStatus = 'NotSet'

    try {
      // Identity
      let verificationToken = domain.verificationToken
      if (!verificationToken) {
        const verifyCommand = new VerifyDomainIdentityCommand({ Domain: domain.domain })
        const verifyResponse = await sesClient.send(verifyCommand)
        verificationToken = verifyResponse.VerificationToken || ''
        await db.update(emailDomains).set({ verificationToken, updatedAt: new Date() }).where(eq(emailDomains.id, id))
      }
      records.push({
        type: 'TXT',
        name: `_amazonses.${domain.domain}`,
        value: verificationToken!,
        isRequired: true,
        isVerified: false,
        description: 'SES domain verification'
      })

      // DKIM
      const dkimCommand = new VerifyDomainDkimCommand({ Domain: domain.domain })
      const dkimResponse = await sesClient.send(dkimCommand)
      dkimTokens = dkimResponse.DkimTokens || []
      dkimEnabled = dkimTokens.length > 0
      dkimTokens.forEach((token, index) => {
        records.push({
          type: 'CNAME',
          name: `${token}._domainkey.${domain.domain}`,
          value: `${token}.dkim.amazonses.com`,
          isRequired: true,
          isVerified: false,
          description: `DKIM authentication token ${index + 1}`
        })
      })

      // MAIL FROM
      const mailFromCommand = new SetIdentityMailFromDomainCommand({
        Identity: domain.domain,
        MailFromDomain: fullMailFromDomain,
        BehaviorOnMXFailure: 'UseDefaultValue'
      })
      await sesClient.send(mailFromCommand)
      
      // Store the MAIL FROM domain in database for use during email sending
      await db.update(emailDomains)
        .set({ 
          mailFromDomain: fullMailFromDomain,
          updatedAt: new Date()
        })
        .where(eq(emailDomains.id, id))
      records.push({
        type: 'MX',
        name: fullMailFromDomain,
        value: `10 feedback-smtp.${awsRegion}.amazonses.com`,
        isRequired: true,
        isVerified: false,
        description: 'MAIL FROM domain MX record for bounces and complaints'
      })
      records.push({
        type: 'TXT',
        name: fullMailFromDomain,
        value: 'v=spf1 include:amazonses.com -all',
        isRequired: false,
        isVerified: false,
        description: 'SPF record for MAIL FROM domain (recommended)'
      })

      // Optional SPF/DMARC
      if (generateSpf) {
        records.push({
          type: 'TXT',
          name: domain.domain,
          value: 'v=spf1 include:amazonses.com ~all',
          isRequired: false,
          isVerified: false,
          description: 'SPF record for root domain (recommended)'
        })
      }
      if (generateDmarc) {
        records.push({
          type: 'TXT',
          name: `_dmarc.${domain.domain}`,
          value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
          isRequired: false,
          isVerified: false,
          description: 'DMARC policy record (starts with p=none for monitoring)'
        })
      }

      // Status
      const identityStatusCommand = new GetIdentityVerificationAttributesCommand({ Identities: [domain.domain] })
      const identityStatusResponse = await sesClient.send(identityStatusCommand)
      const identityAttributes = identityStatusResponse.VerificationAttributes?.[domain.domain]
      sesIdentityStatus = identityAttributes?.VerificationStatus || 'Pending'

      const mailFromStatusCommand = new GetIdentityMailFromDomainAttributesCommand({ Identities: [domain.domain] })
      const mailFromStatusResponse = await sesClient.send(mailFromStatusCommand)
      const mailFromAttributes = mailFromStatusResponse.MailFromDomainAttributes?.[domain.domain]
      mailFromStatus = mailFromAttributes?.MailFromDomainStatus || 'Pending'

    } catch (sesError) {
      console.error('❌ SES configuration error:', sesError)
      return NextResponse.json({ error: 'Failed to configure SES authentication', details: sesError instanceof Error ? sesError.message : 'Unknown SES error' }, { status: 500 })
    }

    // Store to DB
    try {
      await db.delete(domainDnsRecords).where(eq(domainDnsRecords.domainId, id))
      const recordsToInsert = records.map(r => ({
        id: `dns_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        domainId: id,
        recordType: r.type,
        name: r.name,
        value: r.value,
        isRequired: r.isRequired,
        isVerified: false,
        createdAt: new Date(),
      }))
      if (recordsToInsert.length > 0) await db.insert(domainDnsRecords).values(recordsToInsert)
    } catch (dbError) {
      console.error('❌ Database error storing DNS records:', dbError)
    }

    const response: PostDomainAuthInitResponse = {
      success: true,
      domain: domain.domain,
      sesIdentityStatus,
      dkimEnabled,
      dkimTokens,
      mailFromDomain: fullMailFromDomain,
      mailFromStatus,
      records,
      message: `Domain authentication initialized. ${records.length} DNS records generated. Add these records to your DNS provider and use the verify endpoint to check status.`
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('❌ POST /api/v2/domains/{id}/auth - Error:', error)
    return NextResponse.json({ error: 'Failed to initialize domain authentication', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('🔍 PATCH /api/v2/domains/{id}/auth - Verify auth for:', id)

  try {
    const { userId, error } = await validateRequest(request)
    if (!userId) return NextResponse.json({ error }, { status: 401 })

    const domainResult = await db
      .select({ id: emailDomains.id, domain: emailDomains.domain, userId: emailDomains.userId, status: emailDomains.status })
      .from(emailDomains)
      .where(and(eq(emailDomains.id, id), eq(emailDomains.userId, userId)))
      .limit(1)
    if (!domainResult[0]) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    const domain = domainResult[0]

    if (!sesClient) {
      return NextResponse.json({ error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.' }, { status: 500 })
    }

    // Get DNS records
    const dnsRecords = await db.select().from(domainDnsRecords).where(eq(domainDnsRecords.domainId, id))
    if (dnsRecords.length === 0) {
      return NextResponse.json({ error: 'No DNS records found for domain. Please run POST /domains/{id}/auth first.' }, { status: 400 })
    }

    // Verify DNS
    const { verifyDnsRecords } = await import('@/lib/domains-and-dns/dns')
    const toVerify = dnsRecords.map(r => ({ type: r.recordType, name: r.name, value: r.value }))
    const results = await verifyDnsRecords(toVerify)
    const now = new Date()
    const dnsResults: DnsVerificationResultOut[] = []

    for (let i = 0; i < dnsRecords.length; i++) {
      const record = dnsRecords[i]
      const res = results[i]
      await db.update(domainDnsRecords).set({ isVerified: res.isVerified, lastChecked: now }).where(eq(domainDnsRecords.id, record.id))
      dnsResults.push({
        type: record.recordType,
        name: record.name,
        value: record.value,
        isRequired: record.isRequired || false,
        isVerified: res.isVerified,
        description: getDnsRecordDescription(record.recordType, record.name),
        error: res.error,
        lastChecked: now.toISOString(),
      })
    }

    // SES status
    const sesStatus: SesVerificationStatusOut = {
      identityStatus: 'Unknown', identityVerified: false,
      dkimStatus: 'Unknown', dkimVerified: false, dkimTokens: [],
      mailFromStatus: 'Unknown', mailFromVerified: false,
    }
    try {
      const identityCmd = new GetIdentityVerificationAttributesCommand({ Identities: [domain.domain] })
      const identityResp = await sesClient.send(identityCmd)
      const identityAttrs = identityResp.VerificationAttributes?.[domain.domain]
      sesStatus.identityStatus = identityAttrs?.VerificationStatus || 'Pending'
      sesStatus.identityVerified = sesStatus.identityStatus === 'Success'

      const dkimCmd = new GetIdentityDkimAttributesCommand({ Identities: [domain.domain] })
      const dkimResp = await sesClient.send(dkimCmd)
      const dkimAttrs = dkimResp.DkimAttributes?.[domain.domain]
      sesStatus.dkimStatus = dkimAttrs?.DkimVerificationStatus || 'Pending'
      sesStatus.dkimVerified = sesStatus.dkimStatus === 'Success'
      sesStatus.dkimTokens = dkimAttrs?.DkimTokens || []

      const mailFromCmd = new GetIdentityMailFromDomainAttributesCommand({ Identities: [domain.domain] })
      const mailFromResp = await sesClient.send(mailFromCmd)
      const mailFromAttrs = mailFromResp.MailFromDomainAttributes?.[domain.domain]
      sesStatus.mailFromDomain = mailFromAttrs?.MailFromDomain
      sesStatus.mailFromStatus = mailFromAttrs?.MailFromDomainStatus || 'NotSet'
      sesStatus.mailFromVerified = sesStatus.mailFromStatus === 'Success'
    } catch (e) {
      console.error('❌ SES status check error:', e)
    }

    // Overall
    const totalRecords = dnsResults.length
    const verifiedRecords = dnsResults.filter(r => r.isVerified).length
    const requiredRecords = dnsResults.filter(r => r.isRequired).length
    const verifiedRequiredRecords = dnsResults.filter(r => r.isRequired && r.isVerified).length
    const allRequiredDnsVerified = verifiedRequiredRecords === requiredRecords
    const sesFullyVerified = sesStatus.identityVerified && sesStatus.dkimVerified && (sesStatus.mailFromVerified || sesStatus.mailFromStatus === 'NotSet')
    let overallStatus: 'verified' | 'pending' | 'failed' = (allRequiredDnsVerified && sesFullyVerified) ? 'verified' : (verifiedRecords === 0 && !sesStatus.identityVerified ? 'failed' : 'pending')

    if (overallStatus !== domain.status) {
      await db.update(emailDomains).set({ status: overallStatus, lastDnsCheck: now, lastSesCheck: now, updatedAt: now }).where(eq(emailDomains.id, id))
    }

    const nextSteps: string[] = []
    if (overallStatus !== 'verified') {
      if (!allRequiredDnsVerified) {
        const failedRequired = dnsResults.filter(r => r.isRequired && !r.isVerified)
        if (failedRequired.length > 0) nextSteps.push(`Add ${failedRequired.length} missing required DNS record(s): ${failedRequired.map(r => `${r.type} ${r.name}`).join(', ')}`)
      }
      if (!sesStatus.identityVerified) nextSteps.push('Wait for SES identity verification (can take up to 72 hours)')
      if (!sesStatus.dkimVerified) nextSteps.push('Wait for DKIM verification (requires CNAME records)')
      if (sesStatus.mailFromDomain && !sesStatus.mailFromVerified) nextSteps.push('Wait for MAIL FROM domain verification (requires MX record)')
      if (nextSteps.length === 0) nextSteps.push('DNS propagation in progress. Try again in a few minutes.')
    }

    const response: PatchDomainAuthVerifyResponse = {
      success: true,
      domain: domain.domain,
      overallStatus,
      dnsRecords: dnsResults,
      sesStatus,
      summary: { totalRecords, verifiedRecords, requiredRecords, verifiedRequiredRecords },
      message: overallStatus === 'verified' ? 'Domain authentication fully verified! You can now send emails with enhanced deliverability.' : overallStatus === 'pending' ? `Domain authentication in progress. ${verifiedRecords}/${totalRecords} DNS records verified, ${verifiedRequiredRecords}/${requiredRecords} required records verified.` : 'Domain authentication failed. Please check your DNS records and try again.',
      ...(nextSteps.length > 0 && { nextSteps }),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('❌ PATCH /api/v2/domains/{id}/auth - Error:', error)
    return NextResponse.json({ error: 'Failed to verify domain authentication', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}



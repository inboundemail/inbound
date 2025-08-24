import { SESClient, VerifyDomainIdentityCommand, GetIdentityVerificationAttributesCommand, DeleteIdentityCommand, SetIdentityMailFromDomainCommand, GetIdentityMailFromDomainAttributesCommand } from '@aws-sdk/client-ses'
import { getDomainWithRecords, updateDomainSesVerification } from '@/lib/db/domains'

// Check if AWS credentials are available
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
} else {
  console.warn('AWS credentials not configured. SES verification will not work.')
}

export interface DomainVerificationResult {
  domain: string
  domainId: string
  verificationToken: string
  status: 'pending' | 'verified' | 'failed'
  sesStatus?: string
  mailFromDomain?: string
  mailFromDomainStatus?: string
  dnsRecords: Array<{
    type: string
    name: string
    value: string
    isVerified: boolean
    description?: string
  }>
  canProceed: boolean
  error?: string
}

/**
 * Initiate domain verification with AWS SES and generate DNS records
 * Now automatically sets up MAIL FROM domain to remove "via amazonses.com"
 */
export async function initiateDomainVerification(
  domain: string,
  userId: string
): Promise<DomainVerificationResult> {
  try {
    // Get domain record from database
    const domainRecord = await getDomainWithRecords(domain, userId)
    if (!domainRecord) {
      throw new Error('Domain not found in database')
    }

    // Check if AWS credentials are configured
    if (!sesClient) {
      return {
        domain,
        domainId: domainRecord.id,
        verificationToken: '',
        status: 'pending',
        dnsRecords: [],
        canProceed: false,
        error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
      }
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domainRegex.test(domain) || domain.length > 253) {
      throw new Error('Invalid domain format')
    }

    // Verify domain identity with AWS SES (if not already done)
    let verificationToken = domainRecord.verificationToken
    if (!verificationToken) {
      const verifyCommand = new VerifyDomainIdentityCommand({
        Domain: domain
      })
      const verifyResponse = await sesClient.send(verifyCommand)
      verificationToken = verifyResponse.VerificationToken || ''
    }

    // Set up MAIL FROM domain automatically to remove "via amazonses.com"
    const mailFromDomain = `mail.${domain}`
    let mailFromDomainStatus = 'pending'
    
    try {
      console.log(`🔧 Setting up MAIL FROM domain: ${mailFromDomain}`)
      const mailFromCommand = new SetIdentityMailFromDomainCommand({
        Identity: domain,
        MailFromDomain: mailFromDomain,
        BehaviorOnMXFailure: 'UseDefaultValue'
      })
      await sesClient.send(mailFromCommand)
      
      // Check MAIL FROM domain status
      const mailFromStatusCommand = new GetIdentityMailFromDomainAttributesCommand({
        Identities: [domain]
      })
      const mailFromStatusResponse = await sesClient.send(mailFromStatusCommand)
      const mailFromAttributes = mailFromStatusResponse.MailFromDomainAttributes?.[domain]
      mailFromDomainStatus = mailFromAttributes?.MailFromDomainStatus || 'pending'
      
      console.log(`✅ MAIL FROM domain configured: ${mailFromDomain} (status: ${mailFromDomainStatus})`)
    } catch (mailFromError) {
      console.error('Failed to set up MAIL FROM domain:', mailFromError)
      // Continue with verification even if MAIL FROM setup fails
    }

    // Get current verification status from AWS
    const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
      Identities: [domain]
    })

    const attributesResponse = await sesClient.send(getAttributesCommand)
    const attributes = attributesResponse.VerificationAttributes?.[domain]

    // Determine verification status
    const sesStatus = attributes?.VerificationStatus || 'Pending'
    let status: 'pending' | 'verified' | 'failed' = 'pending'
    
    if (sesStatus === 'Success') {
      status = 'verified'
    } else if (sesStatus === 'Failed') {
      status = 'failed'
    }

    // Prepare DNS records that need to be added (including MAIL FROM domain records)
    const requiredDnsRecords = [
      {
        type: 'TXT',
        name: `_amazonses.${domain}`,
        value: verificationToken || 'verification-token-not-available',
        description: 'SES domain verification'
      },
      {
        type: 'MX',
        name: domain,
        value: `10 inbound-smtp.${awsRegion}.amazonaws.com`,
        description: 'Inbound email routing'
      },
      {
        type: 'TXT',
        name: domain,
        value: 'v=spf1 include:amazonses.com ~all',
        description: 'SPF record for root domain'
      },
      {
        type: 'TXT',
        name: `_dmarc.${domain}`,
        value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}; ruf=mailto:dmarc@${domain}; fo=1; aspf=r; adkim=r`,
        description: 'DMARC policy record'
      },
      // MAIL FROM domain records to eliminate "via amazonses.com"
      {
        type: 'MX',
        name: mailFromDomain,
        value: `10 feedback-smtp.${awsRegion}.amazonses.com`,
        description: 'MAIL FROM domain MX record (eliminates "via amazonses.com")'
      },
      {
        type: 'TXT',
        name: mailFromDomain,
        value: 'v=spf1 include:amazonses.com ~all',
        description: 'SPF record for MAIL FROM domain'
      }
    ]

    // Update domain record in database with SES information and MAIL FROM domain
    if (!domainRecord.verificationToken) {
      await updateDomainSesVerification(
        domainRecord.id,
        verificationToken,
        sesStatus,
        requiredDnsRecords,
        mailFromDomain,
        mailFromDomainStatus
      )
    }

    // Return the DNS records that need to be added
    const dnsRecords = requiredDnsRecords.map(record => ({
      type: record.type,
      name: record.name,
      value: record.value,
      isVerified: false, // New domains won't have verified DNS records yet
      description: record.description
    }))

    return {
      domain,
      domainId: domainRecord.id,
      verificationToken: verificationToken || '',
      status,
      sesStatus,
      mailFromDomain,
      mailFromDomainStatus,
      dnsRecords,
      canProceed: status === 'verified'
    }

  } catch (error) {
    console.error('Domain verification error:', error)
    
    // Handle specific AWS errors
    if (error instanceof Error) {
      if (error.name === 'InvalidParameterValue') {
        throw new Error('Invalid domain parameter')
      }
      if (error.name === 'LimitExceededException') {
        throw new Error('AWS SES limit exceeded')
      }
    }

    throw new Error('Failed to verify domain with AWS SES')
  }
}

/**
 * Delete domain identity from AWS SES
 */
export async function deleteDomainFromSES(domain: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if AWS credentials are configured
    if (!sesClient) {
      return {
        success: false,
        error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
      }
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domainRegex.test(domain) || domain.length > 253) {
      return {
        success: false,
        error: 'Invalid domain format'
      }
    }

    console.log(`🗑️ Deleting domain identity from SES: ${domain}`)

    // Delete domain identity from AWS SES
    const deleteCommand = new DeleteIdentityCommand({
      Identity: domain
    })

    await sesClient.send(deleteCommand)

    console.log(`✅ Successfully deleted domain identity from SES: ${domain}`)

    return { success: true }

  } catch (error) {
    console.error('SES domain deletion error:', error)
    
    // Handle specific AWS errors
    if (error instanceof Error) {
      if (error.name === 'InvalidParameterValue') {
        return {
          success: false,
          error: 'Invalid domain parameter'
        }
      }
      if (error.name === 'NotFoundException') {
        // Domain not found in SES, consider this a success
        console.log(`⚠️ Domain not found in SES (already deleted): ${domain}`)
        return { success: true }
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete domain from AWS SES'
    }
  }
} 
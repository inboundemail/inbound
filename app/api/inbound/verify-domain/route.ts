import { NextRequest, NextResponse } from 'next/server'
import { SESClient, VerifyDomainIdentityCommand, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses'
import { getDomainWithRecords, updateDomainSesVerification, updateDomainStatus, areAllDnsRecordsVerified } from '@/lib/db/domains'
import { verifyDnsRecords } from '@/lib/dns-verification'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

// Check if AWS credentials are available
const awsRegion = process.env.AWS_REGION || 'us-west-2'
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

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { domain, domainId } = await request.json()

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      )
    }

    // Get domain record from database
    let domainRecord = await getDomainWithRecords(domain, session.user.id)
    if (!domainRecord) {
      return NextResponse.json(
        { error: 'Domain not found. Please run DNS check first.' },
        { status: 404 }
      )
    }

    // Check if AWS credentials are configured
    if (!sesClient) {
      return NextResponse.json(
        { 
          error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.',
          domain,
          domainId: domainRecord.id,
          verificationToken: '',
          status: 'failed' as const,
          dnsRecords: domainRecord.dnsRecords.map(r => ({
            type: r.recordType,
            name: r.name,
            value: r.value,
            isVerified: r.isVerified
          })),
          timestamp: new Date()
        },
        { status: 500 }
      )
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domainRegex.test(domain) || domain.length > 253) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      )
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

    // Get current verification status from AWS
    const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
      Identities: [domain]
    })

    const attributesResponse = await sesClient.send(getAttributesCommand)
    const attributes = attributesResponse.VerificationAttributes?.[domain]

    // Determine verification status
    let sesStatus = attributes?.VerificationStatus || 'Pending'
    let status: 'pending' | 'dns_verified' | 'ses_verified' | 'failed' = 'pending'
    
    if (sesStatus === 'Success') {
      status = 'ses_verified'
    } else if (sesStatus === 'Failed') {
      status = 'failed'
    }

    // Prepare DNS records that need to be added
    const requiredDnsRecords = [
      {
        type: 'TXT',
        name: `_amazonses.${domain}`,
        value: verificationToken || 'verification-token-not-available'
      },
      {
        type: 'MX',
        name: domain,
        value: `10 inbound-smtp.${awsRegion}.amazonaws.com`
      }
    ]

    // Update domain record in database with SES information
    if (!domainRecord.verificationToken) {
      await updateDomainSesVerification(
        domainRecord.id,
        verificationToken,
        sesStatus,
        requiredDnsRecords
      )
      
      // Refresh domain record to get updated DNS records
      const refreshedDomain = await getDomainWithRecords(domain, session.user.id)
      if (refreshedDomain) {
        domainRecord = refreshedDomain
      }
    }

    // Check DNS records if we have them
    let dnsRecordsWithStatus = domainRecord.dnsRecords.map(r => ({
      type: r.recordType,
      name: r.name,
      value: r.value,
      isVerified: r.isVerified
    }))

    // If SES is verified, check if all DNS records are properly configured
    if (sesStatus === 'Success') {
      const dnsChecks = await verifyDnsRecords(requiredDnsRecords)
      const allDnsVerified = dnsChecks.every(check => check.isVerified)
      
      if (allDnsVerified) {
        status = 'ses_verified'
        await updateDomainStatus(domainRecord.id, 'ses_verified')
      }

      // Update DNS records status with actual verification results
      dnsRecordsWithStatus = dnsChecks.map(check => ({
        type: check.type,
        name: check.name,
        value: check.expectedValue,
        isVerified: check.isVerified,
        actualValues: check.actualValues,
        error: check.error
      }))
    }

    const result = {
      domain,
      domainId: domainRecord.id,
      verificationToken: verificationToken || '',
      status,
      sesStatus,
      dnsRecords: dnsRecordsWithStatus,
      canProceed: status === 'ses_verified',
      timestamp: new Date()
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Domain verification error:', error)
    
    // Handle specific AWS errors
    if (error instanceof Error) {
      if (error.name === 'InvalidParameterValue') {
        return NextResponse.json(
          { error: 'Invalid domain parameter' },
          { status: 400 }
        )
      }
      if (error.name === 'LimitExceededException') {
        return NextResponse.json(
          { error: 'AWS SES limit exceeded' },
          { status: 429 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Failed to verify domain with AWS SES' },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { checkDomainCanReceiveEmails, verifyDnsRecords } from '@/lib/dns'
import { initiateDomainVerification, deleteDomainFromSES } from '@/lib/domain-verification'
import { getDomainWithRecords, updateDomainStatus, createDomainVerification, deleteDomainFromDatabase } from '@/lib/db/domains'
import { SESClient, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses-rules'
import { Autumn as autumn } from 'autumn-js'
import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq, count, and, sql } from 'drizzle-orm'

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

interface VerificationRequest {
  action: 'canDomainBeUsed' | 'addDomain' | 'checkVerification' | 'deleteDomain' | 'verifyDomain' | 'getDomain'
  domain: string
  domainId?: string
  refreshProvider?: boolean
}

interface CanDomainBeUsedResponse {
  success: boolean
  domain: string
  canBeUsed: boolean
  canReceiveEmails: boolean
  hasMxRecords: boolean
  hasConflictingRecords: boolean
  conflictingRecords?: Array<{
    type: string
    name: string
    value: string
  }>
  provider?: {
    name: string
    confidence: 'high' | 'medium' | 'low'
  }
  error?: string
  timestamp: Date
}

interface AddDomainResponse {
  success: boolean
  domain: string
  domainId: string
  verificationToken: string
  status: 'pending' | 'verified' | 'failed'
  sesStatus?: string
  dnsRecords: Array<{
    type: string
    name: string
    value: string
    isVerified: boolean
  }>
  canProceed: boolean
  error?: string
  timestamp: Date
}

interface CheckVerificationResponse {
  success: boolean
  domain: string
  domainId: string
  status: 'pending' | 'verified' | 'failed'
  sesStatus: string
  sesVerified: boolean
  dnsVerified: boolean
  allVerified: boolean
  dnsRecords: Array<{
    type: string
    name: string
    value: string
    isVerified: boolean
    actualValues?: string[]
    error?: string
  }>
  canProceed: boolean
  error?: string
  timestamp: Date
}

interface DeleteDomainResponse {
  success: boolean
  domain: string
  domainId: string
  message: string
  error?: string
  timestamp: Date
}

interface GetDomainResponse {
  success: boolean
  domain: {
    id: string
    domain: string
    status: string
    verificationToken: string
    canReceiveEmails: boolean
    hasMxRecords: boolean
    domainProvider?: string
    providerConfidence?: number
    lastDnsCheck?: Date
    lastSesCheck?: Date
    createdAt: Date
    updatedAt: Date
    canProceed: boolean
  }
  dnsRecords: Array<{
    type: string
    name: string
    value: string
    isVerified: boolean
    isRequired: boolean
    lastChecked?: Date
  }>
  emailAddresses: Array<{
    id: string
    address: string
    webhookId?: string
    webhookName?: string
    isActive: boolean
    isReceiptRuleConfigured: boolean
    receiptRuleName?: string
    createdAt: Date
    updatedAt: Date
    emailsLast24h: number
  }>
  stats: {
    totalEmailAddresses: number
    activeEmailAddresses: number
    configuredEmailAddresses: number
    totalEmailsLast24h: number
  }
  error?: string
  timestamp: Date
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let requestData: VerificationRequest | null = null

  try {
    console.log('🔍 Domain Verification API - Starting request processing')

    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      console.log('❌ Domain Verification API - Unauthorized access attempt')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request data
    try {
      requestData = await request.json()
      console.log('📥 Domain Verification API - Raw request data:', JSON.stringify(requestData, null, 2))
    } catch (parseError) {
      console.log('❌ Domain Verification API - Invalid JSON in request body')
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    if (!requestData) {
      console.log('⚠️ Domain Verification API - No request data provided')
      return NextResponse.json(
        { success: false, error: 'Request data is required' },
        { status: 400 }
      )
    }

    const { action, domain, domainId, refreshProvider } = requestData


    console.log(`🌐 Domain Verification API - Processing action: ${action} for domain: ${domain} by user: ${session.user.email} and domainId: ${domainId}`)

    // Validate required fields
    if (!action || !domain) {
      console.log('⚠️ Domain Verification API - Missing required fields (action or domain)')
      return NextResponse.json(
        { success: false, error: 'Action and domain are required' },
        { status: 400 }
      )
    }

    // Validate domain format (skip validation for getDomain action when domainId is provided)
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (action !== 'getDomain' && (!domainRegex.test(domain) || domain.length > 253)) {
      console.log(`⚠️ Domain Verification API - Invalid domain format: ${domain}`)
      return NextResponse.json(
        { success: false, error: 'Invalid domain format' },
        { status: 400 }
      )
    }
    
    // For getDomain action, we can skip domain format validation since we use domainId for lookup
    if (action === 'getDomain' && domainId && (!domainRegex.test(domain) || domain.length > 253)) {
      console.log(`ℹ️ Domain Verification API - Skipping domain format validation for getDomain action with domainId: ${domainId}`)
    }

    // Handle different actions
    switch (action) {
      case 'verifyDomain':
        return await handleVerifyDomain(domain, startTime)

      case 'canDomainBeUsed':
        return await handleCanDomainBeUsed(domain, session.user.id, startTime)

      case 'addDomain':
        return await handleAddDomain(domain, session.user.id, startTime)

      case 'checkVerification':
        if (!domainId || domainId.trim() === '') {
          console.log('⚠️ Domain Verification API - Missing domainId for checkVerification action. domainId:', domainId)
          return NextResponse.json(
            { success: false, error: 'domainId is required for checkVerification action' },
            { status: 400 }
          )
        }
        return await handleCheckVerification(domain, domainId, session.user.id, startTime)

      case 'getDomain':
        if (!domainId || domainId.trim() === '') {
          console.log('⚠️ Domain Verification API - Missing domainId for getDomain action. domainId:', domainId)
          return NextResponse.json(
            { success: false, error: 'domainId is required for getDomain action' },
            { status: 400 }
          )
        }
        return await handleGetDomain(domain, domainId, session.user.id, refreshProvider || false, startTime)

      case 'deleteDomain':
        if (!domainId) {
          console.log('⚠️ Domain Verification API - Missing domainId for deleteDomain action')
          return NextResponse.json(
            { success: false, error: 'domainId is required for deleteDomain action' },
            { status: 400 }
          )
        }
        return await handleDeleteDomain(domain, domainId, session.user.id, startTime)

      default:
        console.log(`⚠️ Domain Verification API - Invalid action: ${action}`)
        return NextResponse.json(
          { success: false, error: `Invalid action: ${action}. Must be one of: canDomainBeUsed, addDomain, checkVerification, getDomain, deleteDomain` },
          { status: 400 }
        )
    }

  } catch (error) {
    const duration = Date.now() - startTime
    const domain = requestData?.domain || 'unknown'
    const action = requestData?.action || 'unknown'

    console.error(`💥 Domain Verification API - Error processing ${action} for domain ${domain} after ${duration}ms:`, error)
    console.error(`   Error details:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      domain,
      action,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error occurred during domain verification',
        domain,
        timestamp: new Date()
      },
      { status: 500 }
    )
  }
}

async function handleCanDomainBeUsed(
  domain: string,
  userId: string,
  startTime: number
): Promise<NextResponse<CanDomainBeUsedResponse>> {
  try {
    console.log(`🔍 Can Domain Be Used - Checking domain: ${domain}`)

    // Check DNS records using server-side DNS utilities
    const dnsResult = await checkDomainCanReceiveEmails(domain)

    console.log(`📊 Can Domain Be Used - DNS check results for ${domain}:`, {
      canReceiveEmails: dnsResult.canReceiveEmails,
      hasMxRecords: dnsResult.hasMxRecords,
      provider: dnsResult.provider?.name,
      error: dnsResult.error
    })

    // Check for conflicting records (MX or CNAME on the same name)
    let hasConflictingRecords = false
    let conflictingRecords: Array<{ type: string; name: string; value: string }> = []

    // If domain has MX records, those are potential conflicts
    if (dnsResult.hasMxRecords && dnsResult.mxRecords) {
      hasConflictingRecords = true
      conflictingRecords = dnsResult.mxRecords.map(mx => ({
        type: 'MX',
        name: domain,
        value: `${mx.priority} ${mx.exchange}`
      }))
    }

    // TODO: Add CNAME record checking if needed
    // This would require additional DNS resolution logic

    const canBeUsed = dnsResult.canReceiveEmails && !hasConflictingRecords

    const duration = Date.now() - startTime
    console.log(`🏁 Can Domain Be Used - Completed for ${domain} in ${duration}ms - Result: ${canBeUsed ? 'CAN BE USED' : 'CANNOT BE USED'}`)

    const response: CanDomainBeUsedResponse = {
      success: true,
      domain,
      canBeUsed,
      canReceiveEmails: dnsResult.canReceiveEmails,
      hasMxRecords: dnsResult.hasMxRecords,
      hasConflictingRecords,
      conflictingRecords: conflictingRecords.length > 0 ? conflictingRecords : undefined,
      provider: dnsResult.provider,
      error: dnsResult.error,
      timestamp: new Date()
    }

    return NextResponse.json(response)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`💥 Can Domain Be Used - Error for domain ${domain} after ${duration}ms:`, error)

    const response: CanDomainBeUsedResponse = {
      success: false,
      domain,
      canBeUsed: false,
      canReceiveEmails: false,
      hasMxRecords: false,
      hasConflictingRecords: false,
      error: error instanceof Error ? error.message : 'Failed to check domain availability',
      timestamp: new Date()
    }

    return NextResponse.json(response, { status: 500 })
  }
}

async function handleAddDomain(
  domain: string,
  userId: string,
  startTime: number
): Promise<NextResponse<AddDomainResponse>> {
  try {
    console.log(`🚀 Add Domain - Starting domain addition for domain: ${domain}`)

    // Check if domain exists in database
    const existingDomain = await getDomainWithRecords(domain, userId)
    if (existingDomain) {
      console.log(`❌ Add Domain - Domain already exists in database: ${domain}`)
      const response: AddDomainResponse = {
        success: false,
        domain,
        domainId: existingDomain.id,
        verificationToken: existingDomain.verificationToken || '',
        status: existingDomain.status as 'pending' | 'verified' | 'failed',
        dnsRecords: existingDomain.dnsRecords.map(r => ({
          type: r.recordType,
          name: r.name,
          value: r.value,
          isVerified: r.isVerified ?? false
        })),
        canProceed: true,
        error: 'Domain already exists',
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 400 })
    }

    // Check Autumn domain limits before proceeding
    console.log(`🔍 Add Domain - Checking Autumn domain limits for user: ${userId}`)
    const { data: domainCheck, error: domainCheckError } = await autumn.check({
      customer_id: userId,
      feature_id: "domains",
    })

    console.log(await autumn.check({customer_id: userId, feature_id: "domains"}))

    if (domainCheckError) {
      console.error('Add Domain - Autumn domain check error:', domainCheckError)
      const response: AddDomainResponse = {
        success: false,
        domain,
        domainId: '',
        verificationToken: '',
        status: 'failed',
        dnsRecords: [],
        canProceed: false,
        error: 'Failed to check domain limits',
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 500 })
    }

    console.log('domainCheck', domainCheck)

    if (!domainCheck?.allowed) {
      console.log(`❌ Add Domain - Domain limit reached for user: ${userId}`)
      const response: AddDomainResponse = {
        success: false,
        domain,
        domainId: '',
        verificationToken: '',
        status: 'failed',
        dnsRecords: [],
        canProceed: false,
        error: 'Domain limit reached. Please upgrade your plan to add more domains.',
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 403 })
    }

    console.log(`✅ Add Domain - Domain limits check passed for user: ${userId}`, {
      allowed: domainCheck.allowed,
      balance: domainCheck.balance,
      unlimited: domainCheck.unlimited
    })

    // Step 1: Check DNS records first
    console.log(`🔍 Add Domain - Checking DNS records for ${domain}`)
    const dnsResult = await checkDomainCanReceiveEmails(domain)

    // Step 2: Create domain record in database with pending status
    console.log(`💾 Add Domain - Creating domain record in database`)
    const domainRecord = await createDomainVerification(
      domain,
      userId,
      {
        canReceiveEmails: dnsResult.canReceiveEmails,
        hasMxRecords: dnsResult.hasMxRecords,
        provider: dnsResult.provider
      }
    )

    // Step 3: Use the shared verification function to initiate SES verification
    const verificationResult = await initiateDomainVerification(domain, userId)

    // Step 4: Track domain usage with Autumn (only if not unlimited)
    if (!domainCheck.unlimited) {
      console.log(`📊 Add Domain - Tracking domain usage with Autumn for user: ${userId}`)
      const { error: trackError } = await autumn.track({
        customer_id: userId,
        feature_id: "domains",
        value: 1,
      })

      if (trackError) {
        console.error('Add Domain - Failed to track domain usage:', trackError)
        // Don't fail the domain creation if tracking fails, just log it
        console.warn(`⚠️ Add Domain - Domain created but usage tracking failed for user: ${userId}`)
      } else {
        console.log(`✅ Add Domain - Successfully tracked domain usage for user: ${userId}`)
      }
    } else {
      console.log(`♾️ Add Domain - User has unlimited domains, no tracking needed for user: ${userId}`)
    }

    // Map old status values to new simplified enum
    let mappedStatus: 'pending' | 'verified' | 'failed' = 'pending'
    if (verificationResult.status === 'verified') {
      mappedStatus = 'verified'
    } else if (verificationResult.status === 'failed') {
      mappedStatus = 'failed'
    } else {
      mappedStatus = 'pending'
    }

    const duration = Date.now() - startTime
    console.log(`🏁 Add Domain - Completed for ${domain} in ${duration}ms - Status: ${mappedStatus}`)

    const response: AddDomainResponse = {
      success: true,
      domain: verificationResult.domain,
      domainId: verificationResult.domainId,
      verificationToken: verificationResult.verificationToken,
      status: mappedStatus,
      sesStatus: verificationResult.sesStatus,
      dnsRecords: verificationResult.dnsRecords,
      canProceed: verificationResult.canProceed,
      error: verificationResult.error,
      timestamp: new Date()
    }

    return NextResponse.json(response)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`💥 Add Domain - Error for domain ${domain} after ${duration}ms:`, error)

    const response: AddDomainResponse = {
      success: false,
      domain,
      domainId: '',
      verificationToken: '',
      status: 'failed',
      dnsRecords: [],
      canProceed: false,
      error: error instanceof Error ? error.message : 'Failed to add domain',
      timestamp: new Date()
    }

    return NextResponse.json(response, { status: 500 })
  }
}

async function handleCheckVerification(
  domain: string,
  domainId: string,
  userId: string,
  startTime: number
): Promise<NextResponse<CheckVerificationResponse>> {
  try {
    console.log(`✅ Check Verification - Checking verification status for domain: ${domain}`)

    // Get domain record from database
    const domainRecord = await getDomainWithRecords(domain, userId)
    if (!domainRecord) {
      console.log(`❌ Check Verification - Domain not found: ${domain}`)
      const response: CheckVerificationResponse = {
        success: false,
        domain,
        domainId,
        status: 'failed',
        sesStatus: 'NotFound',
        sesVerified: false,
        dnsVerified: false,
        allVerified: false,
        dnsRecords: [],
        canProceed: false,
        error: 'Domain not found',
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 404 })
    }

    console.log(`📋 Check Verification - Found ${domainRecord.dnsRecords.length} DNS records to verify`)

    // Step 1: Check SES verification status
    let sesVerified = false
    let sesStatus = 'Pending'

    if (sesClient) {
      try {
        console.log(`🔍 Check Verification - Checking SES status for ${domain}`)
        const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
          Identities: [domain]
        })

        const attributesResponse = await sesClient.send(getAttributesCommand)
        const attributes = attributesResponse.VerificationAttributes?.[domain]

        if (attributes) {
          sesStatus = attributes.VerificationStatus || 'Pending'
          sesVerified = sesStatus === 'Success'
          console.log(`📊 Check Verification - SES status for ${domain}: ${sesStatus}`)
        } else {
          console.log(`⚠️ Check Verification - No SES verification attributes found for ${domain}`)
        }
      } catch (sesError) {
        console.error(`❌ Check Verification - SES check failed for ${domain}:`, sesError)
        sesStatus = 'Error'
      }
    } else {
      console.log(`⚠️ Check Verification - SES client not available`)
      sesStatus = 'NotConfigured'
    }

    // Step 2: Check DNS records verification
    const recordsToCheck = domainRecord.dnsRecords.map(r => ({
      type: r.recordType,
      name: r.name,
      value: r.value
    }))

    console.log(`🔎 Check Verification - Verifying ${recordsToCheck.length} DNS records`)
    const dnsChecks = await verifyDnsRecords(recordsToCheck)

    // Log DNS verification results
    console.log(`📊 Check Verification - DNS verification results:`)
    dnsChecks.forEach((check, index) => {
      const status = check.isVerified ? '✅' : '❌'
      console.log(`   ${index + 1}. ${status} ${check.type} ${check.name} - ${check.isVerified ? 'VERIFIED' : 'FAILED'}`)
      if (!check.isVerified && check.error) {
        console.log(`      Error: ${check.error}`)
      }
    })

    const dnsVerified = dnsChecks.every(check => check.isVerified)
    const allVerified = sesVerified && dnsVerified

    console.log(`📈 Check Verification - Verification summary for ${domain}:`, {
      sesVerified,
      dnsVerified,
      allVerified
    })

    // Step 3: Update domain status if needed
    let newStatus: 'pending' | 'verified' | 'failed' = domainRecord.status as 'pending' | 'verified' | 'failed'
    if (allVerified && sesVerified) {
      newStatus = 'verified'
    } else if (!dnsVerified) {
      newStatus = 'pending'
    }

    if (newStatus !== domainRecord.status) {
      console.log(`📝 Check Verification - Updating domain status from ${domainRecord.status} to ${newStatus}`)
      await updateDomainStatus(domainRecord.id, newStatus)
    }

    const duration = Date.now() - startTime
    console.log(`🏁 Check Verification - Completed for ${domain} in ${duration}ms - All verified: ${allVerified}`)

    const response: CheckVerificationResponse = {
      success: true,
      domain,
      domainId,
      status: newStatus,
      sesStatus,
      sesVerified,
      dnsVerified,
      allVerified,
      dnsRecords: dnsChecks.map(check => ({
        type: check.type,
        name: check.name,
        value: check.expectedValue,
        isVerified: check.isVerified,
        actualValues: check.actualValues,
        error: check.error
      })),
      canProceed: allVerified,
      timestamp: new Date()
    }

    return NextResponse.json(response)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`💥 Check Verification - Error for domain ${domain} after ${duration}ms:`, error)

    const response: CheckVerificationResponse = {
      success: false,
      domain,
      domainId,
      status: 'failed',
      sesStatus: 'Error',
      sesVerified: false,
      dnsVerified: false,
      allVerified: false,
      dnsRecords: [],
      canProceed: false,
      error: error instanceof Error ? error.message : 'Failed to check verification status',
      timestamp: new Date()
    }

    return NextResponse.json(response, { status: 500 })
  }
}

async function handleVerifyDomain(
  domain: string,
  startTime: number
): Promise<NextResponse<CheckVerificationResponse>> {
  try {
    console.log(`✅ Verify Domain - Checking verification status for domain: ${domain}`)

    // Step 1: Check SES verification status
    let sesVerified = false
    let sesStatus = 'Pending'

    if (sesClient) {
      try {
        console.log(`🔍 Verify Domain - Checking SES status for ${domain}`)
        const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
          Identities: [domain]
        })

        console.log('📦 getAttributesCommand', getAttributesCommand)

        const attributesResponse = await sesClient.send(getAttributesCommand)
        const attributes = attributesResponse.VerificationAttributes?.[domain]

        if (attributes) {
          sesStatus = attributes.VerificationStatus || 'Pending'
          sesVerified = sesStatus === 'Success'
          console.log(`📊 Check Verification - SES status for ${domain}: ${sesStatus}`)
        } else {
          console.log(`⚠️ Check Verification - No SES verification attributes found for ${domain}`)
        }
      } catch (sesError) {
        console.error(`❌ Check Verification - SES check failed for ${domain}:`, sesError)
        sesStatus = 'Error'
      }
    } else {
      console.log(`⚠️ Check Verification - SES client not available`)
      sesStatus = 'NotConfigured'
    }

    // Step 2: Check DNS records verification

    const recordsToCheck = [
      {
        type: 'TXT',
        name: '_amazonses.domain.com',
        value: '1234567890'
      }
    ]
    const dnsChecks = await verifyDnsRecords(recordsToCheck)

    // Log DNS verification results
    console.log(`📊 Check Verification - DNS verification results:`)
    dnsChecks.forEach((check, index) => {
      const status = check.isVerified ? '✅' : '❌'
      console.log(`   ${index + 1}. ${status} ${check.type} ${check.name} - ${check.isVerified ? 'VERIFIED' : 'FAILED'}`)
      if (!check.isVerified && check.error) {
        console.log(`      Error: ${check.error}`)
      }
    })

    const dnsVerified = dnsChecks.every(check => check.isVerified)
    const allVerified = sesVerified && dnsVerified

    console.log(`📈 Check Verification - Verification summary for ${domain}:`, {
      sesVerified,
      dnsVerified,
      allVerified
    })

    const duration = Date.now() - startTime
    console.log(`🏁 Check Verification - Completed for ${domain} in ${duration}ms - All verified: ${allVerified}`)

    const response: CheckVerificationResponse = {
      success: true,
      domain,
      domainId: '123',
      status: 'verified',
      sesStatus,
      sesVerified,
      dnsVerified,
      allVerified,
      dnsRecords: dnsChecks.map(check => ({
        type: check.type,
        name: check.name,
        value: check.expectedValue,
        isVerified: check.isVerified,
        actualValues: check.actualValues,
        error: check.error
      })),
      canProceed: allVerified,
      timestamp: new Date()
    }

    return NextResponse.json(response)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`💥 Check Verification - Error for domain ${domain} after ${duration}ms:`, error)

    const response: CheckVerificationResponse = {
      success: false,
      domain,
      domainId: '123',
      status: 'failed',
      sesStatus: 'Error',
      sesVerified: false,
      dnsVerified: false,
      allVerified: false,
      dnsRecords: [],
      canProceed: false,
      error: error instanceof Error ? error.message : 'Failed to check verification status',
      timestamp: new Date()
    }

    return NextResponse.json(response, { status: 500 })
  }
}

async function handleDeleteDomain(
  domain: string,
  domainId: string,
  userId: string,
  startTime: number
): Promise<NextResponse<DeleteDomainResponse>> {
  try {
    console.log(`🗑️ Delete Domain - Starting domain deletion for domain: ${domain}, domainId: ${domainId}`)

    // Verify domain ownership first
    const domainRecord = await getDomainWithRecords(domain, userId)
    if (!domainRecord || domainRecord.id !== domainId) {
      console.log(`❌ Delete Domain - Domain not found or access denied: ${domain}`)
      const response: DeleteDomainResponse = {
        success: false,
        domain,
        domainId,
        message: '',
        error: 'Domain not found or access denied',
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 404 })
    }

    console.log(`✅ Delete Domain - Domain ownership verified for: ${domain}`)

    // Step 1: Remove SES receipt rules first (if domain is verified)
    if (domainRecord.status === 'verified') {
      try {
        console.log(`🔧 Delete Domain - Removing SES receipt rules for: ${domain}`)
        const sesRuleManager = new AWSSESReceiptRuleManager()
        const ruleRemoved = await sesRuleManager.removeEmailReceiving(domain)

        if (ruleRemoved) {
          console.log(`✅ Delete Domain - SES receipt rules removed for: ${domain}`)
        } else {
          console.log(`⚠️ Delete Domain - Failed to remove SES receipt rules for: ${domain}`)
        }
      } catch (error) {
        console.error('Delete Domain - Error removing SES receipt rules:', error)
        // Continue with deletion even if receipt rule removal fails
      }
    }

    // Step 2: Delete domain identity from SES
    console.log(`🗑️ Delete Domain - Deleting domain identity from SES: ${domain}`)
    const sesDeleteResult = await deleteDomainFromSES(domain)

    if (!sesDeleteResult.success) {
      console.error(`❌ Delete Domain - Failed to delete domain from SES: ${sesDeleteResult.error}`)
      const response: DeleteDomainResponse = {
        success: false,
        domain,
        domainId,
        message: '',
        error: `Failed to delete domain from AWS SES: ${sesDeleteResult.error}`,
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 500 })
    }

    console.log(`✅ Delete Domain - Domain deleted from SES: ${domain}`)

    // Step 3: Delete domain and related records from database
    console.log(`🗑️ Delete Domain - Deleting domain from database: ${domain}`)
    const dbDeleteResult = await deleteDomainFromDatabase(domainId, userId)

    if (!dbDeleteResult.success) {
      console.error(`❌ Delete Domain - Failed to delete domain from database: ${dbDeleteResult.error}`)
      const response: DeleteDomainResponse = {
        success: false,
        domain,
        domainId,
        message: '',
        error: `Failed to delete domain from database: ${dbDeleteResult.error}`,
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 500 })
    }

    console.log(`✅ Delete Domain - Domain deleted from database: ${domain}`)

    // Step 4: Track domain deletion with Autumn to free up domain spot
    console.log(`📊 Delete Domain - Tracking domain deletion with Autumn for user: ${userId}`)
    const { error: trackError } = await autumn.track({
      customer_id: userId,
      feature_id: "domains",
      value: -1,
    })

    if (trackError) {
      console.error('Delete Domain - Failed to track domain deletion:', trackError)
      // Don't fail the deletion if tracking fails, just log it
      console.warn(`⚠️ Delete Domain - Domain deleted but usage tracking failed for user: ${userId}`)
    } else {
      console.log(`✅ Delete Domain - Successfully tracked domain deletion for user: ${userId}`)
    }

    const duration = Date.now() - startTime
    console.log(`🏁 Delete Domain - Completed deletion for ${domain} in ${duration}ms`)

    const response: DeleteDomainResponse = {
      success: true,
      domain,
      domainId,
      message: 'Domain deleted successfully',
      timestamp: new Date()
    }

    return NextResponse.json(response)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`💥 Delete Domain - Error for domain ${domain} after ${duration}ms:`, error)

    const response: DeleteDomainResponse = {
      success: false,
      domain,
      domainId,
      message: '',
      error: error instanceof Error ? error.message : 'Failed to delete domain',
      timestamp: new Date()
    }

    return NextResponse.json(response, { status: 500 })
  }
}

async function handleGetDomain(
  domain: string,
  domainId: string,
  userId: string,
  refreshProvider: boolean,
  startTime: number
): Promise<NextResponse<GetDomainResponse>> {
  try {
    console.log(`📋 Get Domain - Fetching domain details for: ${domain}, domainId: ${domainId}`)

    // Get domain record
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, userId)))
      .limit(1)

    if (!domainRecord[0]) {
      console.log(`❌ Get Domain - Domain not found: ${domain}`)
      const response: GetDomainResponse = {
        success: false,
        domain: {
          id: '',
          domain: '',
          status: '',
          verificationToken: '',
          canReceiveEmails: false,
          hasMxRecords: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          canProceed: false
        },
        dnsRecords: [],
        emailAddresses: [],
        stats: {
          totalEmailAddresses: 0,
          activeEmailAddresses: 0,
          configuredEmailAddresses: 0,
          totalEmailsLast24h: 0
        },
        error: 'Domain not found',
        timestamp: new Date()
      }
      return NextResponse.json(response, { status: 404 })
    }

    let domainData = domainRecord[0]

    // Refresh domain provider if requested
    if (refreshProvider) {
      try {
        console.log(`🔍 Get Domain - Refreshing domain provider for: ${domainData.domain}`)
        
        // Import detectDomainProvider function
        const { detectDomainProvider } = await import('@/lib/dns')
        const providerInfo = await detectDomainProvider(domainData.domain)
        
        if (providerInfo) {
          console.log(`✅ Get Domain - Provider detected: ${providerInfo.name} (${providerInfo.confidence} confidence)`)
          
          // Update domain record with new provider information
          const [updatedDomain] = await db
            .update(emailDomains)
            .set({
              domainProvider: providerInfo.name,
              providerConfidence: providerInfo.confidence,
              lastDnsCheck: new Date(),
              updatedAt: new Date()
            })
            .where(eq(emailDomains.id, domainId))
            .returning()
          
          if (updatedDomain) {
            domainData = updatedDomain
            console.log(`💾 Get Domain - Updated domain provider: ${providerInfo.name}`)
          }
        } else {
          console.log(`⚠️ Get Domain - No provider detected for domain: ${domainData.domain}`)
        }
      } catch (error) {
        console.error('Get Domain - Error refreshing domain provider:', error)
        // Continue with existing domain data if provider refresh fails
      }
    }

    // Perform comprehensive SES verification check if refreshProvider=true
    let updatedDomain = domainData
    if (refreshProvider && sesClient) {
      try {
        console.log(`🔍 Get Domain - Performing comprehensive SES verification check for domain: ${domainData.domain}`)
        
        // Get current verification status from AWS SES
        const getAttributesCommand = new GetIdentityVerificationAttributesCommand({
          Identities: [domainData.domain]
        })

        const attributesResponse = await sesClient.send(getAttributesCommand)
        const attributes = attributesResponse.VerificationAttributes?.[domainData.domain]

        if (attributes) {
          const sesStatus = attributes.VerificationStatus || 'Pending'
          console.log(`📊 Get Domain - AWS SES verification status for ${domainData.domain}: ${sesStatus}`)
          
          // Import DOMAIN_STATUS
          const { DOMAIN_STATUS } = await import('@/lib/db/schema')
          
          // Determine new domain status based on SES response
          let newStatus = domainData.status
          if (sesStatus === 'Success') {
            newStatus = DOMAIN_STATUS.VERIFIED
          } else if (sesStatus === 'Failed') {
            newStatus = DOMAIN_STATUS.FAILED
          }
          
          // Update domain record if status changed
          if (newStatus !== domainData.status) {
            console.log(`📝 Get Domain - Updating domain status from ${domainData.status} to ${newStatus}, SES status: ${sesStatus}`)
            
            const [updated] = await db
              .update(emailDomains)
              .set({
                status: newStatus,
                lastSesCheck: new Date(),
                updatedAt: new Date()
              })
              .where(eq(emailDomains.id, domainId))
              .returning()
            
            if (updated) {
              updatedDomain = updated
              console.log(`✅ Get Domain - Updated domain status successfully`)
            }
          } else {
            console.log(`ℹ️ Get Domain - Domain status unchanged, updating last check time`)
            
            // Still update the last check time
            const [updated] = await db
              .update(emailDomains)
              .set({
                lastSesCheck: new Date(),
                updatedAt: new Date()
              })
              .where(eq(emailDomains.id, domainId))
              .returning()
              
            if (updated) {
              updatedDomain = updated
            }
          }
        } else {
          console.log(`⚠️ Get Domain - No verification attributes found for domain: ${domainData.domain}`)
        }
      } catch (error) {
        console.error('Get Domain - Error performing comprehensive SES verification check:', error)
        // Continue with existing domain data if SES check fails
      }
    } else if (refreshProvider && !sesClient) {
      console.log(`⚠️ Get Domain - SES client not available for comprehensive verification check`)
    } else {
      // Auto-check SES verification if domain is in verified status
      const { DOMAIN_STATUS } = await import('@/lib/db/schema')
      if (domainData.status === DOMAIN_STATUS.VERIFIED) {
        try {
          console.log(`Get Domain - Auto-checking SES verification for domain: ${domainData.domain}`)
          const verificationResult = await initiateDomainVerification(domainData.domain, userId)
          
          // If status changed, get the updated domain record
          if (verificationResult.status === DOMAIN_STATUS.VERIFIED) {
            const updatedDomainRecord = await db
              .select()
              .from(emailDomains)
              .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, userId)))
              .limit(1)
            
            if (updatedDomainRecord[0]) {
              updatedDomain = updatedDomainRecord[0]
              console.log(`Get Domain - Domain status updated from ${domainData.status} to ${updatedDomain.status}`)
            }
          }
        } catch (error) {
          console.error('Get Domain - Error auto-checking SES verification:', error)
          // Continue with original domain data if verification check fails
        }
      }
    }

    // Get DNS records
    const { domainDnsRecords } = await import('@/lib/db/schema')
    const dnsRecords = await db
      .select()
      .from(domainDnsRecords)
      .where(eq(domainDnsRecords.domainId, domainId))

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Get email addresses with their statistics and webhook information
    const { emailAddresses, webhooks, sesEvents } = await import('@/lib/db/schema')
    const emailAddressesWithStats = await db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        webhookId: emailAddresses.webhookId,
        webhookName: webhooks.name,
        isActive: emailAddresses.isActive,
        isReceiptRuleConfigured: emailAddresses.isReceiptRuleConfigured,
        receiptRuleName: emailAddresses.receiptRuleName,
        createdAt: emailAddresses.createdAt,
        updatedAt: emailAddresses.updatedAt,
        emailsLast24h: sql<number>`COALESCE(${sql`(
          SELECT COUNT(*)::int 
          FROM ${sesEvents} 
          WHERE EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(${sesEvents.destination}::jsonb) AS dest_email
            WHERE dest_email = ${emailAddresses.address}
          )
          AND ${sesEvents.timestamp} >= ${twentyFourHoursAgo}
        )`}, 0)`
      })
      .from(emailAddresses)
      .leftJoin(webhooks, eq(emailAddresses.webhookId, webhooks.id))
      .where(eq(emailAddresses.domainId, domainId))
      .orderBy(emailAddresses.createdAt)

    // Transform DNS records for frontend
    const transformedDnsRecords = dnsRecords.map(record => ({
      type: record.recordType,
      name: record.name,
      value: record.value,
      isVerified: record.isVerified ?? false,
      isRequired: record.isRequired ?? false,
      lastChecked: record.lastChecked ?? undefined
    }))

    // Calculate verification status
    const { DOMAIN_STATUS } = await import('@/lib/db/schema')
    const allRequiredDnsVerified = dnsRecords
      .filter(record => record.isRequired)
      .every(record => record.isVerified)

    const canProceed = updatedDomain.status === DOMAIN_STATUS.VERIFIED || 
      (updatedDomain.status === DOMAIN_STATUS.VERIFIED && allRequiredDnsVerified)

    const duration = Date.now() - startTime
    console.log(`🏁 Get Domain - Completed for ${domain} in ${duration}ms`)

    const response: GetDomainResponse = {
      success: true,
      domain: {
        id: updatedDomain.id,
        domain: updatedDomain.domain,
        status: updatedDomain.status,
        verificationToken: updatedDomain.verificationToken || '',
        canReceiveEmails: updatedDomain.canReceiveEmails ?? false,
        hasMxRecords: updatedDomain.hasMxRecords ?? false,
        domainProvider: updatedDomain.domainProvider || undefined,
        providerConfidence: typeof updatedDomain.providerConfidence === 'string' ? undefined : updatedDomain.providerConfidence || undefined,
        lastDnsCheck: updatedDomain.lastDnsCheck || undefined,
        lastSesCheck: updatedDomain.lastSesCheck || undefined,
        createdAt: updatedDomain.createdAt || new Date(),
        updatedAt: updatedDomain.updatedAt || new Date(),
        canProceed
      },
      dnsRecords: transformedDnsRecords,
      emailAddresses: emailAddressesWithStats.map(email => ({
        id: email.id,
        address: email.address,
        webhookId: email.webhookId || undefined,
        webhookName: email.webhookName || undefined,
        isActive: email.isActive ?? false,
        isReceiptRuleConfigured: email.isReceiptRuleConfigured ?? false,
        receiptRuleName: email.receiptRuleName || undefined,
        createdAt: email.createdAt || new Date(),
        updatedAt: email.updatedAt || new Date(),
        emailsLast24h: email.emailsLast24h || 0
      })),
      stats: {
        totalEmailAddresses: emailAddressesWithStats.length,
        activeEmailAddresses: emailAddressesWithStats.filter(email => email.isActive).length,
        configuredEmailAddresses: emailAddressesWithStats.filter(email => email.isReceiptRuleConfigured).length,
        totalEmailsLast24h: emailAddressesWithStats.reduce((sum, email) => sum + email.emailsLast24h, 0)
      },
      timestamp: new Date()
    }

    return NextResponse.json(response)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`💥 Get Domain - Error for domain ${domain} after ${duration}ms:`, error)

    const response: GetDomainResponse = {
      success: false,
      domain: {
        id: '',
        domain: '',
        status: '',
        verificationToken: '',
        canReceiveEmails: false,
        hasMxRecords: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        canProceed: false
      },
      dnsRecords: [],
      emailAddresses: [],
      stats: {
        totalEmailAddresses: 0,
        activeEmailAddresses: 0,
        configuredEmailAddresses: 0,
        totalEmailsLast24h: 0
      },
      error: error instanceof Error ? error.message : 'Failed to fetch domain details',
      timestamp: new Date()
    }

    return NextResponse.json(response, { status: 500 })
  }
}
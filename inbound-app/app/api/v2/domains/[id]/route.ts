import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints, domainDnsRecords } from '@/lib/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'
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
 * GET /api/v2/domains/{id}
 * Gets detailed information about a specific domain
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/domains/{id} types
export interface GetDomainByIdRequest {
    id: string // from params
}

export interface DomainStats {
    totalEmailAddresses: number
    activeEmailAddresses: number
    emailsLast24h: number
    emailsLast7d: number
    emailsLast30d: number
}

export interface GetDomainByIdResponse {
    id: string
    domain: string
    status: string
    canReceiveEmails: boolean
    hasMxRecords: boolean
    domainProvider: string | null
    providerConfidence: string | null
    lastDnsCheck: Date | null
    lastSesCheck: Date | null
    isCatchAllEnabled: boolean
    catchAllEndpointId: string | null
    createdAt: Date
    updatedAt: Date
    userId: string
    stats: DomainStats
    catchAllEndpoint?: {
        id: string
        name: string
        type: string
        isActive: boolean
    } | null
    // Additional fields when check=true
    verificationCheck?: {
        dnsRecords?: Array<{
            type: string
            name: string
            value: string
            isVerified: boolean
            error?: string
        }>
        sesStatus?: string
        dkimStatus?: string
        dkimVerified?: boolean
        dkimTokens?: string[]
        mailFromDomain?: string
        mailFromStatus?: string
        mailFromVerified?: boolean
        isFullyVerified?: boolean
        lastChecked?: Date
    }
    // Recommendations when records are missing
    authRecommendations?: {
        spf?: { name: string; value: string; description: string }
        dmarc?: { name: string; value: string; description: string }
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    console.log('🌐 GET /api/v2/domains/{id} - Starting request for domain:', id)
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        console.log('✅ Authentication successful for userId:', userId)

        // Extract query parameters
        const { searchParams } = new URL(request.url)
        const check = searchParams.get('check') === 'true'
        
        if (check) {
            console.log('🔍 Check parameter detected - will perform verification check')
        }

        // Get domain with user verification
        console.log('🔍 Querying domain from database')
        const domainResult = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, id),
                eq(emailDomains.userId, userId)
            ))
            .limit(1)

        if (!domainResult[0]) {
            console.log('❌ Domain not found for user:', userId, 'domain:', id)
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            )
        }

        const domain = domainResult[0]
        console.log('✅ Found domain:', domain.domain, 'status:', domain.status)

        // Get domain statistics
        console.log('📊 Calculating domain statistics')
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
            console.log('🔍 Getting catch-all endpoint information')
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
            
            catchAllEndpoint = endpointResult[0] || null
        }

        // Calculate time-based email statistics (simplified for now)
        const stats: DomainStats = {
            totalEmailAddresses: emailCount,
            activeEmailAddresses: activeEmailCount,
            emailsLast24h: 0, // TODO: Implement actual email counting
            emailsLast7d: 0,
            emailsLast30d: 0
        }

        // Get recent emails (simplified for now)
        const recentEmails: Array<{
            id: string
            from: string
            to: string
            subject: string
            receivedAt: Date
            status: string
        }> = [] // TODO: Implement actual recent emails query

        console.log('✅ Successfully retrieved domain details')

        // Prepare base response
        let response: GetDomainByIdResponse = {
            id: domain.id,
            domain: domain.domain,
            status: domain.status,
            canReceiveEmails: domain.canReceiveEmails || false,
            hasMxRecords: domain.hasMxRecords || false,
            domainProvider: domain.domainProvider,
            providerConfidence: domain.providerConfidence,
            lastDnsCheck: domain.lastDnsCheck,
            lastSesCheck: domain.lastSesCheck,
            isCatchAllEnabled: domain.isCatchAllEnabled || false,
            catchAllEndpointId: domain.catchAllEndpointId,
            createdAt: domain.createdAt || new Date(),
            updatedAt: domain.updatedAt || new Date(),
            userId: domain.userId,
            stats,
            catchAllEndpoint: catchAllEndpoint ? {
                ...catchAllEndpoint,
                isActive: catchAllEndpoint.isActive || false
            } : null
        }

        // If check=true, perform DNS and SES verification checks
        if (check) {
            console.log(`🔍 Performing verification check for domain: ${domain.domain}`)
            
            try {
                // Get DNS records from database
                const dnsRecords = await db
                    .select()
                    .from(domainDnsRecords)
                    .where(eq(domainDnsRecords.domainId, domain.id))

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
                }> = dnsRecords.map(record => ({
                    type: record.recordType,
                    name: record.name,
                    value: record.value,
                    dbId: record.id
                }))
                
                // Also check for SPF and DMARC even if not in database
                const spfRecord = dnsRecords.find(r => r.recordType === 'TXT' && r.name === domain.domain && (r.value || '').toLowerCase().includes('v=spf1'))
                if (!spfRecord) {
                    // Add SPF to verification list
                    recordsToVerify.push({
                        type: 'TXT',
                        name: domain.domain,
                        value: 'v=spf1 include:amazonses.com ~all',
                        dbId: null
                    })
                }
                
                const dmarcRecord = dnsRecords.find(r => r.recordType === 'TXT' && r.name === `_dmarc.${domain.domain}`)
                if (!dmarcRecord) {
                    // Add DMARC to verification list
                    recordsToVerify.push({
                        type: 'TXT',
                        name: `_dmarc.${domain.domain}`,
                        value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
                        dbId: null
                    })
                }

                if (recordsToVerify.length > 0) {
                    // Verify DNS records
                    console.log(`🔍 Verifying ${recordsToVerify.length} DNS records (including SPF/DMARC checks)`)
                    const results = await verifyDnsRecords(
                        recordsToVerify.map(record => ({
                            type: record.type,
                            name: record.name,
                            value: record.value
                        }))
                    )

                    verificationResults = results.map((result, index) => ({
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
                        console.log(`🔍 Checking SES verification status`)
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
                        
                        // Update domain status based on SES verification
                        if (sesStatus === 'Success' && domain.status !== 'verified') {
                            await db
                                .update(emailDomains)
                                .set({
                                    status: 'verified',
                                    lastSesCheck: new Date(),
                                    updatedAt: new Date()
                                })
                                .where(eq(emailDomains.id, domain.id))
                            response.status = 'verified'
                        } else if (sesStatus === 'Failed' && domain.status !== 'failed') {
                            await db
                                .update(emailDomains)
                                .set({
                                    status: 'failed',
                                    lastSesCheck: new Date(),
                                    updatedAt: new Date()
                                })
                                .where(eq(emailDomains.id, domain.id))
                            response.status = 'failed'
                        } else {
                            // Just update last check time
                            await db
                                .update(emailDomains)
                                .set({
                                    lastSesCheck: new Date()
                                })
                                .where(eq(emailDomains.id, domain.id))
                        }
                    } catch (sesError) {
                        console.error(`❌ SES verification check failed:`, sesError)
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

                console.log(`✅ Verification check complete for ${domain.domain}:`, {
                    dnsVerified: allDnsVerified,
                    sesStatus,
                    dkimStatus,
                    mailFromStatus,
                    isFullyVerified
                })

            } catch (checkError) {
                console.error(`❌ Verification check failed for ${domain.domain}:`, checkError)
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
                // Check verification results to see if SPF/DMARC are verified
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
                
                const recommendations: GetDomainByIdResponse['authRecommendations'] = {}
                
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
                console.warn('⚠️ Failed to build auth recommendations:', recError)
            }
        }

        return NextResponse.json(response)

    } catch (error) {
        console.error('❌ GET /api/v2/domains/{id} - Error:', error)
        return NextResponse.json(
            { 
                error: 'Failed to fetch domain details',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}

/**
 * PUT /api/v2/domains/{id}
 * Updates domain catch-all settings (enable/disable with endpoint configuration)
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// PUT /api/v2/domains/{id} types
export interface PutDomainByIdRequest {
    isCatchAllEnabled: boolean
    catchAllEndpointId?: string | null
}

export interface PutDomainByIdResponse {
    id: string
    domain: string
    status: string
    isCatchAllEnabled: boolean
    catchAllEndpointId: string | null
    catchAllEndpoint?: {
        id: string
        name: string
        type: string
        isActive: boolean
    } | null
    receiptRuleName?: string | null
    awsConfigurationWarning?: string
    updatedAt: Date
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    console.log('✏️ PUT /api/v2/domains/{id} - Starting update for domain:', id)
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        console.log('✅ Authentication successful for userId:', userId)

        const data: PutDomainByIdRequest = await request.json()
        console.log('📝 Update data received:', {
            isCatchAllEnabled: data.isCatchAllEnabled,
            catchAllEndpointId: data.catchAllEndpointId
        })

        // Check if domain exists and belongs to user
        console.log('🔍 Checking if domain exists and belongs to user')
        const existingDomain = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, id),
                eq(emailDomains.userId, userId)
            ))
            .limit(1)

        if (!existingDomain[0]) {
            console.log('❌ Domain not found for user:', userId, 'domain:', id)
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            )
        }

        console.log('✅ Found existing domain:', existingDomain[0].domain)

        // Check if domain is verified
        if (existingDomain[0].status !== 'verified') {
            console.log('❌ Domain not verified:', existingDomain[0].status)
            return NextResponse.json(
                { error: 'Domain must be verified before configuring catch-all' },
                { status: 400 }
            )
        }

        // Validate endpoint if enabling catch-all
        if (data.isCatchAllEnabled && data.catchAllEndpointId) {
            console.log('🔍 Validating endpoint')
            const endpointResult = await db
                .select()
                .from(endpoints)
                .where(and(
                    eq(endpoints.id, data.catchAllEndpointId),
                    eq(endpoints.userId, userId)
                ))
                .limit(1)

            if (!endpointResult[0]) {
                console.log('❌ Endpoint not found:', data.catchAllEndpointId)
                return NextResponse.json(
                    { error: 'Endpoint not found or does not belong to user' },
                    { status: 400 }
                )
            }

            if (!endpointResult[0].isActive) {
                console.log('❌ Endpoint is inactive:', data.catchAllEndpointId)
                return NextResponse.json(
                    { error: 'Selected endpoint is not active' },
                    { status: 400 }
                )
            }
        }

        let receiptRuleName = null
        let awsConfigurationWarning = null

        if (data.isCatchAllEnabled && data.catchAllEndpointId) {
            // ENABLE catch-all: Configure AWS SES catch-all receipt rule
            try {
                console.log('🔧 Configuring AWS SES catch-all for domain:', existingDomain[0].domain)
                const sesManager = new AWSSESReceiptRuleManager()
                
                // Get AWS configuration
                const awsRegion = process.env.AWS_REGION || 'us-east-2'
                const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
                const s3BucketName = process.env.S3_BUCKET_NAME
                const awsAccountId = process.env.AWS_ACCOUNT_ID

                if (!s3BucketName || !awsAccountId) {
                    awsConfigurationWarning = 'AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID'
                    console.warn('⚠️ AWS configuration incomplete')
                } else {
                    const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
                        lambdaFunctionName,
                        awsAccountId,
                        awsRegion
                    )

                    const receiptResult = await sesManager.configureCatchAllDomain({
                        domain: existingDomain[0].domain,
                        webhookId: data.catchAllEndpointId,
                        lambdaFunctionArn: lambdaArn,
                        s3BucketName
                    })
                    
                    if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
                        receiptRuleName = receiptResult.ruleName
                        console.log('✅ AWS SES catch-all configured successfully')
                    } else {
                        awsConfigurationWarning = `SES catch-all configuration failed: ${receiptResult.error}`
                        console.warn('⚠️ SES catch-all configuration failed')
                    }
                }
            } catch (error) {
                console.error('❌ AWS SES configuration error:', error)
                awsConfigurationWarning = `AWS SES configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
        } else {
            // DISABLE catch-all: Remove AWS SES catch-all receipt rule
            try {
                console.log('🔧 Removing AWS SES catch-all for domain:', existingDomain[0].domain)
                const sesManager = new AWSSESReceiptRuleManager()
                
                const ruleRemoved = await sesManager.removeCatchAllDomain(existingDomain[0].domain)
                
                if (ruleRemoved) {
                    console.log('✅ AWS SES catch-all removed successfully')
                } else {
                    console.warn('⚠️ Failed to remove AWS SES catch-all rule')
                }
            } catch (error) {
                console.error('❌ AWS SES removal error:', error)
            }
        }

        // Update domain in database
        console.log('💾 Updating domain in database')
        const [updatedDomain] = await db
            .update(emailDomains)
            .set({
                isCatchAllEnabled: data.isCatchAllEnabled,
                catchAllEndpointId: data.isCatchAllEnabled ? data.catchAllEndpointId : null,
                catchAllReceiptRuleName: receiptRuleName,
                updatedAt: new Date()
            })
            .where(eq(emailDomains.id, id))
            .returning()

                 // Get updated endpoint information
         let catchAllEndpoint = null
         if (updatedDomain.catchAllEndpointId) {
             const endpointResult = await db
                 .select({
                     id: endpoints.id,
                     name: endpoints.name,
                     type: endpoints.type,
                     isActive: endpoints.isActive
                 })
                 .from(endpoints)
                 .where(eq(endpoints.id, updatedDomain.catchAllEndpointId))
                 .limit(1)
             
             const endpoint = endpointResult[0]
             if (endpoint) {
                 catchAllEndpoint = {
                     id: endpoint.id,
                     name: endpoint.name,
                     type: endpoint.type,
                     isActive: endpoint.isActive || false
                 }
             }
         }

         console.log('✅ Successfully updated domain catch-all settings')

         const response: PutDomainByIdResponse = {
             id: updatedDomain.id,
             domain: updatedDomain.domain,
             status: updatedDomain.status,
             isCatchAllEnabled: updatedDomain.isCatchAllEnabled || false,
             catchAllEndpointId: updatedDomain.catchAllEndpointId,
             catchAllEndpoint,
             receiptRuleName,
             updatedAt: updatedDomain.updatedAt || new Date()
         }

        if (awsConfigurationWarning) {
            response.awsConfigurationWarning = awsConfigurationWarning
        }

        return NextResponse.json(response)

    } catch (error) {
        console.error('❌ PUT /api/v2/domains/{id} - Error:', error)
        return NextResponse.json(
            { 
                error: 'Failed to update domain',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/v2/domains/{id}
 * Deletes a domain and all associated resources
 * Supports both session-based auth and API key auth
 * Has tests? ⏳
 * Has logging? ✅
 * Has types? ✅
 */

// DELETE /api/v2/domains/{id} types
export interface DeleteDomainByIdResponse {
    success: boolean
    message: string
    deletedResources: {
        domain: string
        emailAddresses: number
        dnsRecords: number
        blockedEmails: number
        sesIdentity: boolean
        sesReceiptRules: boolean
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    console.log('🗑️ DELETE /api/v2/domains/{id} - Starting deletion for domain:', id)
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        console.log('✅ Authentication successful for userId:', userId)

        // Get domain with user verification
        console.log('🔍 Fetching domain details')
        const domainResult = await db
            .select()
            .from(emailDomains)
            .where(and(
                eq(emailDomains.id, id),
                eq(emailDomains.userId, userId)
            ))
            .limit(1)

        if (!domainResult[0]) {
            console.log('❌ Domain not found for user:', userId, 'domain:', id)
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            )
        }

        const domain = domainResult[0]
        console.log('✅ Found domain:', domain.domain, 'status:', domain.status)

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
                console.log('🔧 Removing AWS SES receipt rules')
                const sesManager = new AWSSESReceiptRuleManager()
                
                // Remove catch-all rule if exists
                if (domain.isCatchAllEnabled || domain.catchAllReceiptRuleName) {
                    console.log('🔧 Removing catch-all receipt rule')
                    const catchAllRemoved = await sesManager.removeCatchAllDomain(domain.domain)
                    if (catchAllRemoved) {
                        deletionStats.sesReceiptRules = true
                        console.log('✅ Catch-all receipt rule removed')
                    }
                }

                // Remove individual email receipt rule
                console.log('🔧 Removing individual email receipt rule')
                const individualRemoved = await sesManager.removeEmailReceiving(domain.domain)
                if (individualRemoved) {
                    deletionStats.sesReceiptRules = true
                    console.log('✅ Individual email receipt rule removed')
                }
            } catch (sesRuleError) {
                console.error('⚠️ Failed to remove SES receipt rules:', sesRuleError)
                // Continue with deletion even if SES rule removal fails
            }
        }

        // 2. Delete AWS SES identity
        if (domain.domain) {
            try {
                console.log('🔧 Deleting AWS SES identity')
                const { deleteDomainFromSES } = await import('@/lib/domains-and-dns/domain-verification')
                const sesResult = await deleteDomainFromSES(domain.domain)
                deletionStats.sesIdentity = sesResult.success
                if (sesResult.success) {
                    console.log('✅ SES identity deleted')
                } else {
                    console.warn('⚠️ Failed to delete SES identity:', sesResult.error)
                }
            } catch (sesError) {
                console.error('⚠️ Failed to delete SES identity:', sesError)
                // Continue with deletion even if SES identity deletion fails
            }
        }

        // 3. Delete blocked emails for this domain
        try {
            console.log('🔧 Deleting blocked emails')
            const { blockedEmails } = await import('@/lib/db/schema')
            const blockedResult = await db
                .delete(blockedEmails)
                .where(eq(blockedEmails.domainId, id))
                .returning({ id: blockedEmails.id })
            
            deletionStats.blockedEmails = blockedResult.length
            console.log(`✅ Deleted ${blockedResult.length} blocked emails`)
        } catch (blockedError) {
            console.error('⚠️ Failed to delete blocked emails:', blockedError)
            // Continue with deletion
        }

        // 4. Delete email addresses
        try {
            console.log('🔧 Deleting email addresses')
            const emailResult = await db
                .delete(emailAddresses)
                .where(eq(emailAddresses.domainId, id))
                .returning({ id: emailAddresses.id })
            
            deletionStats.emailAddresses = emailResult.length
            console.log(`✅ Deleted ${emailResult.length} email addresses`)
        } catch (emailError) {
            console.error('❌ Failed to delete email addresses:', emailError)
            return NextResponse.json(
                { 
                    error: 'Failed to delete email addresses',
                    details: emailError instanceof Error ? emailError.message : 'Unknown error'
                },
                { status: 500 }
            )
        }

        // 5. Delete DNS records
        try {
            console.log('🔧 Deleting DNS records')
            const dnsResult = await db
                .delete(domainDnsRecords)
                .where(eq(domainDnsRecords.domainId, id))
                .returning({ id: domainDnsRecords.id })
            
            deletionStats.dnsRecords = dnsResult.length
            console.log(`✅ Deleted ${dnsResult.length} DNS records`)
        } catch (dnsError) {
            console.error('❌ Failed to delete DNS records:', dnsError)
            return NextResponse.json(
                { 
                    error: 'Failed to delete DNS records',
                    details: dnsError instanceof Error ? dnsError.message : 'Unknown error'
                },
                { status: 500 }
            )
        }

        // 6. Delete the domain itself
        try {
            console.log('🔧 Deleting domain record')
            await db
                .delete(emailDomains)
                .where(eq(emailDomains.id, id))
            
            console.log('✅ Domain record deleted')
        } catch (domainError) {
            console.error('❌ Failed to delete domain:', domainError)
            return NextResponse.json(
                { 
                    error: 'Failed to delete domain',
                    details: domainError instanceof Error ? domainError.message : 'Unknown error'
                },
                { status: 500 }
            )
        }

        // 7. Track domain deletion with Autumn to free up domain spot
        try {
            console.log('📊 Tracking domain deletion with Autumn for user:', userId)
            const { Autumn: autumn } = await import('autumn-js')
            const { error: trackError } = await autumn.track({
                customer_id: userId,
                feature_id: "domains",
                value: -1,
            })

            if (trackError) {
                console.error('⚠️ Failed to track domain deletion:', trackError)
                // Don't fail the deletion if tracking fails, just log it
                console.warn(`⚠️ Domain deleted but usage tracking failed for user: ${userId}`)
            } else {
                console.log(`✅ Successfully tracked domain deletion for user: ${userId}`)
            }
        } catch (trackingError) {
            console.error('⚠️ Failed to import or use Autumn tracking:', trackingError)
            // Don't fail the deletion if tracking fails, just log it
        }

        console.log('✅ Successfully deleted domain and all associated resources')

        const response: DeleteDomainByIdResponse = {
            success: true,
            message: `Successfully deleted domain ${domain.domain} and all associated resources`,
            deletedResources: deletionStats
        }

        return NextResponse.json(response)

    } catch (error) {
        console.error('❌ DELETE /api/v2/domains/{id} - Error:', error)
        return NextResponse.json(
            { 
                error: 'Failed to delete domain',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/v2/domains/{id}
 * Upgrade existing domain with MAIL FROM domain configuration
 * This eliminates the "via amazonses.com" attribution in emails
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('🔧 PATCH /api/v2/domains/{id} - Upgrading domain with MAIL FROM configuration:', id)
  
  try {
    console.log('🔐 Validating request authentication')
    const { userId, error } = await validateRequest(request)
    if (!userId) {
      console.log('❌ Authentication failed:', error)
      return NextResponse.json(
        { error: error },
        { status: 401 }
      )
    }
    console.log('✅ Authentication successful for userId:', userId)

    // Get domain record
    const domainResult = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, id), eq(emailDomains.userId, userId)))
      .limit(1)

    if (!domainResult[0]) {
      console.log('❌ Domain not found:', id)
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    const domain = domainResult[0]
    console.log('📋 Found domain:', domain.domain)

    // Check if AWS SES is configured
    if (!sesClient) {
      console.log('❌ AWS SES not configured')
      return NextResponse.json(
        { error: 'AWS SES not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.' },
        { status: 500 }
      )
    }

    // Check if domain already has MAIL FROM domain configured
    if (domain.mailFromDomain && domain.mailFromDomainStatus === 'Success') {
      console.log('ℹ️ Domain already has MAIL FROM domain configured:', domain.mailFromDomain)
      return NextResponse.json(
        { 
          success: true,
          message: 'Domain already has MAIL FROM domain configured',
          mailFromDomain: domain.mailFromDomain,
          mailFromDomainStatus: domain.mailFromDomainStatus
        },
        { status: 200 }
      )
    }

    // Set up MAIL FROM domain
    const mailFromDomain = `mail.${domain.domain}`
    let mailFromDomainStatus = 'pending'
    
    try {
      console.log(`🔧 Setting up MAIL FROM domain: ${mailFromDomain}`)
      const mailFromCommand = new SetIdentityMailFromDomainCommand({
        Identity: domain.domain,
        MailFromDomain: mailFromDomain,
        BehaviorOnMXFailure: 'UseDefaultValue'
      })
      await sesClient.send(mailFromCommand)
      
      // Check MAIL FROM domain status
      const mailFromStatusCommand = new GetIdentityMailFromDomainAttributesCommand({
        Identities: [domain.domain]
      })
      const mailFromStatusResponse = await sesClient.send(mailFromStatusCommand)
      const mailFromAttributes = mailFromStatusResponse.MailFromDomainAttributes?.[domain.domain]
      mailFromDomainStatus = mailFromAttributes?.MailFromDomainStatus || 'pending'
      
      console.log(`✅ MAIL FROM domain configured: ${mailFromDomain} (status: ${mailFromDomainStatus})`)
    } catch (mailFromError) {
      console.error('❌ Failed to set up MAIL FROM domain:', mailFromError)
      return NextResponse.json(
        { 
          error: 'Failed to configure MAIL FROM domain',
          details: mailFromError instanceof Error ? mailFromError.message : 'Unknown error'
        },
        { status: 500 }
      )
    }

    // Update domain record with MAIL FROM domain information
    const updateData: any = {
      mailFromDomain,
      mailFromDomainStatus,
      updatedAt: new Date()
    }

    if (mailFromDomainStatus === 'Success') {
      updateData.mailFromDomainVerifiedAt = new Date()
    }

    const [updatedDomain] = await db
      .update(emailDomains)
      .set(updateData)
      .where(eq(emailDomains.id, id))
      .returning()

    // Generate additional DNS records needed for MAIL FROM domain
    const awsRegion = process.env.AWS_REGION || 'us-east-2'
    const additionalDnsRecords = [
      {
        type: 'MX',
        name: mailFromDomain,
        value: `10 feedback-smtp.${awsRegion}.amazonses.com`,
        description: 'MAIL FROM domain MX record (eliminates "via amazonses.com")',
        isRequired: true,
        isVerified: false
      },
      {
        type: 'TXT',
        name: mailFromDomain,
        value: 'v=spf1 include:amazonses.com ~all',
        description: 'SPF record for MAIL FROM domain',
        isRequired: false,
        isVerified: false
      }
    ]

    // Add the new DNS records to the database
    for (const record of additionalDnsRecords) {
      const dnsRecord = {
        id: `dns_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        domainId: id,
        recordType: record.type,
        name: record.name,
        value: record.value,
        isRequired: record.isRequired,
        isVerified: record.isVerified,
        createdAt: new Date(),
      }
      
      try {
        await db.insert(domainDnsRecords).values(dnsRecord)
        console.log(`✅ Added DNS record: ${record.type} ${record.name}`)
      } catch (dnsError) {
        console.error('⚠️ Failed to add DNS record (may already exist):', dnsError)
        // Continue even if DNS record insertion fails (might already exist)
      }
    }

    console.log('✅ Successfully upgraded domain with MAIL FROM configuration')

    return NextResponse.json({
      success: true,
      message: 'Domain successfully upgraded with MAIL FROM domain configuration',
      mailFromDomain,
      mailFromDomainStatus,
      additionalDnsRecords: additionalDnsRecords.map(record => ({
        type: record.type,
        name: record.name,
        value: record.value,
        description: record.description,
        isRequired: record.isRequired
      }))
    }, { status: 200 })

  } catch (error) {
    console.error('❌ PATCH /api/v2/domains/{id} - Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to upgrade domain',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
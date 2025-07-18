import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, endpoints } from '@/lib/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'

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
    recentEmails: Array<{
        id: string
        from: string
        to: string
        subject: string
        receivedAt: Date
        status: string
    }>
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

        return NextResponse.json({
            id: domain.id,
            domain: domain.domain,
            status: domain.status,
            canReceiveEmails: domain.canReceiveEmails,
            hasMxRecords: domain.hasMxRecords,
            domainProvider: domain.domainProvider,
            providerConfidence: domain.providerConfidence,
            lastDnsCheck: domain.lastDnsCheck,
            lastSesCheck: domain.lastSesCheck,
            isCatchAllEnabled: domain.isCatchAllEnabled,
            catchAllEndpointId: domain.catchAllEndpointId,
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
            userId: domain.userId,
            stats,
            catchAllEndpoint,
            recentEmails
        })

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
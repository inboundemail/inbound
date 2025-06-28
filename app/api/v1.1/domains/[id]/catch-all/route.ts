import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/app/api/v1/lib/auth'
import { db } from '@/lib/db'
import { emailDomains, endpoints, emailAddresses } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses-rules'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`📋 GET /api/v1.1/domains/${params.id}/catch-all - Fetching catch-all configuration`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Get domain with catch-all endpoint information
    const domainResult = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        status: emailDomains.status,
        catchAllEndpointId: emailDomains.catchAllEndpointId,
        // Endpoint information (if configured)
        endpointName: endpoints.name,
        endpointType: endpoints.type,
        endpointIsActive: endpoints.isActive,
        endpointConfig: endpoints.config
      })
      .from(emailDomains)
      .leftJoin(endpoints, eq(emailDomains.catchAllEndpointId, endpoints.id))
      .where(and(
        eq(emailDomains.id, params.id),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!domainResult[0]) {
      return NextResponse.json({
        success: false,
        error: 'Domain not found'
      }, { status: 404 })
    }

    const result = domainResult[0]

    const catchAllConfig = {
      domainId: result.id,
      domainName: result.domain,
      hasCatchAll: !!result.catchAllEndpointId,
      endpoint: result.catchAllEndpointId ? {
        id: result.catchAllEndpointId,
        name: result.endpointName,
        type: result.endpointType,
        isActive: result.endpointIsActive,
        config: result.endpointConfig ? JSON.parse(result.endpointConfig) : null
      } : null
    }

    console.log(`✅ GET /api/v1.1/domains/${params.id}/catch-all - Retrieved catch-all configuration`)

    return NextResponse.json({
      success: true,
      data: catchAllConfig
    })

  } catch (error) {
    console.error(`❌ GET /api/v1.1/domains/${params.id}/catch-all - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch catch-all configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`📝 PUT /api/v1.1/domains/${params.id}/catch-all - Updating catch-all configuration`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const data = await request.json()

    // Check if domain exists and belongs to user
    const existingDomain = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, params.id),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!existingDomain[0]) {
      return NextResponse.json({
        success: false,
        error: 'Domain not found'
      }, { status: 404 })
    }

    // Validate endpoint if provided
    let endpointId = null
    if (data.endpointId) {
      const endpointResult = await db
        .select()
        .from(endpoints)
        .where(and(
          eq(endpoints.id, data.endpointId),
          eq(endpoints.userId, userId)
        ))
        .limit(1)

      if (!endpointResult[0]) {
        return NextResponse.json({
          success: false,
          error: 'Endpoint not found or access denied'
        }, { status: 404 })
      }

      if (!endpointResult[0].isActive) {
        return NextResponse.json({
          success: false,
          error: 'Cannot set inactive endpoint as catch-all'
        }, { status: 400 })
      }

      endpointId = data.endpointId
    }

    if (endpointId) {
      // ENABLE catch-all: Configure AWS SES catch-all receipt rule
      let receiptRuleName = null
      let awsConfigurationWarning = null

      try {
        const sesManager = new AWSSESReceiptRuleManager()
        
        // Get AWS configuration
        const awsRegion = process.env.AWS_REGION || 'us-east-2'
        const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
        const s3BucketName = process.env.S3_BUCKET_NAME
        const awsAccountId = process.env.AWS_ACCOUNT_ID

        if (!s3BucketName || !awsAccountId) {
          awsConfigurationWarning = 'AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID'
          console.warn(`⚠️ PUT /api/v1.1/domains/${params.id}/catch-all - ${awsConfigurationWarning}`)
        } else {
          console.log(`🔧 PUT /api/v1.1/domains/${params.id}/catch-all - Configuring AWS SES catch-all for ${existingDomain[0].domain}`)

          const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
            lambdaFunctionName,
            awsAccountId,
            awsRegion
          )

          const receiptResult = await sesManager.configureCatchAllDomain({
            domain: existingDomain[0].domain,
            webhookId: endpointId,
            lambdaFunctionArn: lambdaArn,
            s3BucketName
          })
          
          if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
            receiptRuleName = receiptResult.ruleName
            console.log(`✅ PUT /api/v1.1/domains/${params.id}/catch-all - AWS SES catch-all configured successfully`)
          } else {
            awsConfigurationWarning = `SES catch-all configuration failed: ${receiptResult.error}`
            console.warn(`⚠️ PUT /api/v1.1/domains/${params.id}/catch-all - ${awsConfigurationWarning}`)
          }
        }
      } catch (error) {
        awsConfigurationWarning = `SES catch-all configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`❌ PUT /api/v1.1/domains/${params.id}/catch-all - AWS SES configuration failed:`, error)
      }

      // Update domain catch-all configuration
      const [updatedDomain] = await db
        .update(emailDomains)
        .set({
          isCatchAllEnabled: true,
          catchAllEndpointId: endpointId,
          catchAllReceiptRuleName: receiptRuleName,
          updatedAt: new Date()
        })
        .where(eq(emailDomains.id, params.id))
        .returning()

      console.log(`✅ PUT /api/v1.1/domains/${params.id}/catch-all - Successfully enabled catch-all configuration`)

      return NextResponse.json({
        success: true,
        data: {
          domainId: updatedDomain.id,
          domainName: updatedDomain.domain,
          catchAllEndpointId: updatedDomain.catchAllEndpointId,
          hasCatchAll: true,
          isCatchAllEnabled: true,
          receiptRuleName,
          ...(awsConfigurationWarning && { warning: awsConfigurationWarning })
        },
        message: receiptRuleName 
          ? 'Catch-all endpoint configured and AWS SES configured successfully'
          : 'Catch-all endpoint configured successfully (AWS SES configuration pending)'
      })
    } else {
      // DISABLE catch-all: Remove AWS SES catch-all receipt rule and restore individual rules
      try {
        const sesManager = new AWSSESReceiptRuleManager()
        
        // Remove catch-all rule
        const ruleRemoved = await sesManager.removeCatchAllDomain(existingDomain[0].domain)

        if (ruleRemoved) {
          // Get existing email addresses to restore individual rules
          const existingEmails = await db
            .select({
              address: emailAddresses.address
            })
            .from(emailAddresses)
            .where(and(
              eq(emailAddresses.domainId, params.id),
              eq(emailAddresses.isActive, true)
            ))

          // Restore individual email rules if there are existing email addresses
          if (existingEmails.length > 0) {
            const awsRegion = process.env.AWS_REGION || 'us-east-2'
            const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
            const s3BucketName = process.env.S3_BUCKET_NAME
            const awsAccountId = process.env.AWS_ACCOUNT_ID

            if (s3BucketName && awsAccountId) {
              const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
                lambdaFunctionName,
                awsAccountId,
                awsRegion
              )

              const emailAddressList = existingEmails.map(email => email.address)
              
              const restoreResult = await sesManager.restoreIndividualEmailRules(
                existingDomain[0].domain,
                emailAddressList,
                lambdaArn,
                s3BucketName
              )

              if (restoreResult.status === 'created') {
                console.log(`✅ PUT /api/v1.1/domains/${params.id}/catch-all - Restored individual email rules for ${existingEmails.length} addresses`)
                
                // Update all individual email addresses with the new receipt rule
                await db
                  .update(emailAddresses)
                  .set({
                    isReceiptRuleConfigured: true,
                    receiptRuleName: restoreResult.ruleName,
                    updatedAt: new Date()
                  })
                  .where(and(
                    eq(emailAddresses.domainId, params.id),
                    eq(emailAddresses.isActive, true)
                  ))
              } else {
                console.warn(`⚠️ PUT /api/v1.1/domains/${params.id}/catch-all - Failed to restore individual email rules: ${restoreResult.error}`)
              }
            }
          }

          console.log(`✅ PUT /api/v1.1/domains/${params.id}/catch-all - AWS SES catch-all removed successfully`)
        } else {
          console.warn(`⚠️ PUT /api/v1.1/domains/${params.id}/catch-all - Failed to remove AWS SES catch-all rule`)
        }
      } catch (error) {
        console.error(`❌ PUT /api/v1.1/domains/${params.id}/catch-all - AWS SES removal failed:`, error)
      }

      // Update domain to disable catch-all
      const [updatedDomain] = await db
        .update(emailDomains)
        .set({
          isCatchAllEnabled: false,
          catchAllEndpointId: null,
          catchAllReceiptRuleName: null,
          updatedAt: new Date()
        })
        .where(eq(emailDomains.id, params.id))
        .returning()

      console.log(`✅ PUT /api/v1.1/domains/${params.id}/catch-all - Successfully disabled catch-all configuration`)

      return NextResponse.json({
        success: true,
        data: {
          domainId: updatedDomain.id,
          domainName: updatedDomain.domain,
          catchAllEndpointId: null,
          hasCatchAll: false,
          isCatchAllEnabled: false
        },
        message: 'Catch-all endpoint removed and AWS SES configured successfully'
      })
    }

  } catch (error) {
    console.error(`❌ PUT /api/v1.1/domains/${params.id}/catch-all - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update catch-all configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`🗑️ DELETE /api/v1.1/domains/${params.id}/catch-all - Removing catch-all configuration`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Check if domain exists and belongs to user
    const existingDomain = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, params.id),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!existingDomain[0]) {
      return NextResponse.json({
        success: false,
        error: 'Domain not found'
      }, { status: 404 })
    }

    // Remove AWS SES catch-all receipt rule and restore individual rules
    try {
      const sesManager = new AWSSESReceiptRuleManager()
      
      // Remove catch-all rule
      const ruleRemoved = await sesManager.removeCatchAllDomain(existingDomain[0].domain)

      if (ruleRemoved) {
        // Get existing email addresses to restore individual rules
        const existingEmails = await db
          .select({
            address: emailAddresses.address
          })
          .from(emailAddresses)
          .where(and(
            eq(emailAddresses.domainId, params.id),
            eq(emailAddresses.isActive, true)
          ))

        // Restore individual email rules if there are existing email addresses
        if (existingEmails.length > 0) {
          const awsRegion = process.env.AWS_REGION || 'us-east-2'
          const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
          const s3BucketName = process.env.S3_BUCKET_NAME
          const awsAccountId = process.env.AWS_ACCOUNT_ID

          if (s3BucketName && awsAccountId) {
            const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
              lambdaFunctionName,
              awsAccountId,
              awsRegion
            )

            const emailAddressList = existingEmails.map(email => email.address)
            
            const restoreResult = await sesManager.restoreIndividualEmailRules(
              existingDomain[0].domain,
              emailAddressList,
              lambdaArn,
              s3BucketName
            )

            if (restoreResult.status === 'created') {
              console.log(`✅ DELETE /api/v1.1/domains/${params.id}/catch-all - Restored individual email rules for ${existingEmails.length} addresses`)
              
              // Update all individual email addresses with the new receipt rule
              await db
                .update(emailAddresses)
                .set({
                  isReceiptRuleConfigured: true,
                  receiptRuleName: restoreResult.ruleName,
                  updatedAt: new Date()
                })
                .where(and(
                  eq(emailAddresses.domainId, params.id),
                  eq(emailAddresses.isActive, true)
                ))
            } else {
              console.warn(`⚠️ DELETE /api/v1.1/domains/${params.id}/catch-all - Failed to restore individual email rules: ${restoreResult.error}`)
            }
          }
        }

        console.log(`✅ DELETE /api/v1.1/domains/${params.id}/catch-all - AWS SES catch-all removed successfully`)
      } else {
        console.warn(`⚠️ DELETE /api/v1.1/domains/${params.id}/catch-all - Failed to remove AWS SES catch-all rule`)
      }
    } catch (error) {
      console.error(`❌ DELETE /api/v1.1/domains/${params.id}/catch-all - AWS SES removal failed:`, error)
    }

    // Remove catch-all configuration from database
    await db
      .update(emailDomains)
      .set({
        isCatchAllEnabled: false,
        catchAllEndpointId: null,
        catchAllReceiptRuleName: null,
        updatedAt: new Date()
      })
      .where(eq(emailDomains.id, params.id))

    console.log(`✅ DELETE /api/v1.1/domains/${params.id}/catch-all - Successfully removed catch-all configuration`)

    return NextResponse.json({
      success: true,
      message: 'Catch-all configuration removed and AWS SES configured successfully'
    })

  } catch (error) {
    console.error(`❌ DELETE /api/v1.1/domains/${params.id}/catch-all - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to remove catch-all configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 
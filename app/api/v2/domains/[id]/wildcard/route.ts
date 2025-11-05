import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { enableDomainWildcardSubdomains, disableDomainWildcardSubdomains } from '@/lib/db/domains'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'

const awsRegion = process.env.AWS_REGION || 'us-east-2'
const awsAccountId = process.env.AWS_ACCOUNT_ID || ''
const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'inbound-email-processor'
const s3BucketName = process.env.S3_BUCKET_NAME || 'inbound-emails-bucket'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const domainId = params.id

    const body = await request.json()
    const { enabled, endpointId } = body

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled field must be a boolean' },
        { status: 400 }
      )
    }

    const [domain] = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, domainId),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    if (domain.status !== 'verified') {
      return NextResponse.json(
        { error: 'Domain must be verified before enabling wildcard subdomains' },
        { status: 400 }
      )
    }

    const sesRuleManager = new AWSSESReceiptRuleManager(awsRegion)
    const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
      lambdaFunctionName,
      awsAccountId,
      awsRegion
    )

    if (enabled) {
      const result = await sesRuleManager.configureWildcardSubdomainRule({
        domain: domain.domain,
        endpointId: endpointId || undefined,
        lambdaFunctionArn: lambdaArn,
        s3BucketName: s3BucketName,
      })

      if (result.status === 'failed') {
        return NextResponse.json(
          { error: `Failed to configure wildcard subdomain: ${result.error}` },
          { status: 500 }
        )
      }

      const updatedDomain = await enableDomainWildcardSubdomains(
        domainId,
        endpointId || null,
        result.ruleName
      )

      return NextResponse.json({
        success: true,
        domain: {
          id: updatedDomain.id,
          domain: updatedDomain.domain,
          supportsWildcardSubdomains: updatedDomain.supportsWildcardSubdomains,
          wildcardEndpointId: updatedDomain.wildcardEndpointId,
          wildcardReceiptRuleName: updatedDomain.wildcardReceiptRuleName,
        },
        message: 'Wildcard subdomain receiving enabled successfully'
      })
    } else {
      const removed = await sesRuleManager.removeWildcardSubdomainRule(domain.domain)

      if (!removed) {
        return NextResponse.json(
          { error: 'Failed to remove wildcard subdomain receipt rule' },
          { status: 500 }
        )
      }

      const updatedDomain = await disableDomainWildcardSubdomains(domainId)

      return NextResponse.json({
        success: true,
        domain: {
          id: updatedDomain.id,
          domain: updatedDomain.domain,
          supportsWildcardSubdomains: updatedDomain.supportsWildcardSubdomains,
          wildcardEndpointId: updatedDomain.wildcardEndpointId,
          wildcardReceiptRuleName: updatedDomain.wildcardReceiptRuleName,
        },
        message: 'Wildcard subdomain receiving disabled successfully'
      })
    }
  } catch (error) {
    console.error('Error configuring wildcard subdomain:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const domainId = params.id

    const [domain] = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, domainId),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      domain: {
        id: domain.id,
        domain: domain.domain,
        supportsWildcardSubdomains: domain.supportsWildcardSubdomains,
        wildcardEndpointId: domain.wildcardEndpointId,
        wildcardReceiptRuleName: domain.wildcardReceiptRuleName,
      }
    })
  } catch (error) {
    console.error('Error getting wildcard subdomain status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

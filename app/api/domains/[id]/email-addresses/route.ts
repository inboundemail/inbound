import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { nanoid } from 'nanoid'
import { AWSSESReceiptRuleManager } from '@/lib/aws-ses-rules'

// Add new email address
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: domainId } = await params
    const { emailAddress } = await request.json()

    if (!domainId || !emailAddress) {
      return NextResponse.json(
        { error: 'Domain ID and email address are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailAddress)) {
      return NextResponse.json(
        { error: 'Invalid email address format' },
        { status: 400 }
      )
    }

    // Get domain record
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
      .limit(1)

    if (!domainRecord[0]) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    const domain = domainRecord[0]

    // Check if domain is verified
    if (domain.status !== 'ses_verified') {
      return NextResponse.json(
        { error: 'Domain must be fully verified before adding email addresses' },
        { status: 400 }
      )
    }

    // Check if email address already exists
    const existingEmail = await db
      .select()
      .from(emailAddresses)
      .where(eq(emailAddresses.address, emailAddress))
      .limit(1)

    if (existingEmail[0]) {
      return NextResponse.json(
        { error: 'Email address already exists' },
        { status: 409 }
      )
    }

    // Verify the email address belongs to this domain
    const emailDomain = emailAddress.split('@')[1]
    if (emailDomain !== domain.domain) {
      return NextResponse.json(
        { error: `Email address must belong to domain ${domain.domain}` },
        { status: 400 }
      )
    }

    // Create email address record
    const emailRecord = {
      id: nanoid(),
      address: emailAddress,
      domainId: domainId,
      userId: session.user.id,
      isActive: true,
      isReceiptRuleConfigured: false,
      updatedAt: new Date(),
    }

    const [createdEmail] = await db.insert(emailAddresses).values(emailRecord).returning()

    // Configure SES receipt rule for the new email
    try {
      const sesManager = new AWSSESReceiptRuleManager()
      
      // Get AWS configuration
      const awsRegion = process.env.AWS_REGION || 'us-east-2'
      const lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'email-processor'
      const s3BucketName = process.env.S3_BUCKET_NAME
      const awsAccountId = process.env.AWS_ACCOUNT_ID

      if (!s3BucketName || !awsAccountId) {
        return NextResponse.json({
          id: createdEmail.id,
          address: createdEmail.address,
          isActive: true,
          isReceiptRuleConfigured: false,
          receiptRuleName: null,
          createdAt: createdEmail.createdAt,
          emailsLast24h: 0,
          warning: 'AWS configuration incomplete. Missing S3_BUCKET_NAME or AWS_ACCOUNT_ID'
        })
      }

      const lambdaArn = AWSSESReceiptRuleManager.getLambdaFunctionArn(
        lambdaFunctionName,
        awsAccountId,
        awsRegion
      )

      const receiptResult = await sesManager.configureEmailReceiving({
        domain: domain.domain,
        emailAddresses: [emailAddress],
        lambdaFunctionArn: lambdaArn,
        s3BucketName
      })
      
      if (receiptResult.status === 'created' || receiptResult.status === 'updated') {
        // Update email record with receipt rule information
        await db
          .update(emailAddresses)
          .set({
            isReceiptRuleConfigured: true,
            receiptRuleName: receiptResult.ruleName,
            updatedAt: new Date(),
          })
          .where(eq(emailAddresses.id, createdEmail.id))

        return NextResponse.json({
          id: createdEmail.id,
          address: createdEmail.address,
          isActive: true,
          isReceiptRuleConfigured: true,
          receiptRuleName: receiptResult.ruleName,
          createdAt: createdEmail.createdAt,
          emailsLast24h: 0
        })
      } else {
        // SES configuration failed, but email record was created
        return NextResponse.json({
          id: createdEmail.id,
          address: createdEmail.address,
          isActive: true,
          isReceiptRuleConfigured: false,
          receiptRuleName: null,
          createdAt: createdEmail.createdAt,
          emailsLast24h: 0,
          warning: 'Email address created but SES configuration failed'
        })
      }
    } catch (sesError) {
      console.error('SES configuration error:', sesError)
      return NextResponse.json({
        id: createdEmail.id,
        address: createdEmail.address,
        isActive: true,
        isReceiptRuleConfigured: false,
        receiptRuleName: null,
        createdAt: createdEmail.createdAt,
        emailsLast24h: 0,
        warning: 'Email address created but SES configuration failed'
      })
    }

  } catch (error) {
    console.error('Error adding email address:', error)
    return NextResponse.json(
      { error: 'Failed to add email address' },
      { status: 500 }
    )
  }
}

// Delete email address
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: domainId } = await params
    const { emailAddressId } = await request.json()

    if (!domainId || !emailAddressId) {
      return NextResponse.json(
        { error: 'Domain ID and email address ID are required' },
        { status: 400 }
      )
    }

    // Get domain record
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.id, domainId), eq(emailDomains.userId, session.user.id)))
      .limit(1)

    if (!domainRecord[0]) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    // Get email address record
    const emailRecord = await db
      .select()
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.id, emailAddressId),
        eq(emailAddresses.domainId, domainId),
        eq(emailAddresses.userId, session.user.id)
      ))
      .limit(1)

    if (!emailRecord[0]) {
      return NextResponse.json(
        { error: 'Email address not found' },
        { status: 404 }
      )
    }

    // Delete the email address record
    await db
      .delete(emailAddresses)
      .where(eq(emailAddresses.id, emailAddressId))

    // Note: We don't remove the SES receipt rule here as it might be shared
    // with other email addresses. The SES rules should be managed separately.

    return NextResponse.json({
      success: true,
      message: 'Email address deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting email address:', error)
    return NextResponse.json(
      { error: 'Failed to delete email address' },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '../../../lib/auth'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /api/v1/domains/[domain]/emails
 * List all email addresses for a specific domain
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const validation = await validateApiKey(request)
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 401 }
      )
    }

    const { domain } = await params

    // Find the domain record
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.domain, domain),
        eq(emailDomains.userId, validation.user!.id)
      ))
      .limit(1)

    if (!domainRecord[0]) {
      return NextResponse.json(
        { error: 'Domain not found or does not belong to user' },
        { status: 404 }
      )
    }

    // Get all email addresses for this domain
    const emails = await db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        webhookId: emailAddresses.webhookId,
        isActive: emailAddresses.isActive,
        isReceiptRuleConfigured: emailAddresses.isReceiptRuleConfigured,
        createdAt: emailAddresses.createdAt,
        updatedAt: emailAddresses.updatedAt
      })
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.domainId, domainRecord[0].id),
        eq(emailAddresses.userId, validation.user!.id)
      ))

    return NextResponse.json({
      success: true,
      data: {
        domain: domain,
        emails: emails
      }
    })
  } catch (error) {
    console.error('Error fetching emails for domain:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/v1/domains/[domain]/emails
 * Remove an email address from a domain
 * Body: { email: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const validation = await validateApiKey(request)
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 401 }
      )
    }

    const { domain } = await params
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      )
    }

    // Verify the email belongs to the specified domain
    const emailDomain = email.split('@')[1]
    if (emailDomain !== domain) {
      return NextResponse.json(
        { error: `Email address must belong to domain ${domain}` },
        { status: 400 }
      )
    }

    // Find the domain record
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.domain, domain),
        eq(emailDomains.userId, validation.user!.id)
      ))
      .limit(1)

    if (!domainRecord[0]) {
      return NextResponse.json(
        { error: 'Domain not found or does not belong to user' },
        { status: 404 }
      )
    }

    // Find the email address
    const emailRecord = await db
      .select()
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.address, email),
        eq(emailAddresses.domainId, domainRecord[0].id),
        eq(emailAddresses.userId, validation.user!.id)
      ))
      .limit(1)

    if (!emailRecord[0]) {
      return NextResponse.json(
        { error: 'Email address not found' },
        { status: 404 }
      )
    }

    // Delete the email address
    await db
      .delete(emailAddresses)
      .where(eq(emailAddresses.id, emailRecord[0].id))

    return NextResponse.json({
      success: true,
      message: `Email address ${email} removed from domain ${domain}`
    })
  } catch (error) {
    console.error('Error removing email from domain:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '../lib/auth'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * GET /api/v1/domains
 * List all domains for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateApiKey(request)
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 401 }
      )
    }

    const domains = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        status: emailDomains.status,
        canReceiveEmails: emailDomains.canReceiveEmails,
        createdAt: emailDomains.createdAt,
        updatedAt: emailDomains.updatedAt
      })
      .from(emailDomains)
      .where(eq(emailDomains.userId, validation.user!.id))

    return NextResponse.json({
      success: true,
      data: domains
    })
  } catch (error) {
    console.error('Error fetching domains:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/domains
 * Create a new email address on a domain
 * Body: { domain: string, email: string, webhookId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const validation = await validateApiKey(request)
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { domain, email, webhookId } = body

    if (!domain || !email) {
      return NextResponse.json(
        { error: 'Domain and email are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address format' },
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

    // Check if domain is verified
    if (domainRecord[0].status !== 'verified') {
      return NextResponse.json(
        { error: 'Domain must be verified before adding email addresses' },
        { status: 400 }
      )
    }

    // If webhookId is provided, verify it exists and belongs to the user
    if (webhookId) {
      const webhookRecord = await db
        .select()
        .from(webhooks)
        .where(and(
          eq(webhooks.id, webhookId),
          eq(webhooks.userId, validation.user!.id)
        ))
        .limit(1)

      if (!webhookRecord[0]) {
        return NextResponse.json(
          { error: 'Webhook not found or does not belong to user' },
          { status: 400 }
        )
      }

      if (!webhookRecord[0].isActive) {
        return NextResponse.json(
          { error: 'Selected webhook is disabled' },
          { status: 400 }
        )
      }
    }

    // Check if email address already exists
    const existingEmail = await db
      .select()
      .from(emailAddresses)
      .where(eq(emailAddresses.address, email))
      .limit(1)

    if (existingEmail[0]) {
      return NextResponse.json(
        { error: 'Email address already exists' },
        { status: 409 }
      )
    }

    // Create the email address
    const emailRecord = {
      id: nanoid(),
      address: email,
      domainId: domainRecord[0].id,
      webhookId: webhookId || null,
      userId: validation.user!.id,
      isActive: true,
      isReceiptRuleConfigured: false,
      updatedAt: new Date(),
    }

    const [createdEmail] = await db
      .insert(emailAddresses)
      .values(emailRecord)
      .returning()

    return NextResponse.json({
      success: true,
      data: {
        id: createdEmail.id,
        address: createdEmail.address,
        domainId: createdEmail.domainId,
        webhookId: createdEmail.webhookId,
        isActive: createdEmail.isActive,
        createdAt: createdEmail.createdAt
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating email address:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 
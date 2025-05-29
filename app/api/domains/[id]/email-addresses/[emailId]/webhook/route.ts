import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { emailAddresses, emailDomains, webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { headers } from 'next/headers'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: domainId, emailId } = await params
    const { webhookId } = await request.json()

    console.log('🔗 Updating webhook assignment:', { emailId, webhookId, domainId })

    // Get domain record to verify ownership
    const domainRecord = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, domainId),
        eq(emailDomains.userId, session.user.id)
      ))
      .limit(1)

    if (!domainRecord[0]) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    // Get email address record to verify it exists and belongs to user
    const emailRecord = await db
      .select()
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.id, emailId),
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

    // If webhookId is provided, verify it exists and belongs to the user
    if (webhookId) {
      const webhookRecord = await db
        .select()
        .from(webhooks)
        .where(and(
          eq(webhooks.id, webhookId),
          eq(webhooks.userId, session.user.id)
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

    // Update the email address with the new webhook assignment
    const [updatedEmail] = await db
      .update(emailAddresses)
      .set({
        webhookId: webhookId || null,
        updatedAt: new Date()
      })
      .where(and(
        eq(emailAddresses.id, emailId),
        eq(emailAddresses.userId, session.user.id)
      ))
      .returning()

    return NextResponse.json({
      success: true,
      email: updatedEmail,
      message: webhookId 
        ? 'Webhook assigned successfully' 
        : 'Webhook removed successfully'
    })

  } catch (error) {
    console.error('Error updating webhook assignment:', error)
    return NextResponse.json(
      { error: 'Failed to update webhook assignment' },
      { status: 500 }
    )
  }
} 
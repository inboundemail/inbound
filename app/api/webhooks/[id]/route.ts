import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))
      .limit(1)

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    return NextResponse.json({ webhook })
  } catch (error) {
    console.error('Error fetching webhook:', error)
    return NextResponse.json(
      { error: 'Failed to fetch webhook' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, url, description, isActive, headers: customHeaders, timeout, retryAttempts } = body

    // Validate URL format if provided
    if (url) {
      try {
        new URL(url)
      } catch {
        return NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        )
      }
    }

    const { id } = await params

    // Check if webhook exists and belongs to user
    const [existingWebhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))
      .limit(1)

    if (!existingWebhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    // Check if name already exists for this user (excluding current webhook)
    if (name && name !== existingWebhook.name) {
      const nameExists = await db
        .select()
        .from(webhooks)
        .where(and(
          eq(webhooks.userId, session.user.id),
          eq(webhooks.name, name),
          // Exclude current webhook
          eq(webhooks.id, id)
        ))
        .limit(1)

      if (nameExists.length > 0) {
        return NextResponse.json(
          { error: 'A webhook with this name already exists' },
          { status: 400 }
        )
      }
    }

    const updateData: any = {
      updatedAt: new Date(),
    }

    if (name !== undefined) updateData.name = name
    if (url !== undefined) updateData.url = url
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive
    if (customHeaders !== undefined) updateData.headers = customHeaders ? JSON.stringify(customHeaders) : null
    if (timeout !== undefined) updateData.timeout = timeout
    if (retryAttempts !== undefined) updateData.retryAttempts = retryAttempts

    const [updatedWebhook] = await db
      .update(webhooks)
      .set(updateData)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))
      .returning()

    return NextResponse.json({ webhook: updatedWebhook })
  } catch (error) {
    console.error('Error updating webhook:', error)
    return NextResponse.json(
      { error: 'Failed to update webhook' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check if webhook exists and belongs to user
    const [existingWebhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))
      .limit(1)

    if (!existingWebhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    // TODO: Check if webhook is being used by any email addresses
    // You might want to prevent deletion or cascade the deletion

    await db
      .delete(webhooks)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))

    return NextResponse.json({ message: 'Webhook deleted successfully' })
  } catch (error) {
    console.error('Error deleting webhook:', error)
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    )
  }
} 
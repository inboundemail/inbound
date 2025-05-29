import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { webhooks, type NewWebhook } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, session.user.id))
      .orderBy(webhooks.createdAt)

    return NextResponse.json({ webhooks: userWebhooks })
  } catch (error) {
    console.error('Error fetching webhooks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch webhooks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, url, description, headers: customHeaders, timeout, retryAttempts } = body

    // Validate required fields
    if (!name || !url) {
      return NextResponse.json(
        { error: 'Name and URL are required' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Check if name already exists for this user
    const existingWebhook = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.userId, session.user.id),
        eq(webhooks.name, name)
      ))
      .limit(1)

    if (existingWebhook.length > 0) {
      return NextResponse.json(
        { error: 'A webhook with this name already exists' },
        { status: 400 }
      )
    }

    // Generate a webhook secret
    const secret = randomBytes(32).toString('hex')

    const newWebhook: NewWebhook = {
      id: randomBytes(16).toString('hex'),
      name,
      url,
      description: description || null,
      secret,
      headers: customHeaders ? JSON.stringify(customHeaders) : null,
      timeout: timeout || 30,
      retryAttempts: retryAttempts || 3,
      userId: session.user.id,
      isActive: true,
    }

    const [createdWebhook] = await db
      .insert(webhooks)
      .values(newWebhook)
      .returning()

    return NextResponse.json({ webhook: createdWebhook }, { status: 201 })
  } catch (error) {
    console.error('Error creating webhook:', error)
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    )
  }
} 
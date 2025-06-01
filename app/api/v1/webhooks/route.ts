import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '../lib/auth'
import { db } from '@/lib/db'
import { webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import crypto from 'crypto'

/**
 * GET /api/v1/webhooks
 * List all webhooks for the authenticated user
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

    const userWebhooks = await db
      .select({
        id: webhooks.id,
        name: webhooks.name,
        url: webhooks.url,
        description: webhooks.description,
        isActive: webhooks.isActive,
        timeout: webhooks.timeout,
        retryAttempts: webhooks.retryAttempts,
        totalDeliveries: webhooks.totalDeliveries,
        successfulDeliveries: webhooks.successfulDeliveries,
        failedDeliveries: webhooks.failedDeliveries,
        lastUsed: webhooks.lastUsed,
        createdAt: webhooks.createdAt,
        updatedAt: webhooks.updatedAt
      })
      .from(webhooks)
      .where(eq(webhooks.userId, validation.user!.id))

    return NextResponse.json({
      success: true,
      data: userWebhooks
    })
  } catch (error) {
    console.error('Error fetching webhooks:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/webhooks
 * Create a new webhook
 * Body: { name: string, description?: string, endpoint: string, retry?: number, timeout?: number }
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
    const { name, description, endpoint, retry, timeout } = body

    if (!name || !endpoint) {
      return NextResponse.json(
        { error: 'Name and endpoint are required' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(endpoint)
    } catch {
      return NextResponse.json(
        { error: 'Invalid endpoint URL format' },
        { status: 400 }
      )
    }

    // Check if webhook name already exists for this user
    const existingWebhook = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.name, name),
        eq(webhooks.userId, validation.user!.id)
      ))
      .limit(1)

    if (existingWebhook[0]) {
      return NextResponse.json(
        { error: 'Webhook with this name already exists' },
        { status: 409 }
      )
    }

    // Generate a secret for webhook verification
    const secret = crypto.randomBytes(32).toString('hex')

    // Create the webhook
    const webhookRecord = {
      id: nanoid(),
      name,
      url: endpoint,
      secret,
      description: description || null,
      isActive: true,
      timeout: timeout || 30,
      retryAttempts: retry || 3,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      userId: validation.user!.id,
      updatedAt: new Date(),
    }

    const [createdWebhook] = await db
      .insert(webhooks)
      .values(webhookRecord)
      .returning()

    return NextResponse.json({
      success: true,
      data: {
        id: createdWebhook.id,
        name: createdWebhook.name,
        url: createdWebhook.url,
        secret: createdWebhook.secret,
        description: createdWebhook.description,
        isActive: createdWebhook.isActive,
        timeout: createdWebhook.timeout,
        retryAttempts: createdWebhook.retryAttempts,
        createdAt: createdWebhook.createdAt
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/v1/webhooks
 * Remove a webhook by name
 * Body: { name: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const validation = await validateApiKey(request)
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Webhook name is required' },
        { status: 400 }
      )
    }

    // Find the webhook
    const webhookRecord = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.name, name),
        eq(webhooks.userId, validation.user!.id)
      ))
      .limit(1)

    if (!webhookRecord[0]) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      )
    }

    // Delete the webhook
    await db
      .delete(webhooks)
      .where(eq(webhooks.id, webhookRecord[0].id))

    return NextResponse.json({
      success: true,
      message: `Webhook '${name}' has been removed`
    })
  } catch (error) {
    console.error('Error removing webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 
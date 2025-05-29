import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { webhooks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { createHmac } from 'crypto'

export async function POST(
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

    // Get the webhook
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

    if (!webhook.isActive) {
      return NextResponse.json({ error: 'Webhook is disabled' }, { status: 400 })
    }

    // Create test payload
    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      webhook_id: webhook.id,
      test: true,
      data: {
        message: 'This is a test webhook delivery from your email system',
        webhook_name: webhook.name,
        user_id: session.user.id
      }
    }

    const payloadString = JSON.stringify(testPayload)
    
    // Create webhook signature if secret exists
    let signature = null
    if (webhook.secret) {
      const hmac = createHmac('sha256', webhook.secret)
      hmac.update(payloadString)
      signature = `sha256=${hmac.digest('hex')}`
    }

    // Prepare headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'User-Agent': 'InboundEmail-Webhook/1.0',
      'X-Webhook-Event': 'webhook.test',
      'X-Webhook-ID': webhook.id,
      'X-Webhook-Timestamp': testPayload.timestamp,
    }

    if (signature) {
      headers['X-Webhook-Signature'] = signature
    }

    // Add custom headers if any
    if (webhook.headers) {
      try {
        const customHeaders = JSON.parse(webhook.headers)
        Object.assign(headers, customHeaders)
      } catch (error) {
        console.error('Error parsing custom headers:', error)
      }
    }

    // Send the webhook
    const startTime = Date.now()
    
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout((webhook.timeout || 30) * 1000)
      })

      const deliveryTime = Date.now() - startTime
      const responseBody = await response.text().catch(() => 'Unable to read response body')

      // Update webhook stats
      await db
        .update(webhooks)
        .set({
          lastUsed: new Date(),
          totalDeliveries: (webhook.totalDeliveries || 0) + 1,
          successfulDeliveries: response.ok ? (webhook.successfulDeliveries || 0) + 1 : (webhook.successfulDeliveries || 0),
          failedDeliveries: response.ok ? (webhook.failedDeliveries || 0) : (webhook.failedDeliveries || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(webhooks.id, webhook.id))

      return NextResponse.json({
        success: response.ok,
        statusCode: response.status,
        statusText: response.statusText,
        deliveryTime,
        responseBody: responseBody.substring(0, 1000), // Limit response body size
        headers: Object.fromEntries(response.headers.entries()),
        testPayload
      })

    } catch (error) {
      const deliveryTime = Date.now() - startTime
      let errorMessage = 'Unknown error'
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `Request timeout after ${webhook.timeout}s`
        } else {
          errorMessage = error.message
        }
      }

      // Update webhook stats for failure
      await db
        .update(webhooks)
        .set({
          lastUsed: new Date(),
          totalDeliveries: (webhook.totalDeliveries || 0) + 1,
          failedDeliveries: (webhook.failedDeliveries || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(webhooks.id, webhook.id))

      return NextResponse.json({
        success: false,
        error: errorMessage,
        deliveryTime,
        testPayload
      })
    }

  } catch (error) {
    console.error('Error testing webhook:', error)
    return NextResponse.json(
      { error: 'Failed to test webhook' },
      { status: 500 }
    )
  }
} 
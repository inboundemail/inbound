"use server"

import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { webhooks, type NewWebhook } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'

// ============================================================================
// WEBHOOK MANAGEMENT
// ============================================================================

export async function getWebhooks() {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return { error: 'Unauthorized' }
    }

    const userWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, session.user.id))
      .orderBy(webhooks.createdAt)

    return { success: true, webhooks: userWebhooks }
  } catch (error) {
    console.error('Error fetching webhooks:', error)
    return { error: 'Failed to fetch webhooks' }
  }
}

export async function getWebhook(id: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return { error: 'Unauthorized' }
    }

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))
      .limit(1)

    if (!webhook) {
      return { error: 'Webhook not found' }
    }

    return { success: true, webhook }
  } catch (error) {
    console.error('Error fetching webhook:', error)
    return { error: 'Failed to fetch webhook' }
  }
}

export async function createWebhook(data: {
  name: string
  url: string
  description?: string
  headers?: Record<string, string>
  timeout?: number
  retryAttempts?: number
}) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return { error: 'Unauthorized' }
    }

    const { name, url, description, headers: customHeaders, timeout, retryAttempts } = data

    // Validate required fields
    if (!name || !url) {
      return { error: 'Name and URL are required' }
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return { error: 'Invalid URL format' }
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
      return { error: 'A webhook with this name already exists' }
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

    // Revalidate relevant paths
    revalidatePath('/webhooks')
    revalidatePath('/emails')

    return { success: true, webhook: createdWebhook }
  } catch (error) {
    console.error('Error creating webhook:', error)
    return { error: 'Failed to create webhook' }
  }
}

export async function updateWebhook(id: string, data: {
  name?: string
  url?: string
  description?: string
  isActive?: boolean
  headers?: Record<string, string>
  timeout?: number
  retryAttempts?: number
}) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return { error: 'Unauthorized' }
    }

    const { name, url, description, isActive, headers: customHeaders, timeout, retryAttempts } = data

    // Validate URL format if provided
    if (url) {
      try {
        new URL(url)
      } catch {
        return { error: 'Invalid URL format' }
      }
    }

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
      return { error: 'Webhook not found' }
    }

    // Check if name already exists for this user (excluding current webhook)
    if (name && name !== existingWebhook.name) {
      const nameExists = await db
        .select()
        .from(webhooks)
        .where(and(
          eq(webhooks.userId, session.user.id),
          eq(webhooks.name, name)
        ))
        .limit(1)

      if (nameExists.length > 0 && nameExists[0].id !== id) {
        return { error: 'A webhook with this name already exists' }
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

    // Revalidate relevant paths
    revalidatePath('/webhooks')
    revalidatePath('/emails')

    return { success: true, webhook: updatedWebhook }
  } catch (error) {
    console.error('Error updating webhook:', error)
    return { error: 'Failed to update webhook' }
  }
}

export async function deleteWebhook(id: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return { error: 'Unauthorized' }
    }

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
      return { error: 'Webhook not found' }
    }

    // TODO: Check if webhook is being used by any email addresses
    // You might want to prevent deletion or cascade the deletion

    await db
      .delete(webhooks)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))

    // Revalidate relevant paths
    revalidatePath('/webhooks')
    revalidatePath('/emails')

    return { success: true, message: 'Webhook deleted successfully' }
  } catch (error) {
    console.error('Error deleting webhook:', error)
    return { error: 'Failed to delete webhook' }
  }
}

export async function testWebhook(id: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return { error: 'Unauthorized' }
    }

    // Get webhook details
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, id),
        eq(webhooks.userId, session.user.id)
      ))
      .limit(1)

    if (!webhook) {
      return { error: 'Webhook not found' }
    }

    if (!webhook.isActive) {
      return { error: 'Webhook is disabled' }
    }

    // Prepare test payload using the proper Inbound webhook format
    const testPayload = {
      event: 'email.received',
      timestamp: new Date().toISOString(),
      email: {
        id: `test-email-${Date.now()}`,
        messageId: `test-message-${Date.now()}@inbound.test`,
        from: {
          text: 'test@inbound.new',
          addresses: [{ name: 'Inbound Test', address: 'test@inbound.new' }]
        },
        to: {
          text: webhook.name || 'webhook@test.com',
          addresses: [{ name: null, address: webhook.name || 'webhook@test.com' }]
        },
        recipient: webhook.name || 'webhook@test.com',
        subject: 'Test webhook delivery from Inbound',
        receivedAt: new Date().toISOString(),
        parsedData: {
          messageId: `test-message-${Date.now()}@inbound.test`,
          date: new Date(),
          subject: 'Test webhook delivery from Inbound',
          from: {
            text: 'test@inbound.new',
            addresses: [{ name: 'Inbound Test', address: 'test@inbound.new' }]
          },
          to: {
            text: webhook.name || 'webhook@test.com',
            addresses: [{ name: null, address: webhook.name || 'webhook@test.com' }]
          },
          cc: null,
          bcc: null,
          replyTo: null,
          inReplyTo: undefined,
          references: undefined,
          textBody: 'This is a test webhook delivery from Inbound to verify your endpoint is working correctly.',
          htmlBody: '<p>This is a test webhook delivery from <strong>Inbound</strong> to verify your endpoint is working correctly.</p>',
          attachments: [],
          headers: {},
          priority: undefined
        },
        cleanedContent: {
          html: '<p>This is a test webhook delivery from <strong>Inbound</strong> to verify your endpoint is working correctly.</p>',
          text: 'This is a test webhook delivery from Inbound to verify your endpoint is working correctly.',
          hasHtml: true,
          hasText: true,
          attachments: [],
          headers: {}
        }
      },
      endpoint: {
        id: webhook.id,
        name: webhook.name,
        type: 'webhook' as const
      }
    }

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Inbound-Webhook/1.0',
      'X-Webhook-Signature': webhook.secret || '', // In production, this should be a proper HMAC signature
    }

    // Add custom headers if any
    if (webhook.headers) {
      try {
        const customHeaders = JSON.parse(webhook.headers)
        Object.assign(requestHeaders, customHeaders)
      } catch (error) {
        console.error('Error parsing custom headers:', error)
      }
    }

    // Make the webhook request
    const startTime = Date.now()
    let responseBody = ''
    let responseHeaders: Record<string, string> = {}
    
    try {
      console.log(`🔗 Testing webhook: ${webhook.name} (${webhook.url})`)
      console.log(`📤 Test payload:`, JSON.stringify(testPayload, null, 2))
      console.log(`📋 Request headers:`, JSON.stringify(requestHeaders, null, 2))
      
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout((webhook.timeout || 30) * 1000)
      })

      const responseTime = Date.now() - startTime
      
      // Capture response headers
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      
      // Capture response body
      try {
        responseBody = await response.text()
      } catch (bodyError) {
        responseBody = 'Unable to read response body'
        console.error(`❌ Error reading response body:`, bodyError)
      }

      console.log(`${response.ok ? '✅' : '❌'} Webhook test ${response.ok ? 'succeeded' : 'failed'}: ${response.status} in ${responseTime}ms`)
      console.log(`📨 Response headers:`, JSON.stringify(responseHeaders, null, 2))
      console.log(`📄 Response body:`, responseBody)

      // Update webhook stats (you might want to add these fields to your schema)
      await db
        .update(webhooks)
        .set({
          lastUsed: new Date(),
          totalDeliveries: (webhook.totalDeliveries || 0) + 1,
          successfulDeliveries: response.ok ? (webhook.successfulDeliveries || 0) + 1 : (webhook.successfulDeliveries || 0),
          failedDeliveries: response.ok ? (webhook.failedDeliveries || 0) : (webhook.failedDeliveries || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(webhooks.id, id))

      // Revalidate relevant paths
      revalidatePath('/webhooks')

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          message: `Webhook test successful! Response: ${response.status}`,
          responseTime,
          responseBody: responseBody.substring(0, 1000), // Limit response body for client
          responseHeaders
        }
      } else {
        const errorDetails = `Status: ${response.status} ${response.statusText}`
        console.error(`❌ Webhook test failed - ${errorDetails}`)
        console.error(`❌ Response body:`, responseBody)
        
        return {
          success: false,
          statusCode: response.status,
          error: `Webhook test failed with status: ${response.status} ${response.statusText}`,
          responseTime,
          responseBody: responseBody.substring(0, 1000), // Limit response body for client
          responseHeaders,
          details: {
            url: webhook.url,
            timeout: webhook.timeout || 30,
            statusText: response.statusText
          }
        }
      }
    } catch (fetchError: any) {
      const responseTime = Date.now() - startTime
      let errorMessage = 'Unknown error'
      let errorType = 'network'
      
      if (fetchError.name === 'TimeoutError' || fetchError.name === 'AbortError') {
        errorMessage = `Request timeout after ${webhook.timeout || 30} seconds`
        errorType = 'timeout'
      } else if (fetchError.name === 'TypeError' && fetchError.message.includes('fetch')) {
        errorMessage = `Network error: ${fetchError.message}`
        errorType = 'network'
      } else {
        errorMessage = fetchError.message || 'Unknown error'
        errorType = 'unknown'
      }

      console.error(`❌ Webhook test failed with ${errorType} error:`, errorMessage)
      console.error(`❌ Full error details:`, fetchError)
      
      // Update failed delivery count
      await db
        .update(webhooks)
        .set({
          totalDeliveries: (webhook.totalDeliveries || 0) + 1,
          failedDeliveries: (webhook.failedDeliveries || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(webhooks.id, id))

      // Revalidate relevant paths
      revalidatePath('/webhooks')

      return {
        success: false,
        error: `Webhook test failed: ${errorMessage}`,
        responseTime,
        details: {
          url: webhook.url,
          timeout: webhook.timeout || 30,
          errorType,
          originalError: fetchError.message
        }
      }
    }
  } catch (error) {
    console.error('Error testing webhook:', error)
    return { error: 'Failed to test webhook' }
  }
} 
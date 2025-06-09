"use server"

import { auth } from "@/lib/auth"
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

    // Prepare test payload
    const testPayload = {
      event: 'webhook_test',
      timestamp: new Date().toISOString(),
      webhook_id: webhook.id,
      test: true,
      data: {
        message: 'This is a test webhook delivery from Inbound'
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
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout((webhook.timeout || 30) * 1000)
      })

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
          message: `Webhook test successful! Response: ${response.status}`
        }
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: `Webhook test failed with status: ${response.status}`
        }
      }
    } catch (fetchError: any) {
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

      if (fetchError.name === 'TimeoutError') {
        return {
          success: false,
          error: `Webhook test timed out after ${webhook.timeout} seconds`
        }
      }

      return {
        success: false,
        error: `Webhook test failed: ${fetchError.message}`
      }
    }
  } catch (error) {
    console.error('Error testing webhook:', error)
    return { error: 'Failed to test webhook' }
  }
} 
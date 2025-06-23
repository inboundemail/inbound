"use server"

import { db } from '@/lib/db'
import { webhooks, endpoints, emailGroups } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Webhook, NewEndpoint } from '@/lib/db/schema'
import type { WebhookConfig } from '@/features/endpoints/types'

export interface MigrationResult {
  success: boolean
  migratedCount: number
  skippedCount: number
  errors: string[]
}

/**
 * Check if a user has any webhooks that need to be migrated to endpoints
 */
export async function checkWebhookMigrationNeeded(userId: string): Promise<boolean> {
  try {
    // Check if user has any webhooks
    const userWebhooks = await db
      .select({ id: webhooks.id })
      .from(webhooks)
      .where(eq(webhooks.userId, userId))
      .limit(1)

    if (userWebhooks.length === 0) {
      return false // No webhooks to migrate
    }

    // Check if user already has any endpoints
    const userEndpoints = await db
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(eq(endpoints.userId, userId))
      .limit(1)

    // Migration is needed if user has webhooks but no endpoints
    return userEndpoints.length === 0
  } catch (error) {
    console.error('Error checking webhook migration status:', error)
    return false
  }
}

/**
 * Migrate all webhooks for a user to the new endpoints system
 */
export async function migrateUserWebhooksToEndpoints(userId: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migratedCount: 0,
    skippedCount: 0,
    errors: []
  }

  try {
    console.log(`🔄 Starting webhook migration for user: ${userId}`)

    // Get all webhooks for the user
    const userWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, userId))

    if (userWebhooks.length === 0) {
      console.log(`ℹ️ No webhooks found for user: ${userId}`)
      result.success = true
      return result
    }

    console.log(`📋 Found ${userWebhooks.length} webhooks to migrate for user: ${userId}`)

    // Check which webhooks have already been migrated by looking for existing endpoints with matching names
    const existingEndpoints = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.userId, userId))

    const existingEndpointNames = new Set(existingEndpoints.map(e => e.name))

    for (const webhook of userWebhooks) {
      try {
        // Skip if an endpoint with the same name already exists
        if (existingEndpointNames.has(webhook.name)) {
          console.log(`⏭️ Skipping webhook "${webhook.name}" - endpoint already exists`)
          result.skippedCount++
          continue
        }

        // Build webhook config from existing webhook data
        const webhookConfig: WebhookConfig = {
          url: webhook.url,
          timeout: webhook.timeout || 30,
          retryAttempts: webhook.retryAttempts || 3,
          headers: webhook.headers ? JSON.parse(webhook.headers) : {}
        }

        // Add secret if it exists
        if (webhook.secret) {
          webhookConfig.secret = webhook.secret
        }

        // Create new endpoint
        const newEndpoint: NewEndpoint = {
          id: nanoid(),
          name: webhook.name,
          type: 'webhook',
          config: JSON.stringify(webhookConfig),
          isActive: webhook.isActive ?? true,
          description: webhook.description || `Migrated from webhook: ${webhook.name}`,
          userId: userId,
          createdAt: new Date(),
          updatedAt: new Date()
        }

        const [createdEndpoint] = await db.insert(endpoints).values(newEndpoint).returning()

        console.log(`✅ Migrated webhook "${webhook.name}" to endpoint "${createdEndpoint.name}"`)
        result.migratedCount++

      } catch (error) {
        const errorMessage = `Failed to migrate webhook "${webhook.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`❌ ${errorMessage}`)
        result.errors.push(errorMessage)
      }
    }

    result.success = result.errors.length === 0 || result.migratedCount > 0
    
    console.log(`🏁 Migration completed for user ${userId}:`)
    console.log(`   - Migrated: ${result.migratedCount}`)
    console.log(`   - Skipped: ${result.skippedCount}`)
    console.log(`   - Errors: ${result.errors.length}`)

    return result

  } catch (error) {
    const errorMessage = `Migration failed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    console.error(`❌ ${errorMessage}`)
    result.errors.push(errorMessage)
    return result
  }
}

/**
 * Get migration status for a user
 */
export async function getMigrationStatus(userId: string): Promise<{
  hasWebhooks: boolean
  hasEndpoints: boolean
  migrationNeeded: boolean
  webhookCount: number
  endpointCount: number
}> {
  try {
    const [webhookCount, endpointCount] = await Promise.all([
      db.select({ count: webhooks.id }).from(webhooks).where(eq(webhooks.userId, userId)),
      db.select({ count: endpoints.id }).from(endpoints).where(eq(endpoints.userId, userId))
    ])

    const hasWebhooks = webhookCount.length > 0
    const hasEndpoints = endpointCount.length > 0
    const migrationNeeded = hasWebhooks && !hasEndpoints

    return {
      hasWebhooks,
      hasEndpoints,
      migrationNeeded,
      webhookCount: webhookCount.length,
      endpointCount: endpointCount.length
    }
  } catch (error) {
    console.error('Error getting migration status:', error)
    return {
      hasWebhooks: false,
      hasEndpoints: false,
      migrationNeeded: false,
      webhookCount: 0,
      endpointCount: 0
    }
  }
} 
"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { endpoints, emailGroups, emailAddresses, emailDomains, endpointDeliveries } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { CreateEndpointData, UpdateEndpointData } from '@/features/endpoints/types'
import { migrateUserWebhooksToEndpoints, checkWebhookMigrationNeeded } from '@/lib/webhook-migration'

export async function createEndpoint(data: CreateEndpointData) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    console.log(`📝 createEndpoint - Creating ${data.type} endpoint: ${data.name}`)

    const newEndpoint = {
      id: nanoid(),
      name: data.name,
      type: data.type,
      config: JSON.stringify(data.config),
      description: data.description || null,
      userId: session.user.id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const [createdEndpoint] = await db.insert(endpoints).values(newEndpoint).returning()
    
    // If it's an email group, create the group entries
    if (data.type === 'email_group' && 'emails' in data.config) {
      const groupEntries = data.config.emails.map(email => ({
        id: nanoid(),
        endpointId: createdEndpoint.id,
        emailAddress: email,
        createdAt: new Date()
      }))
      
      if (groupEntries.length > 0) {
        await db.insert(emailGroups).values(groupEntries)
        console.log(`📮 createEndpoint - Created ${groupEntries.length} email group entries`)
      }
    }

    console.log(`✅ createEndpoint - Successfully created endpoint ${createdEndpoint.id}`)
    return { success: true, endpoint: createdEndpoint }

  } catch (error) {
    console.error('❌ createEndpoint - Error creating endpoint:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create endpoint' 
    }
  }
}

export async function updateEndpoint(id: string, data: UpdateEndpointData) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    console.log(`📝 updateEndpoint - Updating endpoint ${id}`)

    // Check if endpoint exists and belongs to user
    const existingEndpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, id),
        eq(endpoints.userId, session.user.id)
      ))
      .limit(1)

    if (!existingEndpoint[0]) {
      return { success: false, error: 'Endpoint not found or access denied' }
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date()
    }

    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.config !== undefined) updateData.config = JSON.stringify(data.config)

    // Update the endpoint
    const [updatedEndpoint] = await db
      .update(endpoints)
      .set(updateData)
      .where(eq(endpoints.id, id))
      .returning()

    // If config was updated and it's an email group, update the group entries
    if (data.config && existingEndpoint[0].type === 'email_group' && 'emails' in data.config) {
      // Delete existing group entries
      await db.delete(emailGroups).where(eq(emailGroups.endpointId, id))
      
      // Create new group entries
      const groupEntries = data.config.emails.map(email => ({
        id: nanoid(),
        endpointId: id,
        emailAddress: email,
        createdAt: new Date()
      }))
      
      if (groupEntries.length > 0) {
        await db.insert(emailGroups).values(groupEntries)
        console.log(`📮 updateEndpoint - Updated ${groupEntries.length} email group entries`)
      }
    }

    console.log(`✅ updateEndpoint - Successfully updated endpoint ${id}`)
    return { success: true, endpoint: updatedEndpoint }

  } catch (error) {
    console.error('❌ updateEndpoint - Error updating endpoint:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update endpoint' 
    }
  }
}

export async function deleteEndpoint(id: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    console.log(`🗑️ deleteEndpoint - Deleting endpoint ${id}`)

    // Check if endpoint exists and belongs to user
    const existingEndpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, id),
        eq(endpoints.userId, session.user.id)
      ))
      .limit(1)

    if (!existingEndpoint[0]) {
      return { success: false, error: 'Endpoint not found or access denied' }
    }

    // Update email addresses to "store only" (clear endpointId) before deleting the endpoint
    const updatedEmailAddresses = await db
      .update(emailAddresses)
      .set({ 
        endpointId: null,
        updatedAt: new Date()
      })
      .where(eq(emailAddresses.endpointId, id))
      .returning({ address: emailAddresses.address })

    if (updatedEmailAddresses.length > 0) {
      console.log(`📧 deleteEndpoint - Updated ${updatedEmailAddresses.length} email addresses to store-only mode:`, 
        updatedEmailAddresses.map(e => e.address).join(', '))
    }

    // Update domain catch-all configurations to remove this endpoint
    await db
      .update(emailDomains)
      .set({ 
        catchAllEndpointId: null,
        updatedAt: new Date()
      })
      .where(eq(emailDomains.catchAllEndpointId, id))

    // Delete email group entries if it's an email group
    if (existingEndpoint[0].type === 'email_group') {
      await db.delete(emailGroups).where(eq(emailGroups.endpointId, id))
      console.log(`📮 deleteEndpoint - Deleted email group entries for endpoint ${id}`)
    }

    // Delete endpoint delivery history
    await db.delete(endpointDeliveries).where(eq(endpointDeliveries.endpointId, id))
    console.log(`📊 deleteEndpoint - Deleted delivery history for endpoint ${id}`)

    // Delete the endpoint
    await db.delete(endpoints).where(eq(endpoints.id, id))

    console.log(`✅ deleteEndpoint - Successfully deleted endpoint ${id}`)
    return { 
      success: true, 
      emailAddressesUpdated: updatedEmailAddresses.length,
      message: updatedEmailAddresses.length > 0 
        ? `Endpoint deleted. ${updatedEmailAddresses.length} email address(es) switched to store-only mode.`
        : 'Endpoint deleted successfully.'
    }

  } catch (error) {
    console.error('❌ deleteEndpoint - Error deleting endpoint:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete endpoint' 
    }
  }
}

export async function deleteMultipleEndpoints(ids: string[]) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  if (!ids.length) {
    return { success: false, error: 'No endpoints selected for deletion' }
  }

  try {
    console.log(`🗑️ deleteMultipleEndpoints - Deleting ${ids.length} endpoints`)

    // Check if all endpoints exist and belong to user
    const existingEndpoints = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.userId, session.user.id)
      ))

    const validIds = existingEndpoints
      .filter(endpoint => ids.includes(endpoint.id))
      .map(endpoint => endpoint.id)

    if (validIds.length !== ids.length) {
      return { success: false, error: 'Some endpoints not found or access denied' }
    }

    let deletedCount = 0
    const errors: string[] = []

    let totalEmailAddressesUpdated = 0

    // Delete each endpoint (we need to handle cleanup individually)
    for (const id of validIds) {
      try {
        const endpoint = existingEndpoints.find(e => e.id === id)
        
        // Update email addresses to "store only" (clear endpointId) before deleting the endpoint
        const updatedEmailAddresses = await db
          .update(emailAddresses)
          .set({ 
            endpointId: null,
            updatedAt: new Date()
          })
          .where(eq(emailAddresses.endpointId, id))
          .returning({ address: emailAddresses.address })

        totalEmailAddressesUpdated += updatedEmailAddresses.length

        if (updatedEmailAddresses.length > 0) {
          console.log(`📧 deleteMultipleEndpoints - Updated ${updatedEmailAddresses.length} email addresses to store-only mode for endpoint ${id}`)
        }

        // Update domain catch-all configurations to remove this endpoint
        await db
          .update(emailDomains)
          .set({ 
            catchAllEndpointId: null,
            updatedAt: new Date()
          })
          .where(eq(emailDomains.catchAllEndpointId, id))

        // Delete email group entries if it's an email group
        if (endpoint?.type === 'email_group') {
          await db.delete(emailGroups).where(eq(emailGroups.endpointId, id))
        }

        // Delete endpoint delivery history
        await db.delete(endpointDeliveries).where(eq(endpointDeliveries.endpointId, id))

        // Delete the endpoint
        await db.delete(endpoints).where(eq(endpoints.id, id))
        deletedCount++
        
      } catch (error) {
        console.error(`❌ Error deleting endpoint ${id}:`, error)
        errors.push(`Failed to delete endpoint ${id}`)
      }
    }

    console.log(`✅ deleteMultipleEndpoints - Successfully deleted ${deletedCount}/${ids.length} endpoints`)
    
    if (errors.length > 0) {
      return { 
        success: false, 
        error: `Partially completed: ${deletedCount} deleted, ${errors.length} failed. ${errors.join(', ')}`,
        deletedCount,
        emailAddressesUpdated: totalEmailAddressesUpdated
      }
    }

    return { 
      success: true, 
      deletedCount,
      emailAddressesUpdated: totalEmailAddressesUpdated,
      message: totalEmailAddressesUpdated > 0 
        ? `${deletedCount} endpoint(s) deleted. ${totalEmailAddressesUpdated} email address(es) switched to store-only mode.`
        : `${deletedCount} endpoint(s) deleted successfully.`
    }

  } catch (error) {
    console.error('❌ deleteMultipleEndpoints - Error deleting endpoints:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete endpoints' 
    }
  }
}

export async function getEndpoints() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    const userEndpoints = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.userId, session.user.id))
      .orderBy(endpoints.createdAt)

    console.log(`📋 getEndpoints - Retrieved ${userEndpoints.length} endpoints for user ${session.user.id}`)
    return { success: true, endpoints: userEndpoints }

  } catch (error) {
    console.error('❌ getEndpoints - Error fetching endpoints:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch endpoints' 
    }
  }
}

export async function testEndpoint(id: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    console.log(`🧪 testEndpoint - Testing endpoint ${id}`)

    // Check if endpoint exists and belongs to user
    const endpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, id),
        eq(endpoints.userId, session.user.id)
      ))
      .limit(1)

    if (!endpoint[0]) {
      return { success: false, error: 'Endpoint not found or access denied' }
    }

    const config = JSON.parse(endpoint[0].config)
    const startTime = Date.now()

    let testResult: any = {
      success: false,
      message: 'Test not implemented for this endpoint type',
      responseTime: 0
    }

    switch (endpoint[0].type) {
      case 'webhook':
        // Test webhook by sending a test payload
        try {
          const response = await fetch(config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'InboundEmail-Test/1.0',
              'X-Test-Request': 'true',
              ...(config.headers ? JSON.parse(config.headers) : {})
            },
            body: JSON.stringify({
              event: 'test',
              timestamp: new Date().toISOString(),
              message: 'This is a test request from the Inbound Email service'
            }),
            signal: AbortSignal.timeout((config.timeout || 30) * 1000)
          })

          const responseTime = Date.now() - startTime
          testResult = {
            success: response.ok,
            message: response.ok ? 'Webhook responded successfully' : `Webhook returned ${response.status}`,
            responseTime,
            statusCode: response.status
          }

        } catch (error) {
          testResult = {
            success: false,
            message: error instanceof Error ? error.message : 'Webhook test failed',
            responseTime: Date.now() - startTime
          }
        }
        break

      case 'email':
      case 'email_group':
        // For email endpoints, we can't really "test" without sending an actual email
        // So we'll just validate the configuration
        const emails = endpoint[0].type === 'email_group' ? config.emails : [config.forwardTo]
        const validEmails = emails.every((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        
        testResult = {
          success: validEmails,
          message: validEmails 
            ? `Email configuration is valid (${emails.length} recipient${emails.length > 1 ? 's' : ''})`
            : 'Invalid email address(es) in configuration',
          responseTime: Date.now() - startTime
        }
        break
    }

    console.log(`${testResult.success ? '✅' : '❌'} testEndpoint - Test ${testResult.success ? 'passed' : 'failed'} for endpoint ${id}`)
    return testResult

  } catch (error) {
    console.error('❌ testEndpoint - Error testing endpoint:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to test endpoint' 
    }
  }
}

export async function checkMigrationNeeded() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    const migrationNeeded = await checkWebhookMigrationNeeded(session.user.id)
    return { success: true, migrationNeeded }
  } catch (error) {
    console.error('Error checking migration status:', error)
    return { success: false, error: 'Failed to check migration status' }
  }
}

export async function migrateWebhooksToEndpoints() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    const result = await migrateUserWebhooksToEndpoints(session.user.id)
    
    if (result.success) {
      return { 
        success: true, 
        migratedCount: result.migratedCount,
        skippedCount: result.skippedCount,
        message: `Successfully migrated ${result.migratedCount} webhooks to endpoints`
      }
    } else {
      return { 
        success: false, 
        error: `Migration failed: ${result.errors.join(', ')}` 
      }
    }
  } catch (error) {
    console.error('Error in migrateWebhooksToEndpoints:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to migrate webhooks' 
    }
  }
} 
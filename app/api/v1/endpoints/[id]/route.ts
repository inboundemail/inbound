import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { endpoints, emailGroups, endpointDeliveries, emailAddresses, emailDomains } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { UpdateEndpointData } from '@/features/endpoints/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`📋 GET /api/v1/endpoints/${params.id} - Fetching endpoint details`)
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn(`❌ GET /api/v1/endpoints/${params.id} - Unauthorized request`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the endpoint
    const endpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, params.id),
        eq(endpoints.userId, session.user.id)
      ))
      .limit(1)

    if (!endpoint[0]) {
      return NextResponse.json(
        { error: 'Endpoint not found or access denied' },
        { status: 404 }
      )
    }

    // If it's an email group, fetch the group emails
    let groupEmails: string[] = []
    if (endpoint[0].type === 'email_group') {
      const emailRecords = await db
        .select({ emailAddress: emailGroups.emailAddress })
        .from(emailGroups)
        .where(eq(emailGroups.endpointId, params.id))

      groupEmails = emailRecords.map(record => record.emailAddress)
    }

    // Fetch delivery statistics
    const deliveryStats = await db
      .select({
        status: endpointDeliveries.status,
        count: endpointDeliveries.id // We'll count these
      })
      .from(endpointDeliveries)
      .where(eq(endpointDeliveries.endpointId, params.id))

    // Calculate delivery statistics
    const totalDeliveries = deliveryStats.length
    const successfulDeliveries = deliveryStats.filter(d => d.status === 'success').length
    const failedDeliveries = deliveryStats.filter(d => d.status === 'failed').length
    const successRate = totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 0

    const endpointWithDetails = {
      ...endpoint[0],
      groupEmails,
      deliveryStats: {
        total: totalDeliveries,
        successful: successfulDeliveries,
        failed: failedDeliveries,
        successRate
      }
    }

    console.log(`✅ GET /api/v1/endpoints/${params.id} - Retrieved endpoint details`)

    return NextResponse.json({
      success: true,
      endpoint: endpointWithDetails
    })

  } catch (error) {
    console.error(`❌ GET /api/v1/endpoints/${params.id} - Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch endpoint',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`📝 PUT /api/v1/endpoints/${params.id} - Updating endpoint`)
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn(`❌ PUT /api/v1/endpoints/${params.id} - Unauthorized request`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data: UpdateEndpointData = await request.json()

    // Check if endpoint exists and belongs to user
    const existingEndpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, params.id),
        eq(endpoints.userId, session.user.id)
      ))
      .limit(1)

    if (!existingEndpoint[0]) {
      return NextResponse.json(
        { error: 'Endpoint not found or access denied' },
        { status: 404 }
      )
    }

    // Validate config if provided
    if (data.config) {
      const validationResult = validateEndpointConfig(existingEndpoint[0].type, data.config)
      if (!validationResult.valid) {
        return NextResponse.json(
          { error: `Invalid configuration: ${validationResult.error}` },
          { status: 400 }
        )
      }
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
      .where(eq(endpoints.id, params.id))
      .returning()

    // If config was updated and it's an email group, update the group entries
    if (data.config && existingEndpoint[0].type === 'email_group' && 'emails' in data.config) {
      // Delete existing group entries
      await db.delete(emailGroups).where(eq(emailGroups.endpointId, params.id))
      
      // Create new group entries
      const groupEntries = data.config.emails.map(email => ({
        id: nanoid(),
        endpointId: params.id,
        emailAddress: email,
        createdAt: new Date()
      }))
      
      if (groupEntries.length > 0) {
        await db.insert(emailGroups).values(groupEntries)
        console.log(`📮 PUT /api/v1/endpoints/${params.id} - Updated ${groupEntries.length} email group entries`)
      }
    }

    console.log(`✅ PUT /api/v1/endpoints/${params.id} - Successfully updated endpoint`)

    return NextResponse.json({
      success: true,
      endpoint: updatedEndpoint
    })

  } catch (error) {
    console.error(`❌ PUT /api/v1/endpoints/${params.id} - Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update endpoint',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`🗑️ DELETE /api/v1/endpoints/${params.id} - Deleting endpoint`)
    
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn(`❌ DELETE /api/v1/endpoints/${params.id} - Unauthorized request`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if endpoint exists and belongs to user
    const existingEndpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, params.id),
        eq(endpoints.userId, session.user.id)
      ))
      .limit(1)

    if (!existingEndpoint[0]) {
      return NextResponse.json(
        { error: 'Endpoint not found or access denied' },
        { status: 404 }
      )
    }

    // Update email addresses to "store only" (clear endpointId) before deleting the endpoint
    const updatedEmailAddresses = await db
      .update(emailAddresses)
      .set({ 
        endpointId: null,
        updatedAt: new Date()
      })
      .where(eq(emailAddresses.endpointId, params.id))
      .returning({ address: emailAddresses.address })

    if (updatedEmailAddresses.length > 0) {
      console.log(`📧 DELETE /api/v1/endpoints/${params.id} - Updated ${updatedEmailAddresses.length} email addresses to store-only mode:`, 
        updatedEmailAddresses.map(e => e.address).join(', '))
    }

    // Update domain catch-all configurations to remove this endpoint
    await db
      .update(emailDomains)
      .set({ 
        catchAllEndpointId: null,
        updatedAt: new Date()
      })
      .where(eq(emailDomains.catchAllEndpointId, params.id))

    // Delete email group entries if it's an email group
    if (existingEndpoint[0].type === 'email_group') {
      await db.delete(emailGroups).where(eq(emailGroups.endpointId, params.id))
      console.log(`📮 DELETE /api/v1/endpoints/${params.id} - Deleted email group entries`)
    }

    // Delete delivery history
    await db.delete(endpointDeliveries).where(eq(endpointDeliveries.endpointId, params.id))
    console.log(`📊 DELETE /api/v1/endpoints/${params.id} - Deleted delivery history`)

    // Delete the endpoint
    await db.delete(endpoints).where(eq(endpoints.id, params.id))

    console.log(`✅ DELETE /api/v1/endpoints/${params.id} - Successfully deleted endpoint`)

    return NextResponse.json({
      success: true,
      message: updatedEmailAddresses.length > 0 
        ? `Endpoint deleted successfully. ${updatedEmailAddresses.length} email address(es) switched to store-only mode.`
        : 'Endpoint deleted successfully',
      emailAddressesUpdated: updatedEmailAddresses.length
    })

  } catch (error) {
    console.error(`❌ DELETE /api/v1/endpoints/${params.id} - Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete endpoint',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Validate endpoint configuration based on type
 */
function validateEndpointConfig(type: string, config: any): { valid: boolean; error?: string } {
  try {
    switch (type) {
      case 'webhook':
        if (!config.url) {
          return { valid: false, error: 'Webhook URL is required' }
        }
        if (typeof config.url !== 'string') {
          return { valid: false, error: 'Webhook URL must be a string' }
        }
        // Basic URL validation
        try {
          new URL(config.url)
        } catch {
          return { valid: false, error: 'Invalid webhook URL format' }
        }
        break

      case 'email':
        if (!config.forwardTo) {
          return { valid: false, error: 'Forward-to email address is required' }
        }
        if (typeof config.forwardTo !== 'string') {
          return { valid: false, error: 'Forward-to email must be a string' }
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(config.forwardTo)) {
          return { valid: false, error: 'Invalid forward-to email address format' }
        }
        break

      case 'email_group':
        if (!config.emails || !Array.isArray(config.emails)) {
          return { valid: false, error: 'Email group must have an emails array' }
        }
        if (config.emails.length === 0) {
          return { valid: false, error: 'Email group must have at least one email address' }
        }
        // Validate each email in the group
        const emailRegexGroup = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        for (const email of config.emails) {
          if (typeof email !== 'string' || !emailRegexGroup.test(email)) {
            return { valid: false, error: `Invalid email address in group: ${email}` }
          }
        }
        break

      default:
        return { valid: false, error: 'Unknown endpoint type' }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: 'Configuration validation failed' }
  }
} 
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/app/api/v1/lib/auth'
import { db } from '@/lib/db'
import { endpoints, emailGroups, endpointDeliveries, emailAddresses, emailDomains } from '@/lib/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { UpdateEndpointData } from '@/features/endpoints/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log(`📋 GET /api/v1.1/endpoints/${params.id} - Fetching endpoint details`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Get endpoint with user verification
    const endpointResult = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, params.id),
        eq(endpoints.userId, userId)
      ))
      .limit(1)

    if (!endpointResult[0]) {
      return NextResponse.json({
        success: false,
        error: 'Endpoint not found'
      }, { status: 404 })
    }

    const endpoint = endpointResult[0]

    // Get group emails if it's an email_group endpoint
    let groupEmails: string[] | null = null
    if (endpoint.type === 'email_group') {
      const groupEmailsResult = await db
        .select({ emailAddress: emailGroups.emailAddress })
        .from(emailGroups)
        .where(eq(emailGroups.endpointId, endpoint.id))
        .orderBy(emailGroups.createdAt)

      groupEmails = groupEmailsResult.map((g: any) => g.emailAddress)
    }

    // Get delivery statistics
    const deliveryStatsResult = await db
      .select({
        total: count(),
        status: endpointDeliveries.status
      })
      .from(endpointDeliveries)
      .where(eq(endpointDeliveries.endpointId, endpoint.id))
      .groupBy(endpointDeliveries.status)

    let totalDeliveries = 0
    let successfulDeliveries = 0
    let failedDeliveries = 0

    for (const stat of deliveryStatsResult) {
      totalDeliveries += stat.total
      if (stat.status === 'success') successfulDeliveries += stat.total
      if (stat.status === 'failed') failedDeliveries += stat.total
    }

    // Get recent deliveries
    const recentDeliveries = await db
      .select({
        id: endpointDeliveries.id,
        emailId: endpointDeliveries.emailId,
        deliveryType: endpointDeliveries.deliveryType,
        status: endpointDeliveries.status,
        attempts: endpointDeliveries.attempts,
        lastAttemptAt: endpointDeliveries.lastAttemptAt,
        responseData: endpointDeliveries.responseData,
        createdAt: endpointDeliveries.createdAt
      })
      .from(endpointDeliveries)
      .where(eq(endpointDeliveries.endpointId, endpoint.id))
      .orderBy(desc(endpointDeliveries.createdAt))
      .limit(10)

    // Get associated email addresses
    const associatedEmails = await db
      .select({
        id: emailAddresses.id,
        address: emailAddresses.address,
        isActive: emailAddresses.isActive,
        createdAt: emailAddresses.createdAt
      })
      .from(emailAddresses)
      .where(eq(emailAddresses.endpointId, endpoint.id))
      .orderBy(emailAddresses.createdAt)

    // Get catch-all domains using this endpoint
    const catchAllDomains = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        status: emailDomains.status
      })
      .from(emailDomains)
      .where(eq(emailDomains.catchAllEndpointId, endpoint.id))

    const response = {
      ...endpoint,
      config: JSON.parse(endpoint.config),
      groupEmails,
      deliveryStats: {
        total: totalDeliveries,
        successful: successfulDeliveries,
        failed: failedDeliveries,
        successRate: totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 0
      },
      recentDeliveries: recentDeliveries.map((delivery: any) => ({
        ...delivery,
        responseData: delivery.responseData ? JSON.parse(delivery.responseData) : null
      })),
      associatedEmails,
      catchAllDomains,
      usage: {
        emailAddressCount: associatedEmails.length,
        catchAllDomainCount: catchAllDomains.length,
        totalEmailsProcessed: totalDeliveries
      }
    }

    console.log(`✅ GET /api/v1.1/endpoints/${params.id} - Retrieved endpoint details`)

    return NextResponse.json({
      success: true,
      data: response
    })

  } catch (error) {
    console.error(`❌ GET /api/v1.1/endpoints/${params.id} - Error:`, error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch endpoint details',
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
    console.log(`📝 PUT /api/v1.1/endpoints/${params.id} - Updating endpoint`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const data: UpdateEndpointData = await request.json()

    // Check if endpoint exists and belongs to user
    const existingEndpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, params.id),
        eq(endpoints.userId, userId)
      ))
      .limit(1)

    if (!existingEndpoint[0]) {
      return NextResponse.json({
        success: false,
        error: 'Endpoint not found'
      }, { status: 404 })
    }

    // Validate config if provided
    if (data.config) {
      const validationResult = validateEndpointConfig(existingEndpoint[0].type, data.config)
      if (!validationResult.valid) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid configuration',
            details: validationResult.error
          },
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
      const groupEntries = data.config.emails.map((email: string) => ({
        id: nanoid(),
        endpointId: params.id,
        emailAddress: email,
        createdAt: new Date()
      }))
      
      if (groupEntries.length > 0) {
        await db.insert(emailGroups).values(groupEntries)
        console.log(`📮 PUT /api/v1.1/endpoints/${params.id} - Updated ${groupEntries.length} email group entries`)
      }
    }

    // Return enhanced response
    const response = {
      ...updatedEndpoint,
      config: JSON.parse(updatedEndpoint.config),
      groupEmails: existingEndpoint[0].type === 'email_group' && data.config && 'emails' in data.config 
        ? data.config.emails 
        : null
    }

    console.log(`✅ PUT /api/v1.1/endpoints/${params.id} - Successfully updated endpoint`)

    return NextResponse.json({
      success: true,
      data: response,
      message: 'Endpoint updated successfully'
    })

  } catch (error) {
    console.error(`❌ PUT /api/v1.1/endpoints/${params.id} - Error:`, error)
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
    console.log(`🗑️ DELETE /api/v1.1/endpoints/${params.id} - Deleting endpoint`)
    
    const validation = await validateApiKey(request)
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 401 })
    }

    const userId = validation.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Check if endpoint exists and belongs to user
    const existingEndpoint = await db
      .select()
      .from(endpoints)
      .where(and(
        eq(endpoints.id, params.id),
        eq(endpoints.userId, userId)
      ))
      .limit(1)

    if (!existingEndpoint[0]) {
      return NextResponse.json({
        success: false,
        error: 'Endpoint not found'
      }, { status: 404 })
    }

    // Check for dependencies
    const associatedEmails = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(eq(emailAddresses.endpointId, params.id))

    const catchAllDomains = await db
      .select({ count: count() })
      .from(emailDomains)
      .where(eq(emailDomains.catchAllEndpointId, params.id))

    const emailCount = associatedEmails[0]?.count || 0
    const domainCount = catchAllDomains[0]?.count || 0

    if (emailCount > 0 || domainCount > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete endpoint with active dependencies',
        dependencies: {
          emailAddresses: emailCount,
          catchAllDomains: domainCount
        },
        message: 'Please remove all email addresses and catch-all domain configurations using this endpoint before deleting.'
      }, { status: 409 })
    }

    // Delete email group entries if it's an email group
    if (existingEndpoint[0].type === 'email_group') {
      await db.delete(emailGroups).where(eq(emailGroups.endpointId, params.id))
      console.log(`📮 DELETE /api/v1.1/endpoints/${params.id} - Deleted email group entries`)
    }

    // Delete the endpoint
    await db.delete(endpoints).where(eq(endpoints.id, params.id))

    console.log(`✅ DELETE /api/v1.1/endpoints/${params.id} - Successfully deleted endpoint`)

    return NextResponse.json({
      success: true,
      message: 'Endpoint deleted successfully'
    })

  } catch (error) {
    console.error(`❌ DELETE /api/v1.1/endpoints/${params.id} - Error:`, error)
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
        try {
          new URL(config.url)
        } catch {
          return { valid: false, error: 'Invalid webhook URL format' }
        }
        if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 1 || config.timeout > 300)) {
          return { valid: false, error: 'Timeout must be a number between 1 and 300 seconds' }
        }
        if (config.retryAttempts && (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0 || config.retryAttempts > 10)) {
          return { valid: false, error: 'Retry attempts must be a number between 0 and 10' }
        }
        break

      case 'email':
        if (!config.forwardTo) {
          return { valid: false, error: 'Forward-to email address is required' }
        }
        if (typeof config.forwardTo !== 'string') {
          return { valid: false, error: 'Forward-to email must be a string' }
        }
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
        if (config.emails.length > 50) {
          return { valid: false, error: 'Email group cannot have more than 50 email addresses' }
        }
        const emailRegexGroup = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        for (const email of config.emails) {
          if (typeof email !== 'string' || !emailRegexGroup.test(email)) {
            return { valid: false, error: `Invalid email address in group: ${email}` }
          }
        }
        const uniqueEmails = new Set(config.emails)
        if (uniqueEmails.size !== config.emails.length) {
          return { valid: false, error: 'Email group contains duplicate email addresses' }
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
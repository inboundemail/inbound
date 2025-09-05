"use server"

import { getCurrentSession } from '@/lib/auth/auth-utils'
import { db } from '@/lib/db'
import { emailAddresses, vipConfigs, userAccounts, vipEmailAttempts, vipPaymentSessions, endpoints, user } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { revalidatePath } from 'next/cache'

export async function toggleVipStatus(emailAddressId: string, isEnabled: boolean) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify ownership
    const emailAddress = await db
      .select()
      .from(emailAddresses)
      .where(
        and(
          eq(emailAddresses.id, emailAddressId),
          eq(emailAddresses.userId, session.user.id)
        )
      )
      .limit(1)

    if (!emailAddress[0]) {
      return { error: "Email address not found" }
    }

    if (isEnabled) {
      // Get user's email for default destination
      const userData = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1)
      
      const userEmail = userData[0]?.email || null

      // Create VIP endpoint first
      const endpointId = nanoid()
      const vipConfigId = nanoid()
      
      // Create the VIP webhook endpoint
      await db.insert(endpoints).values({
        id: endpointId,
        name: `VIP - ${emailAddress[0].address}`,
        type: 'webhook',
        webhookFormat: 'inbound',
        config: JSON.stringify({
          url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://inbound.new'}/api/products/inboundvip`,
          timeout: 30,
          retryAttempts: 3,
        }),
        isActive: true,
        description: `VIP protection for ${emailAddress[0].address}`,
        userId: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      
      // Create VIP config
      await db.insert(vipConfigs).values({
        id: vipConfigId,
        emailAddressId: emailAddressId,
        userId: session.user.id,
        priceInCents: 100, // Default $1.00
        allowAfterPayment: false,
        paymentLinkExpirationHours: 24,
        destinationEmail: userEmail, // Default to user's account email
        endpointId: endpointId, // Link to the VIP endpoint
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Update email address to use the VIP endpoint
      await db
        .update(emailAddresses)
        .set({
          isVipEnabled: true,
          vipConfigId: vipConfigId,
          endpointId: endpointId, // Assign the VIP endpoint
          updatedAt: new Date(),
        })
        .where(eq(emailAddresses.id, emailAddressId))
    } else {
      // Disable VIP
      // Get the VIP config to find the endpoint
      const vipConfig = await db
        .select({ endpointId: vipConfigs.endpointId })
        .from(vipConfigs)
        .where(eq(vipConfigs.emailAddressId, emailAddressId))
        .limit(1)
      
      // Delete the VIP endpoint if it exists
      if (vipConfig[0]?.endpointId) {
        await db
          .delete(endpoints)
          .where(eq(endpoints.id, vipConfig[0].endpointId))
      }
      
      // Delete the VIP config
      await db
        .delete(vipConfigs)
        .where(eq(vipConfigs.emailAddressId, emailAddressId))
      
      // Update email address to remove VIP
      await db
        .update(emailAddresses)
        .set({
          isVipEnabled: false,
          vipConfigId: null,
          endpointId: null, // Remove the endpoint assignment
          updatedAt: new Date(),
        })
        .where(eq(emailAddresses.id, emailAddressId))
    }

    revalidatePath('/vip')
    return { success: true }
  } catch (error) {
    console.error('Error toggling VIP status:', error)
    return { error: "Failed to update VIP status" }
  }
}

export async function updateVipConfig(
  vipConfigId: string,
  data: {
    price?: string
    expirationHours?: string
    allowAfterPayment?: boolean
    customMessage?: string
    destinationEmail?: string
  }
) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Verify ownership
    const vipConfig = await db
      .select()
      .from(vipConfigs)
      .where(
        and(
          eq(vipConfigs.id, vipConfigId),
          eq(vipConfigs.userId, session.user.id)
        )
      )
      .limit(1)

    if (!vipConfig[0]) {
      return { error: "VIP configuration not found" }
    }

    const updates: any = {
      updatedAt: new Date(),
    }

    if (data.price !== undefined) {
      const priceInCents = Math.round(parseFloat(data.price) * 100)
      if (priceInCents > 0) {
        updates.priceInCents = priceInCents
      }
    }

    if (data.expirationHours !== undefined) {
      const hours = parseInt(data.expirationHours)
      if (hours > 0 && hours <= 168) {
        updates.paymentLinkExpirationHours = hours
      }
    }

    if (data.allowAfterPayment !== undefined) {
      updates.allowAfterPayment = data.allowAfterPayment
    }

    if (data.customMessage !== undefined) {
      updates.customMessage = data.customMessage || null
    }

    if (data.destinationEmail !== undefined) {
      updates.destinationEmail = data.destinationEmail || null
    }

    await db
      .update(vipConfigs)
      .set(updates)
      .where(eq(vipConfigs.id, vipConfigId))

    revalidatePath('/vip')
    return { success: true }
  } catch (error) {
    console.error('Error updating VIP config:', error)
    return { error: "Failed to update VIP configuration" }
  }
}

export async function updateAccountStripeKey(stripeKey: string) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    // Basic validation for Stripe restricted key
    if (stripeKey && !stripeKey.startsWith('rk_')) {
      return { error: "Invalid Stripe key format. Must start with 'rk_'" }
    }

    // Check if user account record exists
    const existingAccount = await db
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.userId, session.user.id))
      .limit(1)

    if (existingAccount[0]) {
      // Update existing account
      await db
        .update(userAccounts)
        .set({
          stripeRestrictedKey: stripeKey || null,
          updatedAt: new Date(),
        })
        .where(eq(userAccounts.userId, session.user.id))
    } else {
      // Create new account record
      await db.insert(userAccounts).values({
        id: nanoid(),
        userId: session.user.id,
        stripeRestrictedKey: stripeKey || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    revalidatePath('/vip')
    return { success: true }
  } catch (error) {
    console.error('Error updating account Stripe key:', error)
    return { error: "Failed to update Stripe key" }
  }
}

export async function getUserAccountStripeKey(): Promise<string | null> {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return null
  }

  try {
    const account = await db
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.userId, session.user.id))
      .limit(1)

    return account[0]?.stripeRestrictedKey || null
  } catch (error) {
    console.error('Error getting account Stripe key:', error)
    return null
  }
}

export async function getVipEmailAttempts(options?: {
  limit?: number
  offset?: number
  emailAddressFilter?: string
}) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return { error: "Unauthorized" }
  }

  try {
    const { limit = 50, offset = 0, emailAddressFilter = 'all' } = options || {}

    // Build where conditions
    let whereConditions = []
    
    // Filter by user's VIP configs
    whereConditions.push(
      sql`${vipEmailAttempts.vipConfigId} IN (
        SELECT id FROM ${vipConfigs} WHERE user_id = ${session.user.id}
      )`
    )

    // Add email address filter
    if (emailAddressFilter !== 'all') {
      whereConditions.push(eq(vipEmailAttempts.recipientEmail, emailAddressFilter))
    }

    // Get VIP email attempts with payment session data
    const attempts = await db
      .select({
        attempt: vipEmailAttempts,
        paymentSession: vipPaymentSessions,
        vipConfig: vipConfigs,
        emailAddress: emailAddresses,
      })
      .from(vipEmailAttempts)
      .leftJoin(vipPaymentSessions, eq(vipEmailAttempts.paymentSessionId, vipPaymentSessions.id))
      .leftJoin(vipConfigs, eq(vipEmailAttempts.vipConfigId, vipConfigs.id))
      .leftJoin(emailAddresses, eq(vipConfigs.emailAddressId, emailAddresses.id))
      .where(and(...whereConditions))
      .orderBy(desc(vipEmailAttempts.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count
    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(vipEmailAttempts)
      .where(and(...whereConditions))

    const totalCount = totalCountResult[0]?.count || 0

    return {
      success: true,
      data: {
        attempts,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      }
    }
  } catch (error) {
    console.error('Error getting VIP email attempts:', error)
    return { error: "Failed to get VIP email attempts" }
  }
} 
"use server"

import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { user } from '@/lib/db/auth-schema'
import { eq } from 'drizzle-orm'

/**
 * Add a feature flag to a user
 */
export async function addFeatureFlag(userId: string, flagName: string) {
  try {
    // Get current session to verify admin access
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Only admins can manage feature flags (or users can manage their own for testing)
    if (session.user.role !== 'admin' && session.user.id !== userId) {
      return { success: false, error: 'Forbidden - admin access required' }
    }

    // Get current user data
    const [currentUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (!currentUser) {
      return { success: false, error: 'User not found' }
    }

    // Parse current feature flags
    let currentFlags: string[] = []
    if (currentUser.featureFlags) {
      try {
        currentFlags = JSON.parse(currentUser.featureFlags)
      } catch {
        currentFlags = []
      }
    }

    // Add the new flag if it doesn't exist
    if (!currentFlags.includes(flagName)) {
      currentFlags.push(flagName)
    }

    // Update user with new feature flags
    await db
      .update(user)
      .set({
        featureFlags: JSON.stringify(currentFlags),
        updatedAt: new Date()
      })
      .where(eq(user.id, userId))

    console.log(`✅ Added feature flag '${flagName}' to user ${userId}`)
    return { success: true, flags: currentFlags }

  } catch (error) {
    console.error('❌ Error adding feature flag:', error)
    return { 
      success: false, 
      error: 'Failed to add feature flag',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Remove a feature flag from a user
 */
export async function removeFeatureFlag(userId: string, flagName: string) {
  try {
    // Get current session to verify admin access
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Only admins can manage feature flags (or users can manage their own for testing)
    if (session.user.role !== 'admin' && session.user.id !== userId) {
      return { success: false, error: 'Forbidden - admin access required' }
    }

    // Get current user data
    const [currentUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (!currentUser) {
      return { success: false, error: 'User not found' }
    }

    // Parse current feature flags
    let currentFlags: string[] = []
    if (currentUser.featureFlags) {
      try {
        currentFlags = JSON.parse(currentUser.featureFlags)
      } catch {
        currentFlags = []
      }
    }

    // Remove the flag
    currentFlags = currentFlags.filter(flag => flag !== flagName)

    // Update user with new feature flags
    await db
      .update(user)
      .set({
        featureFlags: JSON.stringify(currentFlags),
        updatedAt: new Date()
      })
      .where(eq(user.id, userId))

    console.log(`✅ Removed feature flag '${flagName}' from user ${userId}`)
    return { success: true, flags: currentFlags }

  } catch (error) {
    console.error('❌ Error removing feature flag:', error)
    return { 
      success: false, 
      error: 'Failed to remove feature flag',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get current user's feature flags
 */
export async function getUserFeatureFlags(userId?: string) {
  try {
    // Get current session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const targetUserId = userId || session.user.id

    // Only admins can view other users' flags
    if (session.user.role !== 'admin' && session.user.id !== targetUserId) {
      return { success: false, error: 'Forbidden - admin access required' }
    }

    // Get user data
    const [currentUser] = await db
      .select({ featureFlags: user.featureFlags })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1)

    if (!currentUser) {
      return { success: false, error: 'User not found' }
    }

    // Parse feature flags
    let flags: string[] = []
    if (currentUser.featureFlags) {
      try {
        flags = JSON.parse(currentUser.featureFlags)
      } catch {
        flags = []
      }
    }

    return { success: true, flags }

  } catch (error) {
    console.error('❌ Error getting feature flags:', error)
    return { 
      success: false, 
      error: 'Failed to get feature flags',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
} 
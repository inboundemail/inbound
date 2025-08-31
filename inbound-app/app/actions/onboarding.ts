"use server"

import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { userOnboarding } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function completeOnboarding(userId: string) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // Verify the user is updating their own onboarding
    if (userId !== session.user.id) {
      return { 
        success: false, 
        error: 'Forbidden - can only update your own onboarding status' 
      }
    }

    console.log(`📝 Completing onboarding for user ${userId}`)

    // Update onboarding status
    const [updatedOnboarding] = await db
      .update(userOnboarding)
      .set({ 
        isCompleted: true,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(userOnboarding.userId, userId))
      .returning()

    if (!updatedOnboarding) {
      // If no record exists, create one (fallback case)
      const [newOnboarding] = await db.insert(userOnboarding).values({
        id: nanoid(),
        userId: userId,
        isCompleted: true,
        defaultEndpointCreated: false, // Will be handled by auth hook
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning()

      console.log(`✅ Created and completed onboarding record for user ${userId}`)
      return { 
        success: true, 
        onboarding: newOnboarding 
      }
    }

    console.log(`✅ Marked onboarding as completed for user ${userId}`)
    return { 
      success: true, 
      onboarding: updatedOnboarding 
    }

  } catch (error) {
    console.error('❌ Error completing onboarding:', error)
    return { 
      success: false,
      error: 'Failed to complete onboarding',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function getOnboardingStatus(userId?: string) {
  try {
    // Get user session if userId not provided
    let targetUserId = userId
    if (!targetUserId) {
      const session = await auth.api.getSession({
        headers: await headers()
      })

      if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' }
      }

      targetUserId = session.user.id
    }

    console.log(`📋 Getting onboarding status for user ${targetUserId}`)

    const [onboarding] = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, targetUserId!))
      .limit(1)

    if (!onboarding) {
      // No onboarding record means not completed
      return { 
        success: true, 
        onboarding: {
          isCompleted: false,
          defaultEndpointCreated: false
        }
      }
    }

    return { 
      success: true, 
      onboarding: onboarding 
    }

  } catch (error) {
    console.error('❌ Error getting onboarding status:', error)
    return { 
      success: false,
      error: 'Failed to get onboarding status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }
  }
} 
'use server'

import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { blockEmail, unblockEmail, getBlockedEmailsForUser, isEmailBlocked } from '@/lib/email-blocking'

/**
 * Server action to block an email address
 */
export async function blockEmailAction(
  emailAddress: string,
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Authentication required'
      }
    }

    const result = await blockEmail(emailAddress, session.user.id, reason)
    return result

  } catch (error) {
    console.error('Error in blockEmailAction:', error)
    return {
      success: false,
      error: 'An unexpected error occurred'
    }
  }
}

/**
 * Server action to unblock an email address
 */
export async function unblockEmailAction(
  emailAddress: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Authentication required'
      }
    }

    const result = await unblockEmail(emailAddress)
    return result

  } catch (error) {
    console.error('Error in unblockEmailAction:', error)
    return {
      success: false,
      error: 'An unexpected error occurred'
    }
  }
}

/**
 * Server action to get all blocked emails for the current user
 */
export async function getBlockedEmailsAction(): Promise<{
  success: boolean
  blockedEmails?: Array<{
    id: string
    emailAddress: string
    domain: string
    reason: string | null
    blockedBy: string
    createdAt: Date | null
  }>
  error?: string
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Authentication required'
      }
    }

    const result = await getBlockedEmailsForUser(session.user.id)
    return result

  } catch (error) {
    console.error('Error in getBlockedEmailsAction:', error)
    return {
      success: false,
      error: 'An unexpected error occurred'
    }
  }
}

/**
 * Server action to check if an email address is blocked
 */
export async function checkEmailBlockedAction(
  emailAddress: string
): Promise<{ success: boolean; isBlocked?: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Authentication required'
      }
    }

    const isBlocked = await isEmailBlocked(emailAddress)
    return {
      success: true,
      isBlocked
    }

  } catch (error) {
    console.error('Error in checkEmailBlockedAction:', error)
    return {
      success: false,
      error: 'An unexpected error occurred'
    }
  }
} 
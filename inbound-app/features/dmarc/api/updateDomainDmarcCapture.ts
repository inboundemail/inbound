'use server'

import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import type { UpdateDmarcCaptureData, EmailDomain } from '../types'

export async function updateDomainDmarcCapture(
  domainId: string,
  data: UpdateDmarcCaptureData
): Promise<{ success: boolean; domain?: EmailDomain; error?: string }> {
  try {
    // Get current user
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: 'Authentication required' }
    }

    const userId = session.user.id

    // Verify domain belongs to user
    const existingDomain = await db
      .select()
      .from(emailDomains)
      .where(and(
        eq(emailDomains.id, domainId),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!existingDomain[0]) {
      return { success: false, error: 'Domain not found or access denied' }
    }

    // Update DMARC capture setting
    const [updatedDomain] = await db
      .update(emailDomains)
      .set({
        isDmarcCaptureEnabled: data.isDmarcCaptureEnabled,
        updatedAt: new Date()
      })
      .where(and(
        eq(emailDomains.id, domainId),
        eq(emailDomains.userId, userId)
      ))
      .returning()

    if (!updatedDomain) {
      return { success: false, error: 'Failed to update domain' }
    }

    console.log(`✅ DMARC - Updated DMARC capture for domain ${updatedDomain.domain}: ${data.isDmarcCaptureEnabled}`)

    return { success: true, domain: updatedDomain }

  } catch (error) {
    console.error('❌ DMARC - Error updating DMARC capture:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}
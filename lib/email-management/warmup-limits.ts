/**
 * Email Warmup Limits
 * 
 * Implements gradual ramp-up for new accounts to prevent spam abuse.
 * New accounts have daily sending limits that increase over time.
 * This helps protect our email sending reputation and prevents abuse.
 */

import { db } from "@/lib/db"
import { sentEmails } from "@/lib/db/schema"
import { user } from "@/lib/db/auth-schema"
import { eq, and, gte, sql } from "drizzle-orm"

export interface WarmupCheckResult {
  allowed: boolean
  error?: string
  emailsSentToday?: number
  dailyLimit?: number
  daysRemaining?: number
  accountAgeInDays?: number
}

/**
 * Warmup period configuration
 * After this many days, normal rate limits apply (via Autumn billing)
 */
const WARMUP_PERIOD_DAYS = 14

/**
 * Daily limits based on account age
 * Format: { maxAgeDays: dailyLimit }
 */
const DAILY_LIMITS: Record<number, number> = {
  1: 20,    // Day 1: 20 emails
  2: 40,    // Day 2: 40 emails
  3: 75,    // Day 3: 75 emails
  5: 150,   // Days 4-5: 150 emails
  7: 300,   // Days 6-7: 300 emails
  10: 500,  // Days 8-10: 500 emails
  14: 1000, // Days 11-14: 1000 emails
}

/**
 * Get the daily limit for a given account age
 */
export function getDailyLimitForAge(accountAgeInDays: number): number | null {
  // After warmup period, return null (unlimited - rely on billing limits)
  if (accountAgeInDays > WARMUP_PERIOD_DAYS) {
    return null
  }

  // Find the appropriate limit based on account age
  const thresholds = Object.keys(DAILY_LIMITS)
    .map(Number)
    .sort((a, b) => a - b)
  
  for (const threshold of thresholds) {
    if (accountAgeInDays <= threshold) {
      return DAILY_LIMITS[threshold]
    }
  }

  // Default to highest limit if somehow past all thresholds but within warmup
  return DAILY_LIMITS[WARMUP_PERIOD_DAYS]
}

/**
 * Get account age in days
 */
async function getAccountAgeInDays(userId: string): Promise<number> {
  const userResult = await db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!userResult[0]?.createdAt) {
    // If we can't find the user, treat as new (strictest limits)
    return 1
  }

  const accountCreatedAt = userResult[0].createdAt
  const now = new Date()
  const diffMs = now.getTime() - accountCreatedAt.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Minimum of 1 day (even if just created)
  return Math.max(1, diffDays + 1)
}

/**
 * Get count of emails sent today by user
 */
async function getEmailsSentToday(userId: string): Promise<number> {
  // Get start of today in UTC
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(sentEmails)
    .where(
      and(
        eq(sentEmails.userId, userId),
        gte(sentEmails.createdAt, today)
      )
    )

  return Number(result[0]?.count || 0)
}

/**
 * Check warmup limits for a user
 * 
 * During the warmup period (first 14 days), enforces daily limits.
 * After warmup period, returns allowed: true (billing limits take over).
 * 
 * @param userId - The user ID to check
 * @returns WarmupCheckResult with allowed status and limit details
 */
export async function checkWarmupLimits(userId: string): Promise<WarmupCheckResult> {
  try {
    // Get account age
    const accountAgeInDays = await getAccountAgeInDays(userId)
    
    // Get daily limit for this account age
    const dailyLimit = getDailyLimitForAge(accountAgeInDays)
    
    // If past warmup period, allow (billing limits will apply)
    if (dailyLimit === null) {
      return {
        allowed: true,
        accountAgeInDays,
      }
    }

    // Get emails sent today
    const emailsSentToday = await getEmailsSentToday(userId)
    
    // Check if under limit
    if (emailsSentToday >= dailyLimit) {
      const daysRemaining = WARMUP_PERIOD_DAYS - accountAgeInDays
      
      return {
        allowed: false,
        error: `Daily warmup limit reached. New accounts can send ${dailyLimit} emails per day. Your limit increases daily and will be removed after ${daysRemaining} more day${daysRemaining === 1 ? '' : 's'}.`,
        emailsSentToday,
        dailyLimit,
        daysRemaining,
        accountAgeInDays,
      }
    }

    return {
      allowed: true,
      emailsSentToday,
      dailyLimit,
      daysRemaining: WARMUP_PERIOD_DAYS - accountAgeInDays,
      accountAgeInDays,
    }
  } catch (error) {
    console.error("❌ Error checking warmup limits:", error)
    // On error, allow the send (fail open) - billing limits will still apply
    return { allowed: true }
  }
}


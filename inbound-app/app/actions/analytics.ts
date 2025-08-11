"use server"

import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { structuredEmails, sesEvents, emailDomains, emailAddresses, DOMAIN_STATUS } from '@/lib/db/schema'
import { eq, and, gte, desc, sql, count } from 'drizzle-orm'
import { unstable_cache, revalidateTag } from 'next/cache'

// Analytics response interface
export interface AnalyticsData {
  stats: {
    totalEmails: number
    emailsLast24h: number
    emailsLast7d: number
    emailsLast30d: number
    totalDomains: number
    verifiedDomains: number
    totalEmailAddresses: number
    avgProcessingTime: number
  }
  recentEmails: Array<{
    id: string
    messageId: string
    from: string
    recipient: string
    subject: string
    receivedAt: string
    status: string
    domain: string
    isRead: boolean
    readAt?: string
    authResults: {
      spf: string
      dkim: string
      dmarc: string
      spam: string
      virus: string
    }
    hasContent: boolean
    contentSize?: number
  }>
  emailsByHour: Array<{
    hour: string
    count: number
  }>
  emailsByDay?: Array<{
    date: string
    count: number
  }>
  emailsByDomain: Array<{
    domain: string
    count: number
    percentage: number
  }>
  authResultsStats: {
    spf: { pass: number; fail: number; neutral: number }
    dkim: { pass: number; fail: number; neutral: number }
    dmarc: { pass: number; fail: number; neutral: number }
    spam: { pass: number; fail: number }
    virus: { pass: number; fail: number }
  }
  cachedAt: string
  cacheMetadata: {
    statsAge: number
    emailsAge: number
    freshness: 'fresh' | 'stale' | 'expired'
  }
}

// Cache configuration with different TTLs for different data types
const CACHE_CONFIG = {
  // Basic stats change less frequently - longer cache
  STATS_TTL: 10 * 60, // 10 minutes
  // Recent emails change more frequently - shorter cache  
  EMAILS_TTL: 2 * 60, // 2 minutes
  // Aggregated data can be cached longer
  AGGREGATED_TTL: 15 * 60, // 15 minutes
  // Maximum stale time before forcing refresh
  MAX_STALE_TIME: 30 * 60, // 30 minutes
} as const

// Generate cache tags for selective invalidation
const getCacheTags = (userId: string) => ({
  userAnalytics: `analytics-${userId}`,
  userStats: `analytics-stats-${userId}`,
  userEmails: `analytics-emails-${userId}`,
  userDomains: `analytics-domains-${userId}`,
  userAuth: `analytics-auth-${userId}`,
})

// Helper to get current time buckets for consistent caching
const getTimeBuckets = () => {
  const now = new Date()
  return {
    // Round down to nearest 5 minutes for stats
    statsWindow: Math.floor(now.getTime() / (5 * 60 * 1000)),
    // Round down to nearest 2 minutes for emails
    emailsWindow: Math.floor(now.getTime() / (2 * 60 * 1000)),
    // Round down to nearest 10 minutes for aggregated data
    aggregatedWindow: Math.floor(now.getTime() / (10 * 60 * 1000)),
  }
}

// Cached function for basic stats (less frequent updates)
const getCachedStats = unstable_cache(
  async (userId: string, timeWindow: number) => {
    console.log('🔄 Fetching fresh stats data for user:', userId)
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [basicStats, avgProcessingTimeResult] = await Promise.all([
      db.select({
        totalEmails: sql<number>`(SELECT COUNT(*) FROM ${structuredEmails} WHERE ${structuredEmails.userId} = ${userId})`,
        emails24h: sql<number>`(SELECT COUNT(*) FROM ${structuredEmails} WHERE ${structuredEmails.userId} = ${userId} AND ${structuredEmails.createdAt} >= ${last24h})`,
        emails7d: sql<number>`(SELECT COUNT(*) FROM ${structuredEmails} WHERE ${structuredEmails.userId} = ${userId} AND ${structuredEmails.createdAt} >= ${last7d})`,
        emails30d: sql<number>`(SELECT COUNT(*) FROM ${structuredEmails} WHERE ${structuredEmails.userId} = ${userId} AND ${structuredEmails.createdAt} >= ${last30d})`,
        totalDomains: sql<number>`(SELECT COUNT(*) FROM ${emailDomains} WHERE ${emailDomains.userId} = ${userId})`,
        verifiedDomains: sql<number>`(SELECT COUNT(*) FROM ${emailDomains} WHERE ${emailDomains.userId} = ${userId} AND ${emailDomains.status} = ${DOMAIN_STATUS.VERIFIED} AND ${emailDomains.canReceiveEmails} = true)`,
        totalEmailAddresses: sql<number>`(SELECT COUNT(*) FROM ${emailAddresses} WHERE ${emailAddresses.userId} = ${userId})`
      })
      .from(structuredEmails)
      .where(eq(structuredEmails.userId, userId))
      .limit(1),

      db.select({
        avg: sql<number>`AVG(${sesEvents.processingTimeMillis})`
      })
      .from(sesEvents)
      .innerJoin(structuredEmails, eq(structuredEmails.sesEventId, sesEvents.id))
      .where(and(
        eq(structuredEmails.userId, userId),
        gte(structuredEmails.createdAt, last30d)
      ))
    ])

    const stats = basicStats[0] || {
      totalEmails: 0,
      emails24h: 0,
      emails7d: 0,
      emails30d: 0,
      totalDomains: 0,
      verifiedDomains: 0,
      totalEmailAddresses: 0
    }

    return {
      totalEmails: Number(stats.totalEmails) || 0,
      emailsLast24h: Number(stats.emails24h) || 0,
      emailsLast7d: Number(stats.emails7d) || 0,
      emailsLast30d: Number(stats.emails30d) || 0,
      totalDomains: Number(stats.totalDomains) || 0,
      verifiedDomains: Number(stats.verifiedDomains) || 0,
      totalEmailAddresses: Number(stats.totalEmailAddresses) || 0,
      avgProcessingTime: Math.round(avgProcessingTimeResult[0]?.avg || 0)
    }
  },
  ['analytics-stats'],
  {
    revalidate: CACHE_CONFIG.STATS_TTL,
    tags: ['analytics-stats']
  }
)

// Cached function for recent emails (more frequent updates)
const getCachedRecentEmails = unstable_cache(
  async (userId: string, timeWindow: number, limit: number = 50) => {
    console.log('🔄 Fetching fresh emails data for user:', userId)
    
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const recentEmailsQuery = await db.select({
      id: structuredEmails.id,
      messageId: structuredEmails.messageId,
      fromData: structuredEmails.fromData,
      toData: structuredEmails.toData,
      subject: structuredEmails.subject,
      createdAt: structuredEmails.createdAt,
      spamVerdict: sesEvents.spamVerdict,
      virusVerdict: sesEvents.virusVerdict,
      spfVerdict: sesEvents.spfVerdict,
      dkimVerdict: sesEvents.dkimVerdict,
      dmarcVerdict: sesEvents.dmarcVerdict,
      s3ContentSize: sesEvents.s3ContentSize,
      hasContent: sql<boolean>`(${structuredEmails.textBody} IS NOT NULL OR ${structuredEmails.htmlBody} IS NOT NULL OR ${structuredEmails.rawContent} IS NOT NULL OR ${sesEvents.emailContent} IS NOT NULL)`
    })
    .from(structuredEmails)
    .leftJoin(sesEvents, eq(structuredEmails.sesEventId, sesEvents.id))
    .where(and(
      eq(structuredEmails.userId, userId),
      gte(structuredEmails.createdAt, last7d)
    ))
    .orderBy(desc(structuredEmails.createdAt))
    .limit(limit)

    // Helper function to parse email address from JSON data
    const parseEmailAddress = (jsonData: string | null): { address: string; name?: string } | null => {
      if (!jsonData) return null
      try {
        const parsed = JSON.parse(jsonData)
        return parsed?.addresses?.[0]?.address ? {
          address: parsed.addresses[0].address,
          name: parsed.addresses[0].name
        } : null
      } catch (error) {
        console.warn('Failed to parse email address:', error)
        return null
      }
    }

    return recentEmailsQuery.map(email => {
      const fromParsed = parseEmailAddress(email.fromData)
      const toParsed = parseEmailAddress(email.toData)
      
      return {
        id: email.id,
        messageId: email.messageId || '',
        from: fromParsed?.address || 'Unknown',
        recipient: toParsed?.address || 'Unknown',
        subject: email.subject || 'No Subject',
        receivedAt: (email.createdAt || new Date()).toISOString(),
        status: 'received',
        domain: toParsed?.address?.split('@')[1] || '',
        isRead: false,
        readAt: undefined,
        authResults: {
          spf: email.spfVerdict || 'UNKNOWN',
          dkim: email.dkimVerdict || 'UNKNOWN',
          dmarc: email.dmarcVerdict || 'UNKNOWN',
          spam: email.spamVerdict || 'UNKNOWN',
          virus: email.virusVerdict || 'UNKNOWN'
        },
        hasContent: !!email.hasContent,
        contentSize: email.s3ContentSize || undefined
      }
    })
  },
  ['analytics-emails'],
  {
    revalidate: CACHE_CONFIG.EMAILS_TTL,
    tags: ['analytics-emails']
  }
)

// Cached function for aggregated data (hourly, domain, auth stats)
const getCachedAggregatedData = unstable_cache(
  async (userId: string, timeWindow: number) => {
    console.log('🔄 Fetching fresh aggregated data for user:', userId)
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [emailsByHourQuery, emailsByDomainQuery, authStatsQuery] = await Promise.all([
      // Emails by hour for the last 24 hours
      db.select({
        hour: sql<string>`DATE_TRUNC('hour', ${structuredEmails.createdAt})`,
        count: count()
      })
      .from(structuredEmails)
      .where(and(
        eq(structuredEmails.userId, userId),
        gte(structuredEmails.createdAt, last24h)
      ))
      .groupBy(sql`DATE_TRUNC('hour', ${structuredEmails.createdAt})`)
      .orderBy(sql`DATE_TRUNC('hour', ${structuredEmails.createdAt})`),

      // Emails by domain (last 7 days)
      db.select({
        domain: sql<string>`SPLIT_PART((${structuredEmails.toData}::jsonb->'addresses'->0->>'address'), '@', 2)`,
        count: count()
      })
      .from(structuredEmails)
      .where(and(
        eq(structuredEmails.userId, userId),
        gte(structuredEmails.createdAt, last7d),
        sql`${structuredEmails.toData} IS NOT NULL`,
        sql`${structuredEmails.toData}::jsonb->'addresses'->0->>'address' IS NOT NULL`
      ))
      .groupBy(sql`SPLIT_PART((${structuredEmails.toData}::jsonb->'addresses'->0->>'address'), '@', 2)`)
      .orderBy(desc(count()))
      .limit(10),

      // Auth results stats (last 7 days)
      db.select({
        spfVerdict: sesEvents.spfVerdict,
        dkimVerdict: sesEvents.dkimVerdict,
        dmarcVerdict: sesEvents.dmarcVerdict,
        spamVerdict: sesEvents.spamVerdict,
        virusVerdict: sesEvents.virusVerdict,
        count: count()
      })
      .from(sesEvents)
      .innerJoin(structuredEmails, eq(structuredEmails.sesEventId, sesEvents.id))
      .where(and(
        eq(structuredEmails.userId, userId),
        gte(structuredEmails.createdAt, last7d)
      ))
      .groupBy(
        sesEvents.spfVerdict,
        sesEvents.dkimVerdict,
        sesEvents.dmarcVerdict,
        sesEvents.spamVerdict,
        sesEvents.virusVerdict
      )
    ])

    // Process emails by hour with proper formatting
    const emailsByHourMap = new Map<string, number>()
    emailsByHourQuery.forEach(item => {
      const hourDate = new Date(item.hour)
      const hourKey = hourDate.getHours()
      emailsByHourMap.set(hourKey.toString(), item.count)
    })

    const emailsByHour = Array.from({ length: 24 }, (_, i) => {
      const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i
      const ampm = i < 12 ? 'AM' : 'PM'
      return {
        hour: `${hour12} ${ampm}`,
        count: emailsByHourMap.get(i.toString()) || 0
      }
    })

    // Process emails by domain with percentages
    const totalEmailsForDomains = emailsByDomainQuery.reduce((sum, item) => sum + item.count, 0)
    const emailsByDomain = emailsByDomainQuery
      .filter(item => item.domain && item.domain !== '')
      .map(item => ({
        domain: item.domain,
        count: item.count,
        percentage: totalEmailsForDomains > 0 ? Math.round((item.count / totalEmailsForDomains) * 100) : 0
      }))

    // Process auth results stats
    const authResultsStats = {
      spf: { pass: 0, fail: 0, neutral: 0 },
      dkim: { pass: 0, fail: 0, neutral: 0 },
      dmarc: { pass: 0, fail: 0, neutral: 0 },
      spam: { pass: 0, fail: 0 },
      virus: { pass: 0, fail: 0 }
    }

    authStatsQuery.forEach(stat => {
      const count = stat.count
      
      if (stat.spfVerdict === 'PASS') authResultsStats.spf.pass += count
      else if (stat.spfVerdict === 'FAIL') authResultsStats.spf.fail += count
      else authResultsStats.spf.neutral += count
      
      if (stat.dkimVerdict === 'PASS') authResultsStats.dkim.pass += count
      else if (stat.dkimVerdict === 'FAIL') authResultsStats.dkim.fail += count
      else authResultsStats.dkim.neutral += count
      
      if (stat.dmarcVerdict === 'PASS') authResultsStats.dmarc.pass += count
      else if (stat.dmarcVerdict === 'FAIL') authResultsStats.dmarc.fail += count
      else authResultsStats.dmarc.neutral += count
      
      if (stat.spamVerdict === 'PASS') authResultsStats.spam.pass += count
      else authResultsStats.spam.fail += count
      
      if (stat.virusVerdict === 'PASS') authResultsStats.virus.pass += count
      else authResultsStats.virus.fail += count
    })

    return {
      emailsByHour,
      emailsByDomain,
      authResultsStats
    }
  },
  ['analytics-aggregated'],
  {
    revalidate: CACHE_CONFIG.AGGREGATED_TTL,
    tags: ['analytics-aggregated']
  }
)

// Main analytics function with improved caching strategy
export const getAnalytics = async (): Promise<{ success: true; data: AnalyticsData } | { success: false; error: string }> => {
  try {
    const timeStart = performance.now()

    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    const userId = session.user.id
    const timeBuckets = getTimeBuckets()

    // Fetch cached data in parallel with different cache windows
    const [stats, recentEmails, aggregatedData] = await Promise.all([
      getCachedStats(userId, timeBuckets.statsWindow),
      getCachedRecentEmails(userId, timeBuckets.emailsWindow),
      getCachedAggregatedData(userId, timeBuckets.aggregatedWindow)
    ])

    const now = new Date()
    const analyticsData: AnalyticsData = {
      stats,
      recentEmails,
      emailsByHour: aggregatedData.emailsByHour,
      emailsByDomain: aggregatedData.emailsByDomain,
      authResultsStats: aggregatedData.authResultsStats,
      cachedAt: now.toISOString(),
      cacheMetadata: {
        statsAge: Math.floor((now.getTime() - (timeBuckets.statsWindow * 5 * 60 * 1000)) / 1000),
        emailsAge: Math.floor((now.getTime() - (timeBuckets.emailsWindow * 2 * 60 * 1000)) / 1000),
        freshness: 'fresh' as const // Could be enhanced to detect actual freshness
      }
    }

    const timeEnd = performance.now()
    const timeTaken = timeEnd - timeStart
    console.log(`⚡ Analytics loaded in ${timeTaken.toFixed(2)}ms (cached data)`)

    return {
      success: true,
      data: analyticsData
    }
  } catch (error) {
    console.error('Analytics error:', error)
    return {
      success: false,
      error: 'Failed to fetch analytics data'
    }
  }
}

// Cache invalidation functions for when data changes
export const invalidateAnalyticsCache = async (userId: string, type?: 'stats' | 'emails' | 'aggregated' | 'all') => {
  try {
    const tags = getCacheTags(userId)
    
    switch (type) {
      case 'stats':
        revalidateTag('analytics-stats')
        console.log(`🗑️ Invalidated stats cache for user ${userId}`)
        break
      case 'emails':
        revalidateTag('analytics-emails')
        console.log(`🗑️ Invalidated emails cache for user ${userId}`)
        break
      case 'aggregated':
        revalidateTag('analytics-aggregated')
        console.log(`🗑️ Invalidated aggregated cache for user ${userId}`)
        break
      default:
        // Invalidate all analytics cache for user
        revalidateTag('analytics-stats')
        revalidateTag('analytics-emails')
        revalidateTag('analytics-aggregated')
        console.log(`🗑️ Invalidated all analytics cache for user ${userId}`)
    }
  } catch (error) {
    console.warn('Failed to invalidate analytics cache:', error)
  }
}

// Call this when new emails are received
export const onNewEmailReceived = async (userId: string) => {
  // Invalidate email-related caches immediately
  await invalidateAnalyticsCache(userId, 'emails')
  
  // Invalidate stats after a short delay to allow for processing
  setTimeout(() => {
    invalidateAnalyticsCache(userId, 'stats')
  }, 30000) // 30 seconds
}

// Call this when domains are modified
export const onDomainChanged = async (userId: string) => {
  await invalidateAnalyticsCache(userId, 'stats')
}

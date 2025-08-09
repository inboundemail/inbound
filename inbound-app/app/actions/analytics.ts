"use server"

import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { structuredEmails, sesEvents, emailDomains, emailAddresses, DOMAIN_STATUS } from '@/lib/db/schema'
import { eq, and, gte, desc, sql, count } from 'drizzle-orm'
import { cache } from 'react'

// Analytics response interface - only defining the API response structure
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
}

// Cache the analytics data for 5 minutes to improve navigation performance
export const getAnalytics = cache(async (): Promise<{ success: true; data: AnalyticsData } | { success: false; error: string }> => {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    const timeStart = performance.now()

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    const userId = session.user.id

    // Calculate date ranges
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Combine multiple queries into a single Promise.all to reduce database round trips
    const [
      basicStats,
      recentEmailsQuery,
      emailsByHourQuery,
      emailsByDomainQuery,
      avgProcessingTimeResult,
      authStatsQuery
    ] = await Promise.all([
      // Query 1: Get all basic stats in a single query using subqueries
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

      // Query 2: Get recent emails with SES event data (last 7 days only) - limit to 50 instead of 100
      db.select({
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
      .limit(50), // Reduced from 100 to 50 for faster loading

      // Query 3: Get emails by hour for the last 24 hours
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

      // Query 4: Get emails by domain (last 7 days)
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

      // Query 5: Calculate average processing time
      db.select({
        avg: sql<number>`AVG(${sesEvents.processingTimeMillis})`
      })
      .from(sesEvents)
      .innerJoin(structuredEmails, eq(structuredEmails.sesEventId, sesEvents.id))
      .where(and(
        eq(structuredEmails.userId, userId),
        gte(structuredEmails.createdAt, last30d)
      )),

      // Query 6: Get auth results stats (last 7 days)
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

    // Helper function to parse email address from JSON data - optimized version
    const parseEmailAddress = (jsonData: string | null): { address: string; name?: string } | null => {
      if (!jsonData) return null
      try {
        const parsed = JSON.parse(jsonData)
        return parsed?.addresses?.[0]?.address ? {
          address: parsed.addresses[0].address,
          name: parsed.addresses[0].name
        } : null
      } catch {
        return null
      }
    }

    // Process recent emails - optimized with less data
    const recentEmails = recentEmailsQuery.map(email => {
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

    // Process emails by hour with proper formatting - optimized
    const emailsByHourMap = new Map<string, number>()
    emailsByHourQuery.forEach(item => {
      const hourDate = new Date(item.hour)
      const hourKey = hourDate.getHours()
      emailsByHourMap.set(hourKey.toString(), item.count)
    })

    // Generate all 24 hours with proper formatting
    const emailsByHour = Array.from({ length: 24 }, (_, i) => {
      const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i
      const ampm = i < 12 ? 'AM' : 'PM'
      return {
        hour: `${hour12} ${ampm}`,
        count: emailsByHourMap.get(i.toString()) || 0
      }
    })

    // Process emails by domain with percentages - optimized
    const totalEmailsForDomains = emailsByDomainQuery.reduce((sum, item) => sum + item.count, 0)
    const emailsByDomain = emailsByDomainQuery
      .filter(item => item.domain && item.domain !== '')
      .map(item => ({
        domain: item.domain,
        count: item.count,
        percentage: totalEmailsForDomains > 0 ? Math.round((item.count / totalEmailsForDomains) * 100) : 0
      }))

    // Process auth results stats - optimized
    const authResultsStats = {
      spf: { pass: 0, fail: 0, neutral: 0 },
      dkim: { pass: 0, fail: 0, neutral: 0 },
      dmarc: { pass: 0, fail: 0, neutral: 0 },
      spam: { pass: 0, fail: 0 },
      virus: { pass: 0, fail: 0 }
    }

    authStatsQuery.forEach(stat => {
      const count = stat.count
      
      // SPF
      if (stat.spfVerdict === 'PASS') authResultsStats.spf.pass += count
      else if (stat.spfVerdict === 'FAIL') authResultsStats.spf.fail += count
      else authResultsStats.spf.neutral += count
      
      // DKIM
      if (stat.dkimVerdict === 'PASS') authResultsStats.dkim.pass += count
      else if (stat.dkimVerdict === 'FAIL') authResultsStats.dkim.fail += count
      else authResultsStats.dkim.neutral += count
      
      // DMARC
      if (stat.dmarcVerdict === 'PASS') authResultsStats.dmarc.pass += count
      else if (stat.dmarcVerdict === 'FAIL') authResultsStats.dmarc.fail += count
      else authResultsStats.dmarc.neutral += count
      
      // Spam
      if (stat.spamVerdict === 'PASS') authResultsStats.spam.pass += count
      else authResultsStats.spam.fail += count
      
      // Virus
      if (stat.virusVerdict === 'PASS') authResultsStats.virus.pass += count
      else authResultsStats.virus.fail += count
    })

    // Extract basic stats from the first query result
    const stats = basicStats[0] || {
      totalEmails: 0,
      emails24h: 0,
      emails7d: 0,
      emails30d: 0,
      totalDomains: 0,
      verifiedDomains: 0,
      totalEmailAddresses: 0
    }

    const analyticsData: AnalyticsData = {
      stats: {
        totalEmails: Number(stats.totalEmails) || 0,
        emailsLast24h: Number(stats.emails24h) || 0,
        emailsLast7d: Number(stats.emails7d) || 0,
        emailsLast30d: Number(stats.emails30d) || 0,
        totalDomains: Number(stats.totalDomains) || 0,
        verifiedDomains: Number(stats.verifiedDomains) || 0,
        totalEmailAddresses: Number(stats.totalEmailAddresses) || 0,
        avgProcessingTime: Math.round(avgProcessingTimeResult[0]?.avg || 0)
      },
      recentEmails,
      emailsByHour,
      emailsByDomain,
      authResultsStats
    }

    const timeEnd = performance.now()
    const timeTaken = timeEnd - timeStart
    console.log(`🕑 Analytics Server Action took ${timeTaken.toFixed(2)}ms`)

    return {
      success: true,
      data: analyticsData
    }
  } catch (error) {
    console.error('Analytics Server Action error:', error)
    return {
      success: false,
      error: 'Failed to fetch analytics data'
    }
  }
})
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { receivedEmails, sesEvents, emailDomains, emailAddresses, SES_VERIFICATION_STATUS } from '@/lib/db/schema'
import { eq, and, gte, desc, sql, count } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

interface AnalyticsData {
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

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // Calculate date ranges
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Get basic stats
    const [
      totalEmailsResult,
      emails24hResult,
      emails7dResult,
      emails30dResult,
      totalDomainsResult,
      verifiedDomainsResult,
      totalEmailAddressesResult
    ] = await Promise.all([
      // Total emails
      db.select({ count: count() })
        .from(receivedEmails)
        .where(eq(receivedEmails.userId, userId)),
      
      // Emails last 24h
      db.select({ count: count() })
        .from(receivedEmails)
        .where(and(
          eq(receivedEmails.userId, userId),
          gte(receivedEmails.receivedAt, last24h)
        )),
      
      // Emails last 7d
      db.select({ count: count() })
        .from(receivedEmails)
        .where(and(
          eq(receivedEmails.userId, userId),
          gte(receivedEmails.receivedAt, last7d)
        )),
      
      // Emails last 30d
      db.select({ count: count() })
        .from(receivedEmails)
        .where(and(
          eq(receivedEmails.userId, userId),
          gte(receivedEmails.receivedAt, last30d)
        )),
      
      // Total domains
      db.select({ count: count() })
        .from(emailDomains)
        .where(eq(emailDomains.userId, userId)),
      
      // Verified domains
      db.select({ count: count() })
        .from(emailDomains)
        .where(and(
          eq(emailDomains.userId, userId),
          eq(emailDomains.sesVerificationStatus, SES_VERIFICATION_STATUS.SUCCESS),
          eq(emailDomains.canReceiveEmails, true)
        )),
      
      // Total email addresses
      db.select({ count: count() })
        .from(emailAddresses)
        .where(eq(emailAddresses.userId, userId))
    ])

    // Get recent emails with SES event data (last 7 days only)
    const recentEmailsQuery = await db
      .select({
        id: receivedEmails.id,
        messageId: receivedEmails.messageId,
        from: receivedEmails.from,
        recipient: receivedEmails.recipient,
        subject: receivedEmails.subject,
        receivedAt: receivedEmails.receivedAt,
        status: receivedEmails.status,
        metadata: receivedEmails.metadata,
        spamVerdict: sesEvents.spamVerdict,
        virusVerdict: sesEvents.virusVerdict,
        spfVerdict: sesEvents.spfVerdict,
        dkimVerdict: sesEvents.dkimVerdict,
        dmarcVerdict: sesEvents.dmarcVerdict,
        emailContent: sesEvents.emailContent,
        s3ContentSize: sesEvents.s3ContentSize,
        processingTimeMillis: sesEvents.processingTimeMillis
      })
      .from(receivedEmails)
      .leftJoin(sesEvents, eq(receivedEmails.sesEventId, sesEvents.id))
      .where(and(
        eq(receivedEmails.userId, userId),
        gte(receivedEmails.receivedAt, last7d)
      ))
      .orderBy(desc(receivedEmails.receivedAt))
      .limit(100)

    // Get emails by hour for the last 24 hours
    const emailsByHourQuery = await db
      .select({
        hour: sql<string>`DATE_TRUNC('hour', ${receivedEmails.receivedAt})`,
        count: count()
      })
      .from(receivedEmails)
      .where(and(
        eq(receivedEmails.userId, userId),
        gte(receivedEmails.receivedAt, last24h)
      ))
      .groupBy(sql`DATE_TRUNC('hour', ${receivedEmails.receivedAt})`)
      .orderBy(sql`DATE_TRUNC('hour', ${receivedEmails.receivedAt})`)

    // Process emails by hour with proper formatting
    const emailsByHourMap = new Map<string, number>()
    emailsByHourQuery.forEach(item => {
      const hourDate = new Date(item.hour)
      const hourKey = hourDate.getHours()
      emailsByHourMap.set(hourKey.toString(), item.count)
    })

    // Generate all 24 hours with proper formatting
    const emailsByHour = []
    for (let i = 0; i < 24; i++) {
      const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i
      const ampm = i < 12 ? 'AM' : 'PM'
      const hourLabel = `${hour12} ${ampm}`
      
      emailsByHour.push({
        hour: hourLabel,
        count: emailsByHourMap.get(i.toString()) || 0
      })
    }

    // Get emails by domain (last 7 days)
    const emailsByDomainQuery = await db
      .select({
        domain: sql<string>`SPLIT_PART(${receivedEmails.recipient}, '@', 2)`,
        count: count()
      })
      .from(receivedEmails)
      .where(and(
        eq(receivedEmails.userId, userId),
        gte(receivedEmails.receivedAt, last7d)
      ))
      .groupBy(sql`SPLIT_PART(${receivedEmails.recipient}, '@', 2)`)
      .orderBy(desc(count()))
      .limit(10)

    // Calculate average processing time
    const avgProcessingTimeResult = await db
      .select({
        avg: sql<number>`AVG(${sesEvents.processingTimeMillis})`
      })
      .from(sesEvents)
      .innerJoin(receivedEmails, eq(receivedEmails.sesEventId, sesEvents.id))
      .where(and(
        eq(receivedEmails.userId, userId),
        gte(receivedEmails.receivedAt, last30d)
      ))

    // Get auth results stats (last 7 days)
    const authStatsQuery = await db
      .select({
        spfVerdict: sesEvents.spfVerdict,
        dkimVerdict: sesEvents.dkimVerdict,
        dmarcVerdict: sesEvents.dmarcVerdict,
        spamVerdict: sesEvents.spamVerdict,
        virusVerdict: sesEvents.virusVerdict,
        count: count()
      })
      .from(sesEvents)
      .innerJoin(receivedEmails, eq(receivedEmails.sesEventId, sesEvents.id))
      .where(and(
        eq(receivedEmails.userId, userId),
        gte(receivedEmails.receivedAt, last7d)
      ))
      .groupBy(
        sesEvents.spfVerdict,
        sesEvents.dkimVerdict,
        sesEvents.dmarcVerdict,
        sesEvents.spamVerdict,
        sesEvents.virusVerdict
      )

    // Process recent emails
    const recentEmails = recentEmailsQuery.map(email => ({
      id: email.id,
      messageId: email.messageId,
      from: email.from,
      recipient: email.recipient,
      subject: email.subject || 'No Subject',
      receivedAt: email.receivedAt.toISOString(),
      status: email.status,
      domain: email.recipient.split('@')[1] || '',
      authResults: {
        spf: email.spfVerdict || 'UNKNOWN',
        dkim: email.dkimVerdict || 'UNKNOWN',
        dmarc: email.dmarcVerdict || 'UNKNOWN',
        spam: email.spamVerdict || 'UNKNOWN',
        virus: email.virusVerdict || 'UNKNOWN'
      },
      hasContent: !!email.emailContent,
      contentSize: email.s3ContentSize || undefined
    }))

    // Process emails by domain with percentages
    const totalEmailsForDomains = emailsByDomainQuery.reduce((sum, item) => sum + item.count, 0)
    const emailsByDomain = emailsByDomainQuery.map(item => ({
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

    const analyticsData: AnalyticsData = {
      stats: {
        totalEmails: totalEmailsResult[0]?.count || 0,
        emailsLast24h: emails24hResult[0]?.count || 0,
        emailsLast7d: emails7dResult[0]?.count || 0,
        emailsLast30d: emails30dResult[0]?.count || 0,
        totalDomains: totalDomainsResult[0]?.count || 0,
        verifiedDomains: verifiedDomainsResult[0]?.count || 0,
        totalEmailAddresses: totalEmailAddressesResult[0]?.count || 0,
        avgProcessingTime: Math.round(avgProcessingTimeResult[0]?.avg || 0)
      },
      recentEmails,
      emailsByHour,
      emailsByDomain,
      authResultsStats
    }

    return NextResponse.json(analyticsData)
  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    )
  }
} 
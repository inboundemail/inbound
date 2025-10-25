"use server"

import { requireAdmin } from "@/lib/auth/auth-utils"
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { 
  user, 
  structuredEmails, 
  receivedEmails,
  sentEmails, 
  scheduledEmails,
  emailDomains, 
  emailAddresses,
  endpointDeliveries,
  DOMAIN_STATUS,
  SENT_EMAIL_STATUS
} from '@/lib/db/schema'
import { eq, and, gte, desc, sql, count, asc, lt } from 'drizzle-orm'
import { unstable_cache, revalidateTag } from 'next/cache'

// User analytics response interfaces
export interface UserStatsOverview {
  totalUsers: number
  activeUsers: number
  bannedUsers: number
  adminUsers: number
  totalEmailsSent: number
  totalEmailsReceived: number
  emailsLast24h: number
  emailsLast7d: number
  emailsLast30d: number
  avgEmailsPerUser: number
}

export interface TopUserActivity {
  userId: string
  userName: string | null
  userEmail: string
  role: string | null
  banned: boolean | null
  sentEmails: number
  receivedEmails: number
  totalEmails: number
  emailsLast7d: number
  emailsLast30d: number
  joinedAt: string
  lastActivity: string | null
  riskScore: number
  flags: string[]
}

export interface SuspiciousActivity {
  userId: string
  userName: string | null
  userEmail: string
  activityType: 'high_volume' | 'unusual_pattern' | 'auth_failures' | 'banned_activity' | 'rapid_signup'
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  details: any
  detectedAt: string
  riskScore: number
}

export interface UserAnalyticsData {
  overview: UserStatsOverview
  topUsers: TopUserActivity[]
  suspiciousActivity: SuspiciousActivity[]
  emailTrends: {
    hourly: Array<{ hour: string; sent: number; received: number }>
    daily: Array<{ date: string; sent: number; received: number }>
  }
  userGrowth: Array<{
    period: string
    newUsers: number
    activeUsers: number
    totalUsers: number
  }>
  cachedAt: string
}

// Export emails service: returns JSON blob for a user over a time window
export async function exportUserEmails(params: { userId: string; days: 1 | 7 | 30 }) {
  await requireAdmin()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session || session.user.role !== 'admin') {
    return { success: false as const, error: 'Unauthorized' }
  }

  const cutoff = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000)

  // Pull sent and received emails
  const sent = await db.execute(sql`
    SELECT id, from_address, "to", subject, headers, attachments, status, message_id, provider, sent_at, created_at
    FROM sent_emails
    WHERE user_id = ${params.userId} AND created_at >= ${cutoff}
    ORDER BY created_at DESC
    LIMIT 5000
  `)

  const received = await db.execute(sql`
    SELECT id, recipient, "from", subject, headers, attachments, status, email_date, received_at, created_at
    FROM received_emails
    WHERE user_id = ${params.userId} AND created_at >= ${cutoff}
    ORDER BY created_at DESC
    LIMIT 5000
  `)

  const payload = {
    userId: params.userId,
    rangeDays: params.days,
    exportedAt: new Date().toISOString(),
    sent: sent.rows,
    received: received.rows,
  }

  return { success: true as const, filename: `emails_${params.userId}_${params.days}d.json`, data: payload }
}

// Cache configuration
const CACHE_CONFIG = {
  OVERVIEW_TTL: 5 * 60, // 5 minutes
  USER_ACTIVITY_TTL: 10 * 60, // 10 minutes
  SUSPICIOUS_TTL: 2 * 60, // 2 minutes (more frequent for security)
  TRENDS_TTL: 15 * 60, // 15 minutes
} as const

// Risk scoring thresholds
const RISK_THRESHOLDS = {
  HIGH_VOLUME_DAILY: 1000,
  HIGH_VOLUME_WEEKLY: 5000,
  RAPID_GROWTH_PERCENTAGE: 500, // 500% increase
  AUTH_FAILURE_THRESHOLD: 10,
  UNUSUAL_TIME_PATTERN: 80, // 80% of activity outside normal hours
} as const

// Cached function for overview stats
const getCachedOverview = unstable_cache(
  async () => {
    console.log('🔄 Fetching fresh user overview stats')
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [userStats, emailStats] = await Promise.all([
      // User statistics
      db.select({
        totalUsers: sql<number>`COUNT(*)`,
        activeUsers: sql<number>`COUNT(*) FILTER (WHERE ${user.banned} IS NOT TRUE)`,
        bannedUsers: sql<number>`COUNT(*) FILTER (WHERE ${user.banned} = TRUE)`,
        adminUsers: sql<number>`COUNT(*) FILTER (WHERE ${user.role} = 'admin')`
      })
      .from(user),

      // Email statistics - using raw SQL since Drizzle needs a FROM clause
      db.execute(sql`
        SELECT 
          (SELECT COUNT(*) FROM sent_emails) as total_sent,
          (SELECT COUNT(*) FROM received_emails) as total_received,
          (SELECT COUNT(*) FROM sent_emails WHERE created_at >= ${last24h}) as sent_24h,
          (SELECT COUNT(*) FROM received_emails WHERE created_at >= ${last24h}) as received_24h,
          (SELECT COUNT(*) FROM sent_emails WHERE created_at >= ${last7d}) as sent_7d,
          (SELECT COUNT(*) FROM received_emails WHERE created_at >= ${last7d}) as received_7d,
          (SELECT COUNT(*) FROM sent_emails WHERE created_at >= ${last30d}) as sent_30d,
          (SELECT COUNT(*) FROM received_emails WHERE created_at >= ${last30d}) as received_30d
      `)
    ])

    const userStatsRow = userStats[0]
    const emailStatsRow = emailStats.rows[0] as any // db.execute returns { rows: [] }

    const totalEmails = Number(emailStatsRow?.total_sent || 0) + Number(emailStatsRow?.total_received || 0)
    const avgEmailsPerUser = Number(userStatsRow?.totalUsers || 0) > 0 
      ? Math.round(totalEmails / Number(userStatsRow.totalUsers))
      : 0

    return {
      totalUsers: Number(userStatsRow?.totalUsers || 0),
      activeUsers: Number(userStatsRow?.activeUsers || 0),
      bannedUsers: Number(userStatsRow?.bannedUsers || 0),
      adminUsers: Number(userStatsRow?.adminUsers || 0),
      totalEmailsSent: Number(emailStatsRow?.total_sent || 0),
      totalEmailsReceived: Number(emailStatsRow?.total_received || 0),
      emailsLast24h: Number(emailStatsRow?.sent_24h || 0) + Number(emailStatsRow?.received_24h || 0),
      emailsLast7d: Number(emailStatsRow?.sent_7d || 0) + Number(emailStatsRow?.received_7d || 0),
      emailsLast30d: Number(emailStatsRow?.sent_30d || 0) + Number(emailStatsRow?.received_30d || 0),
      avgEmailsPerUser
    }
  },
  ['user-analytics-overview'],
  {
    revalidate: CACHE_CONFIG.OVERVIEW_TTL,
    tags: ['user-analytics-overview']
  }
)

// Cached function for top user activity
const getCachedTopUsers = unstable_cache(
  async () => {
    console.log('🔄 Fetching fresh top user activity')
    
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Use raw SQL with LEFT JOIN aggregates to avoid correlated subquery issues
    const topUsersQuery = await db.execute(sql`
      SELECT 
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS role,
        u.banned AS banned,
        u.created_at AS joined_at,
        u.feature_flags AS feature_flags,
        COALESCE(s.sent_total, 0) AS sent_emails,
        COALESCE(r.recv_total, 0) AS received_emails,
        COALESCE(s7.sent_7d, 0) + COALESCE(r7.recv_7d, 0) AS emails_7d,
        COALESCE(s30.sent_30d, 0) + COALESCE(r30.recv_30d, 0) AS emails_30d,
        (SELECT MAX(created_at) FROM sent_emails se WHERE se.user_id = u.id) AS last_sent_email,
        (SELECT MAX(created_at) FROM received_emails re WHERE re.user_id = u.id) AS last_received_email
      FROM "user" u
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS sent_total
        FROM sent_emails
        GROUP BY user_id
      ) s ON s.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS recv_total
        FROM received_emails
        GROUP BY user_id
      ) r ON r.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS sent_7d
        FROM sent_emails
        WHERE created_at >= ${last7d}
        GROUP BY user_id
      ) s7 ON s7.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS recv_7d
        FROM received_emails
        WHERE created_at >= ${last7d}
        GROUP BY user_id
      ) r7 ON r7.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS sent_30d
        FROM sent_emails
        WHERE created_at >= ${last30d}
        GROUP BY user_id
      ) s30 ON s30.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS recv_30d
        FROM received_emails
        WHERE created_at >= ${last30d}
        GROUP BY user_id
      ) r30 ON r30.user_id = u.id
      ORDER BY (COALESCE(s.sent_total, 0) + COALESCE(r.recv_total, 0)) DESC
      LIMIT 50
    `)

    const topUsers = (topUsersQuery.rows as any[])
      .map((row) => ({
        userId: row.user_id as string,
        userName: (row.user_name ?? null) as string | null,
        userEmail: row.user_email as string,
        role: (row.role ?? null) as string | null,
        banned: (row.banned ?? false) as boolean,
        joinedAt: (row.joined_at ?? new Date(0)).toISOString ? (row.joined_at as Date).toISOString() : String(row.joined_at),
        featureFlags: row.feature_flags as string | null,
        sentEmails: Number(row.sent_emails ?? 0),
        receivedEmails: Number(row.received_emails ?? 0),
        emails7d: Number(row.emails_7d ?? 0),
        emails30d: Number(row.emails_30d ?? 0),
        lastSentEmail: row.last_sent_email ? String(row.last_sent_email) : null,
        lastReceivedEmail: row.last_received_email ? String(row.last_received_email) : null,
      }))

    // Calculate risk scores and format data
    return topUsers.map(u => {
      const sentEmails = Number(u.sentEmails)
      const receivedEmails = Number(u.receivedEmails)
      const totalEmails = sentEmails + receivedEmails
      const emails7d = Number(u.emails7d)
      const emails30d = Number(u.emails30d)
      
      // Calculate risk score based on various factors
      let riskScore = 0
      const flags: string[] = []

      // High volume risk
      if (emails7d > RISK_THRESHOLDS.HIGH_VOLUME_DAILY) {
        riskScore += 30
        flags.push('high_volume_7d')
      }
      if (emails30d > RISK_THRESHOLDS.HIGH_VOLUME_WEEKLY) {
        riskScore += 20
        flags.push('high_volume_30d')
      }

      // Banned user activity
      if (u.banned) {
        riskScore += 50
        flags.push('banned_user')
      }

      // New user with high activity
      const daysSinceJoined = (Date.now() - new Date(u.joinedAt).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceJoined < 7 && emails7d > 100) {
        riskScore += 25
        flags.push('new_user_high_activity')
      }

      // Determine last activity
      const lastSent = u.lastSentEmail ? new Date(u.lastSentEmail) : null
      const lastReceived = u.lastReceivedEmail ? new Date(u.lastReceivedEmail) : null
      const lastActivity = lastSent && lastReceived 
        ? (lastSent > lastReceived ? lastSent : lastReceived)
        : (lastSent || lastReceived)

      // Parse feature flags
      let parsedFlags = []
      try {
        if (u.featureFlags) {
          parsedFlags = JSON.parse(u.featureFlags)
          if (Array.isArray(parsedFlags)) {
            flags.push(...parsedFlags.map(flag => `feature_${flag}`))
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }

      return {
        userId: u.userId,
        userName: u.userName,
        userEmail: u.userEmail,
        role: u.role,
        banned: u.banned,
        sentEmails,
        receivedEmails,
        totalEmails,
        emailsLast7d: emails7d,
        emailsLast30d: emails30d,
        joinedAt: typeof (u as any).joinedAt === 'string'
          ? (u as any).joinedAt
          : new Date((u as any).joinedAt).toISOString(),
        lastActivity: lastActivity?.toISOString() || null,
        riskScore: Math.min(riskScore, 100), // Cap at 100
        flags
      }
    })
  },
  ['user-analytics-top-users'],
  {
    revalidate: CACHE_CONFIG.USER_ACTIVITY_TTL,
    tags: ['user-analytics-top-users']
  }
)

// Cached function for suspicious activity detection
const getCachedSuspiciousActivity = unstable_cache(
  async () => {
    console.log('🔄 Detecting suspicious user activity')
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const suspiciousActivities: SuspiciousActivity[] = []

    // 1. High volume users (sudden spikes)
    const highVolumeUsers = await db
      .select({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        emails24h: sql<number>`COALESCE((
          SELECT COUNT(*) 
          FROM sent_emails 
          WHERE sent_emails.user_id = ${user.id} 
          AND sent_emails.created_at >= ${last24h}
        ), 0) + COALESCE((
          SELECT COUNT(*) 
          FROM received_emails 
          WHERE received_emails.user_id = ${user.id} 
          AND received_emails.created_at >= ${last24h}
        ), 0)`,
        emails7d: sql<number>`COALESCE((
          SELECT COUNT(*) 
          FROM sent_emails 
          WHERE sent_emails.user_id = ${user.id} 
          AND sent_emails.created_at >= ${last7d}
        ), 0) + COALESCE((
          SELECT COUNT(*) 
          FROM received_emails 
          WHERE received_emails.user_id = ${user.id} 
          AND received_emails.created_at >= ${last7d}
        ), 0)`
      })
      .from(user)
      .groupBy(user.id, user.name, user.email)
      .having(sql`COALESCE((
        SELECT COUNT(*) 
        FROM sent_emails 
        WHERE sent_emails.user_id = ${user.id} 
        AND sent_emails.created_at >= ${last24h}
      ), 0) + COALESCE((
        SELECT COUNT(*) 
        FROM received_emails 
        WHERE received_emails.user_id = ${user.id} 
        AND received_emails.created_at >= ${last24h}
      ), 0) > ${RISK_THRESHOLDS.HIGH_VOLUME_DAILY}`)

    highVolumeUsers.forEach(u => {
      const emails24h = Number(u.emails24h)
      const emails7d = Number(u.emails7d)
      
      suspiciousActivities.push({
        userId: u.userId,
        userName: u.userName,
        userEmail: u.userEmail,
        activityType: 'high_volume',
        description: `User sent/received ${emails24h} emails in the last 24 hours`,
        severity: emails24h > 2000 ? 'critical' : emails24h > 1500 ? 'high' : 'medium',
        details: {
          emails24h,
          emails7d,
          dailyAverage: Math.round(emails7d / 7)
        },
        detectedAt: now.toISOString(),
        riskScore: Math.min(Math.round((emails24h / RISK_THRESHOLDS.HIGH_VOLUME_DAILY) * 50), 100)
      })
    })

    // 2. Banned users with recent activity
    const bannedUsersWithActivity = await db
      .select({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        banReason: user.banReason,
        recentActivity: sql<number>`COALESCE((
          SELECT COUNT(*) 
          FROM sent_emails 
          WHERE sent_emails.user_id = ${user.id} 
          AND sent_emails.created_at >= ${last24h}
        ), 0) + COALESCE((
          SELECT COUNT(*) 
          FROM received_emails 
          WHERE received_emails.user_id = ${user.id} 
          AND received_emails.created_at >= ${last24h}
        ), 0)`
      })
      .from(user)
      .where(eq(user.banned, true))
      .groupBy(user.id, user.name, user.email, user.banReason)
      .having(sql`COALESCE((
        SELECT COUNT(*) 
        FROM sent_emails 
        WHERE sent_emails.user_id = ${user.id} 
        AND sent_emails.created_at >= ${last24h}
      ), 0) + COALESCE((
        SELECT COUNT(*) 
        FROM received_emails 
        WHERE received_emails.user_id = ${user.id} 
        AND received_emails.created_at >= ${last24h}
      ), 0) > 0`)

    bannedUsersWithActivity.forEach(u => {
      suspiciousActivities.push({
        userId: u.userId,
        userName: u.userName,
        userEmail: u.userEmail,
        activityType: 'banned_activity',
        description: `Banned user has ${u.recentActivity} recent email activities`,
        severity: 'critical',
        details: {
          banReason: u.banReason,
          recentActivity: Number(u.recentActivity)
        },
        detectedAt: now.toISOString(),
        riskScore: 100
      })
    })

    // 3. Recently joined users with high activity
    const rapidSignupUsers = await db
      .select({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        createdAt: user.createdAt,
        recentActivity: sql<number>`COALESCE((
          SELECT COUNT(*) 
          FROM sent_emails 
          WHERE sent_emails.user_id = ${user.id} 
          AND sent_emails.created_at >= ${last7d}
        ), 0) + COALESCE((
          SELECT COUNT(*) 
          FROM received_emails 
          WHERE received_emails.user_id = ${user.id} 
          AND received_emails.created_at >= ${last7d}
        ), 0)`
      })
      .from(user)
      .where(gte(user.createdAt, last7d))
      .groupBy(user.id, user.name, user.email, user.createdAt)
      .having(sql`COALESCE((
        SELECT COUNT(*) 
        FROM sent_emails 
        WHERE sent_emails.user_id = ${user.id} 
        AND sent_emails.created_at >= ${last7d}
      ), 0) + COALESCE((
        SELECT COUNT(*) 
        FROM received_emails 
        WHERE received_emails.user_id = ${user.id} 
        AND received_emails.created_at >= ${last7d}
      ), 0) > 100`)

    rapidSignupUsers.forEach(u => {
      const daysSinceJoined = (now.getTime() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      const recentActivity = Number(u.recentActivity)
      
      suspiciousActivities.push({
        userId: u.userId,
        userName: u.userName,
        userEmail: u.userEmail,
        activityType: 'rapid_signup',
        description: `New user (${Math.round(daysSinceJoined)} days old) with ${recentActivity} emails`,
        severity: recentActivity > 500 ? 'high' : 'medium',
        details: {
          daysSinceJoined: Math.round(daysSinceJoined),
          recentActivity,
          emailsPerDay: Math.round(recentActivity / Math.max(daysSinceJoined, 1))
        },
        detectedAt: now.toISOString(),
        riskScore: Math.min(Math.round((recentActivity / daysSinceJoined) * 5), 100)
      })
    })

    // Sort by risk score descending and limit results
    return suspiciousActivities
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20)
  },
  ['user-analytics-suspicious'],
  {
    revalidate: CACHE_CONFIG.SUSPICIOUS_TTL,
    tags: ['user-analytics-suspicious']
  }
)

// Cached function for email trends
const getCachedTrends = unstable_cache(
  async () => {
    console.log('🔄 Fetching email trends and user growth')
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [hourlyTrends, dailyTrends, userGrowth] = await Promise.all([
      // Hourly email trends (last 24 hours)
      db.select({
        hour: sql<string>`DATE_TRUNC('hour', combined.created_at)`,
        sent: sql<number>`SUM(CASE WHEN combined.type = 'sent' THEN 1 ELSE 0 END)`,
        received: sql<number>`SUM(CASE WHEN combined.type = 'received' THEN 1 ELSE 0 END)`
      })
      .from(sql`(
        SELECT sent_emails.created_at as created_at, 'sent' as type
        FROM sent_emails
        WHERE sent_emails.created_at >= ${last24h}
        UNION ALL
        SELECT received_emails.created_at as created_at, 'received' as type
        FROM received_emails
        WHERE received_emails.created_at >= ${last24h}
      ) as combined`)
      .groupBy(sql`DATE_TRUNC('hour', combined.created_at)`)
      .orderBy(sql`DATE_TRUNC('hour', combined.created_at)`),

      // Daily email trends (last 30 days)
      db.select({
        date: sql<string>`DATE_TRUNC('day', combined.created_at)`,
        sent: sql<number>`SUM(CASE WHEN combined.type = 'sent' THEN 1 ELSE 0 END)`,
        received: sql<number>`SUM(CASE WHEN combined.type = 'received' THEN 1 ELSE 0 END)`
      })
      .from(sql`(
        SELECT sent_emails.created_at as created_at, 'sent' as type
        FROM sent_emails
        WHERE sent_emails.created_at >= ${last30d}
        UNION ALL
        SELECT received_emails.created_at as created_at, 'received' as type
        FROM received_emails
        WHERE received_emails.created_at >= ${last30d}
      ) as combined`)
      .groupBy(sql`DATE_TRUNC('day', combined.created_at)`)
      .orderBy(sql`DATE_TRUNC('day', combined.created_at)`),

      // User growth trends (last 30 days)
      db.select({
        date: sql<string>`DATE_TRUNC('day', ${user.createdAt})`,
        newUsers: count(),
        totalUsers: sql<number>`COUNT(*) OVER (ORDER BY DATE_TRUNC('day', ${user.createdAt}) ROWS UNBOUNDED PRECEDING)`
      })
      .from(user)
      .where(gte(user.createdAt, last30d))
      .groupBy(sql`DATE_TRUNC('day', ${user.createdAt})`)
      .orderBy(sql`DATE_TRUNC('day', ${user.createdAt})`)
    ])

    return {
      hourly: hourlyTrends.map(h => ({
        hour: h.hour,
        sent: Number(h.sent),
        received: Number(h.received)
      })),
      daily: dailyTrends.map(d => ({
        date: d.date,
        sent: Number(d.sent),
        received: Number(d.received)
      })),
      userGrowth: userGrowth.map(g => ({
        period: g.date,
        newUsers: Number(g.newUsers),
        activeUsers: 0, // Could be enhanced with activity tracking
        totalUsers: Number(g.totalUsers)
      }))
    }
  },
  ['user-analytics-trends'],
  {
    revalidate: CACHE_CONFIG.TRENDS_TTL,
    tags: ['user-analytics-trends']
  }
)

// Main user analytics function
export const getUserAnalytics = async (): Promise<{ success: true; data: UserAnalyticsData } | { success: false; error: string }> => {
  await requireAdmin()
  try {
    // Get user session and check admin permissions
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    if (session.user.role !== 'admin') {
      return {
        success: false,
        error: 'Admin access required'
      }
    }

    // Fetch all data in parallel
    const [overview, topUsers, suspiciousActivity, trends] = await Promise.all([
      getCachedOverview(),
      getCachedTopUsers(),
      getCachedSuspiciousActivity(),
      getCachedTrends()
    ])

    const analyticsData: UserAnalyticsData = {
      overview,
      topUsers,
      suspiciousActivity,
      emailTrends: {
        hourly: trends.hourly,
        daily: trends.daily
      },
      userGrowth: trends.userGrowth,
      cachedAt: new Date().toISOString()
    }

    return {
      success: true,
      data: analyticsData
    }
  } catch (error) {
    console.error('User analytics error:', error)
    return {
      success: false,
      error: 'Failed to fetch user analytics data'
    }
  }
}

// Cache invalidation function
export const invalidateUserAnalyticsCache = async () => {
  await requireAdmin()
  revalidateTag('user-analytics-overview')
  revalidateTag('user-analytics-top-users') 
  revalidateTag('user-analytics-suspicious')
  revalidateTag('user-analytics-trends')
}

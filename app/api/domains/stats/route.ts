import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, sesEvents, SES_VERIFICATION_STATUS } from '@/lib/db/schema'
import { eq, and, count, sql, gte } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

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

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Get domains with aggregated data using a single optimized query
    const domainsWithStats = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        status: emailDomains.status,
        sesVerificationStatus: emailDomains.sesVerificationStatus,
        canReceiveEmails: emailDomains.canReceiveEmails,
        createdAt: emailDomains.createdAt,
        updatedAt: emailDomains.updatedAt,
        emailAddressCount: sql<number>`COALESCE(${sql`(
          SELECT COUNT(*)::int 
          FROM ${emailAddresses} 
          WHERE ${emailAddresses.domainId} = ${emailDomains.id} 
          AND ${emailAddresses.isActive} = true
        )`}, 0)`,
        emailsLast24h: sql<number>`COALESCE(${sql`(
          SELECT COUNT(*)::int 
          FROM ${sesEvents} 
          WHERE EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(${sesEvents.destination}::jsonb) AS dest_email
            WHERE dest_email LIKE '%@' || ${emailDomains.domain}
          )
          AND ${sesEvents.timestamp} >= ${twentyFourHoursAgo}
        )`}, 0)`
      })
      .from(emailDomains)
      .where(eq(emailDomains.userId, session.user.id))
      .orderBy(emailDomains.createdAt)

    // Transform the data for the frontend
    const transformedDomains = domainsWithStats.map(domain => ({
      id: domain.id,
      domain: domain.domain,
      status: domain.status,
      isVerified: domain.sesVerificationStatus === SES_VERIFICATION_STATUS.SUCCESS && domain.canReceiveEmails,
      emailAddressCount: domain.emailAddressCount,
      emailsLast24h: domain.emailsLast24h,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt
    }))

    return NextResponse.json({
      domains: transformedDomains,
      totalDomains: transformedDomains.length,
      verifiedDomains: transformedDomains.filter(d => d.isVerified).length,
      totalEmailAddresses: transformedDomains.reduce((sum, d) => sum + d.emailAddressCount, 0),
      totalEmailsLast24h: transformedDomains.reduce((sum, d) => sum + d.emailsLast24h, 0)
    })

  } catch (error) {
    console.error('Error fetching domain stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch domain statistics' },
      { status: 500 }
    )
  }
} 
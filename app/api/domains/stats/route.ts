import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailDomains, emailAddresses, sesEvents, SES_VERIFICATION_STATUS, DOMAIN_STATUS } from '@/lib/db/schema'
import { eq, and, count, sql, gte } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { SESClient, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses'

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

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

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    
    // Check if this is a sync request
    if (!body.syncWithAWS) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    const userId = session.user.id

    // Get all domains for the user
    const userDomains = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        status: emailDomains.status,
        sesVerificationStatus: emailDomains.sesVerificationStatus,
        canReceiveEmails: emailDomains.canReceiveEmails
      })
      .from(emailDomains)
      .where(eq(emailDomains.userId, userId))

    if (userDomains.length === 0) {
      return NextResponse.json({
        message: 'No domains found for user',
        synced: 0
      })
    }

    // Get verification status from AWS SES
    const domainNames = userDomains.map(d => d.domain)
    const sesCommand = new GetIdentityVerificationAttributesCommand({
      Identities: domainNames
    })

    const sesResponse = await sesClient.send(sesCommand)
    const verificationAttributes = sesResponse.VerificationAttributes || {}

    let syncedCount = 0
    const syncResults = []

    // Update each domain based on SES status
    for (const domain of userDomains) {
      const sesStatus = verificationAttributes[domain.domain]
      
      if (sesStatus) {
        const isVerified = sesStatus.VerificationStatus === 'Success'
        const newSesVerificationStatus = sesStatus.VerificationStatus === 'Success' 
          ? SES_VERIFICATION_STATUS.SUCCESS 
          : sesStatus.VerificationStatus === 'Failed'
          ? SES_VERIFICATION_STATUS.FAILED
          : SES_VERIFICATION_STATUS.PENDING

        const newStatus = isVerified ? DOMAIN_STATUS.SES_VERIFIED : domain.status
        const canReceiveEmails = isVerified
        const dnsCheckPassed = isVerified

        // Update the domain if there are changes
        if (
          domain.sesVerificationStatus !== newSesVerificationStatus ||
          domain.canReceiveEmails !== canReceiveEmails ||
          domain.status !== newStatus
        ) {
          await db
            .update(emailDomains)
            .set({
              sesVerificationStatus: newSesVerificationStatus,
              canReceiveEmails,
              dnsCheckPassed,
              status: newStatus,
              lastSesCheck: new Date(),
              updatedAt: new Date()
            })
            .where(eq(emailDomains.id, domain.id))

          syncedCount++
          syncResults.push({
            domain: domain.domain,
            oldStatus: domain.sesVerificationStatus,
            newStatus: newSesVerificationStatus,
            canReceiveEmails,
            updated: true
          })
        } else {
          syncResults.push({
            domain: domain.domain,
            status: domain.sesVerificationStatus,
            canReceiveEmails: domain.canReceiveEmails,
            updated: false
          })
        }
      }
    }

    return NextResponse.json({
      message: `Synced ${syncedCount} domains with AWS SES`,
      synced: syncedCount,
      total: userDomains.length,
      results: syncResults
    })

  } catch (error) {
    console.error('Domain sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync domains with AWS SES' },
      { status: 500 }
    )
  }
} 
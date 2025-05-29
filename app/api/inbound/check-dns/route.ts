import { NextRequest, NextResponse } from 'next/server'
import { checkDomainCanReceiveEmails } from '@/lib/dns'
import { createDomainVerification, getDomainWithRecords } from '@/lib/db/domains'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { Autumn as autumn } from 'autumn-js'
import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq, count } from 'drizzle-orm'

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

    const { domain } = await request.json()

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      )
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domainRegex.test(domain) || domain.length > 253) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      )
    }

    // Check if domain already exists for this user
    const existingDomain = await getDomainWithRecords(domain, session.user.id)
    if (existingDomain) {
      // Return existing domain data
      return NextResponse.json({
        ...existingDomain,
        timestamp: new Date()
      })
    }

    // Check Autumn domain limits before proceeding
    const { data: domainCheck, error: domainCheckError } = await autumn.check({
      customer_id: session.user.id,
      feature_id: "domains",
    })

    if (domainCheckError) {
      console.error('Autumn domain check error:', domainCheckError)
      return NextResponse.json(
        { error: 'Failed to check domain limits' },
        { status: 500 }
      )
    }

    if (!domainCheck?.allowed) {
      return NextResponse.json(
        { error: 'Domain limit reached. Please upgrade your plan to add more domains.' },
        { status: 403 }
      )
    }

    // Count current domains for the user to compare against balance
    const [currentDomainCount] = await db
      .select({ count: count() })
      .from(emailDomains)
      .where(eq(emailDomains.userId, session.user.id))

    const userDomainCount = currentDomainCount?.count || 0
    const domainBalance = domainCheck.balance || 0

    // Check if user has reached their domain limit
    if (!domainCheck.unlimited && userDomainCount >= domainBalance) {
      return NextResponse.json(
        { 
          error: `Domain limit reached (${userDomainCount}/${domainBalance}). Please upgrade your plan to add more domains.` 
        },
        { status: 403 }
      )
    }

    // Check DNS records using server-side DNS utilities
    const dnsResult = await checkDomainCanReceiveEmails(domain)

    // Create domain verification record in database
    const domainRecord = await createDomainVerification(
      domain,
      session.user.id,
      {
        canReceiveEmails: dnsResult.canReceiveEmails,
        hasMxRecords: dnsResult.hasMxRecords,
        provider: dnsResult.provider
      }
    )

    // Return combined result
    return NextResponse.json({
      ...dnsResult,
      domainId: domainRecord.id,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('DNS check error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to check DNS records',
        domain: '',
        canReceiveEmails: false,
        hasMxRecords: false,
        timestamp: new Date()
      },
      { status: 500 }
    )
  }
} 
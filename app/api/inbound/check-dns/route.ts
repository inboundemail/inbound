import { NextRequest, NextResponse } from 'next/server'
import { checkDomainCanReceiveEmails } from '@/lib/dns'
import { createDomainVerification, getDomainWithRecords } from '@/lib/db/domains'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

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
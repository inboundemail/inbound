import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { createDomainVerification } from '@/lib/db/domains'
import { initiateDomainVerification } from '@/lib/domain-verification'
import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

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
    const { domain } = body

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      )
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      )
    }

    // Check if domain already exists for this user
    const existingDomain = await db
      .select()
      .from(emailDomains)
      .where(and(eq(emailDomains.domain, domain), eq(emailDomains.userId, session.user.id)))
      .limit(1)

    if (existingDomain.length > 0) {
      return NextResponse.json(
        { error: 'Domain already exists in your account' },
        { status: 409 }
      )
    }

    // Perform initial DNS check to get domain information
    const dnsCheckResult = {
      canReceiveEmails: false, // Will be determined by DNS verification
      hasMxRecords: false,     // Will be determined by DNS verification
      provider: {
        name: 'Unknown',
        confidence: 'low' as const
      }
    }

    // Create the domain verification record
    const createdDomain = await createDomainVerification(
      domain,
      session.user.id,
      dnsCheckResult
    )

    // Automatically run DNS verification to generate DNS records
    try {
      const verificationResult = await initiateDomainVerification(
        createdDomain.domain,
        session.user.id
      )
      
      console.log('DNS verification initiated for domain:', domain, {
        status: verificationResult.status,
        dnsRecordsCount: verificationResult.dnsRecords.length
      })
    } catch (verifyError) {
      console.error('Error running DNS verification:', verifyError)
      // Don't fail the domain creation if verification fails
    }

    return NextResponse.json({
      success: true,
      domain: {
        id: createdDomain.id,
        domain: createdDomain.domain,
        status: createdDomain.status
      }
    })

  } catch (error) {
    console.error('Error creating domain:', error)
    return NextResponse.json(
      { error: 'Failed to create domain' },
      { status: 500 }
    )
  }
} 
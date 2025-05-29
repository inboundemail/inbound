import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { createDomainVerification } from '@/lib/db/domains'
import { initiateDomainVerification } from '@/lib/domain-verification'
import { checkDomainCanReceiveEmails } from '@/lib/dns'
import { db } from '@/lib/db'
import { emailDomains } from '@/lib/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'

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

    // Check if domain already has MX records BEFORE doing anything else
    console.log(`Checking MX records for domain: ${domain}`)
    const dnsCheckResult = await checkDomainCanReceiveEmails(domain)
    
    if (dnsCheckResult.hasMxRecords) {
      console.log(`Domain ${domain} already has MX records:`, dnsCheckResult.mxRecords)
      return NextResponse.json(
        { 
          error: 'Domain already has existing MX records and cannot be configured for inbound email. This would conflict with your current email setup. Please try using a subdomain instead (e.g., mail.yourdomain.com or inbound.yourdomain.com).',
          hasMxRecords: true,
          mxRecords: dnsCheckResult.mxRecords,
          suggestedSubdomains: [
            `mail.${domain}`,
            `inbound.${domain}`,
            `emails.${domain}`,
            `app.${domain}`
          ]
        },
        { status: 409 }
      )
    }

    if (!dnsCheckResult.canReceiveEmails && dnsCheckResult.error && !dnsCheckResult.error.includes('safe for email receiving')) {
      console.log(`Domain ${domain} failed DNS check:`, dnsCheckResult.error)
      return NextResponse.json(
        { 
          error: `Domain verification failed: ${dnsCheckResult.error}. Please check your domain and try again.`,
          dnsError: true
        },
        { status: 400 }
      )
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

    // Create the domain verification record with the actual DNS check results
    const createdDomain = await createDomainVerification(
      domain,
      session.user.id,
      {
        canReceiveEmails: dnsCheckResult.canReceiveEmails,
        hasMxRecords: dnsCheckResult.hasMxRecords,
        provider: dnsCheckResult.provider
      }
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
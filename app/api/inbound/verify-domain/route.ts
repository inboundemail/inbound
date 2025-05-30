import { NextRequest, NextResponse } from 'next/server'
import { getDomainWithRecords, updateDomainStatus, areAllDnsRecordsVerified } from '@/lib/db/domains'
import { verifyDnsRecords } from '@/lib/dns-verification'
import { initiateDomainVerification } from '@/lib/domain-verification'
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

    const { domain, domainId } = await request.json()

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      )
    }

    // Get domain record from database
    let domainRecord = await getDomainWithRecords(domain, session.user.id)
    if (!domainRecord) {
      return NextResponse.json(
        { error: 'Domain not found. Please run DNS check first.' },
        { status: 404 }
      )
    }

    try {
      // Use the shared verification function
      const verificationResult = await initiateDomainVerification(domain, session.user.id)
      
      // If this is a re-verification (domain already has DNS records), check them
      if (domainRecord.dnsRecords.length > 0) {
        const requiredDnsRecords = verificationResult.dnsRecords.map(record => ({
          type: record.type,
          name: record.name,
          value: record.value
        }))

        // Check DNS records if SES is verified
        if (verificationResult.sesStatus === 'Success') {
          const dnsChecks = await verifyDnsRecords(requiredDnsRecords)
          const allDnsVerified = dnsChecks.every(check => check.isVerified)
          
          if (allDnsVerified) {
            verificationResult.status = 'verified'
            await updateDomainStatus(domainRecord.id, 'verified')
          }

          // Update DNS records status with actual verification results
          verificationResult.dnsRecords = dnsChecks.map(check => ({
            type: check.type,
            name: check.name,
            value: check.expectedValue,
            isVerified: check.isVerified
          }))
        }
      }

      return NextResponse.json({
        ...verificationResult,
        timestamp: new Date()
      })

    } catch (error) {
      console.error('Domain verification error:', error)
      
      return NextResponse.json(
        { 
          error: error instanceof Error ? error.message : 'Failed to verify domain with AWS SES',
          domain,
          domainId: domainRecord.id,
          verificationToken: '',
          status: 'failed' as const,
          dnsRecords: domainRecord.dnsRecords.map(r => ({
            type: r.recordType,
            name: r.name,
            value: r.value,
            isVerified: r.isVerified
          })),
          timestamp: new Date()
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Domain verification error:', error)
    return NextResponse.json(
      { error: 'Failed to verify domain' },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from 'next/server'
import { getDomainWithRecords, updateDnsRecordVerification, updateDomainStatus } from '@/lib/db/domains'
import { verifyDnsRecords } from '@/lib/dns'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let domain = 'unknown'
  
  try {
    console.log('🔍 DNS Records Check - Starting verification process')
    
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      console.log('❌ DNS Records Check - Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const requestData = await request.json()
    domain = requestData.domain
    const domainId = requestData.domainId

    console.log(`🌐 DNS Records Check - Processing domain: ${domain} for user: ${session.user.email}`)

    if (!domain) {
      console.log('⚠️ DNS Records Check - Missing domain parameter')
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      )
    }

    // Get domain record from database
    console.log(`📊 DNS Records Check - Fetching domain record from database`)
    const domainRecord = await getDomainWithRecords(domain, session.user.id)
    if (!domainRecord) {
      console.log(`❌ DNS Records Check - Domain not found: ${domain}`)
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    console.log(`📋 DNS Records Check - Found ${domainRecord.dnsRecords.length} DNS records to verify`)

    // Check DNS records
    const recordsToCheck = domainRecord.dnsRecords.map(r => ({
      type: r.recordType,
      name: r.name,
      value: r.value
    }))

    console.log(`🔎 DNS Records Check - Starting DNS verification for records:`)
    recordsToCheck.forEach((record, index) => {
      console.log(`   ${index + 1}. ${record.type} ${record.name} = ${record.value.substring(0, 50)}${record.value.length > 50 ? '...' : ''}`)
    })

    const dnsChecks = await verifyDnsRecords(recordsToCheck)
    
    // Log verification results
    console.log(`📊 DNS Records Check - Verification results:`)
    dnsChecks.forEach((check, index) => {
      const status = check.isVerified ? '✅' : '❌'
      console.log(`   ${index + 1}. ${status} ${check.type} ${check.name} - ${check.isVerified ? 'VERIFIED' : 'FAILED'}`)
      if (!check.isVerified && check.error) {
        console.log(`      Error: ${check.error}`)
      }
      if (check.actualValues && check.actualValues.length > 0) {
        console.log(`      Found: ${check.actualValues.join(', ')}`)
      }
    })
    
    // Update database with verification results
    console.log(`💾 DNS Records Check - Updating database with verification results`)
    for (const check of dnsChecks) {
      await updateDnsRecordVerification(
        domainRecord.id,
        check.type,
        check.name,
        check.isVerified
      )
    }

    // Check if all DNS records are verified
    const allVerified = dnsChecks.every(check => check.isVerified)
    const verifiedCount = dnsChecks.filter(check => check.isVerified).length
    
    console.log(`📈 DNS Records Check - Verification summary: ${verifiedCount}/${dnsChecks.length} records verified`)
    
    // Update domain status if all DNS records are verified
    if (allVerified && domainRecord.status !== 'ses_verified') {
      console.log(`🎉 DNS Records Check - All records verified! Updating domain status to 'dns_verified'`)
      await updateDomainStatus(domainRecord.id, 'dns_verified')
    } else if (allVerified) {
      console.log(`✅ DNS Records Check - All records verified (domain already in ses_verified status)`)
    } else {
      console.log(`⏳ DNS Records Check - Waiting for remaining records to be verified`)
    }

    const duration = Date.now() - startTime
    console.log(`🏁 DNS Records Check - Completed successfully for ${domain} in ${duration}ms`)
    
    return NextResponse.json({
      domain,
      domainId: domainRecord.id,
      dnsRecords: dnsChecks.map(check => ({
        type: check.type,
        name: check.name,
        value: check.expectedValue,
        isVerified: check.isVerified,
        actualValues: check.actualValues,
        error: check.error
      })),
      allVerified,
      canProceed: allVerified,
      timestamp: new Date()
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`💥 DNS Records Check - Error for domain ${domain} after ${duration}ms:`, error)
    console.error(`   Error details:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      domain,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json(
      { error: 'Failed to check DNS records' },
      { status: 500 }
    )
  }
} 
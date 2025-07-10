import { NextRequest, NextResponse } from 'next/server'
import { getDomainWithRecordsAndEmails } from '@/lib/db/domains'
import { auth } from '@/lib/auth/auth'
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

    // Get domain record with email addresses from database
    const domainRecord = await getDomainWithRecordsAndEmails(domain, session.user.id)
    if (!domainRecord) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      domain,
      emailAddresses: (domainRecord.emailAddresses || []).map((email: any) => ({
        id: email.id,
        address: email.address,
        isConfigured: email.isReceiptRuleConfigured,
        ruleName: email.receiptRuleName,
        createdAt: email.createdAt
      })),
      hasExistingConfiguration: (domainRecord.emailAddresses || []).length > 0,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('Get email addresses error:', error)
    return NextResponse.json(
      { error: 'Failed to get email addresses' },
      { status: 500 }
    )
  }
} 
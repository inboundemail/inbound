import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { receivedEmails } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    const { recipient } = await request.json()

    if (!recipient) {
      return NextResponse.json(
        { error: 'Recipient email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(recipient)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Extract domain from email
    const domain = recipient.split('@')[1]

    // Check if this is a domain we manage
    // For now, we'll check against environment variables or a simple list
    const managedDomains = process.env.MANAGED_DOMAINS?.split(',') || ['exon.dev']
    
    const isDomainManaged = managedDomains.some(managedDomain => 
      domain.toLowerCase() === managedDomain.toLowerCase() ||
      domain.toLowerCase().endsWith(`.${managedDomain.toLowerCase()}`)
    )

    if (!isDomainManaged) {
      return NextResponse.json({
        isManaged: false,
        reason: 'Domain not in managed domains list'
      })
    }

    // TODO: Add more sophisticated checks here:
    // - Check if the specific email address is in a whitelist
    // - Check user permissions/subscriptions
    // - Check if the email address is associated with an active user
    
    // For now, if the domain is managed, we accept all emails to that domain
    const result = {
      isManaged: true,
      recipient,
      domain,
      timestamp: new Date()
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Check recipient error:', error)
    return NextResponse.json(
      { 
        isManaged: false,
        error: 'Failed to check recipient status'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check recipient status (for debugging)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recipient = searchParams.get('recipient')

    if (!recipient) {
      return NextResponse.json(
        { error: 'Recipient email parameter is required' },
        { status: 400 }
      )
    }

    // Same logic as POST but for GET requests
    const domain = recipient.split('@')[1]
    const managedDomains = process.env.MANAGED_DOMAINS?.split(',') || ['exon.dev']
    
    const isDomainManaged = managedDomains.some(managedDomain => 
      domain.toLowerCase() === managedDomain.toLowerCase() ||
      domain.toLowerCase().endsWith(`.${managedDomain.toLowerCase()}`)
    )

    const result = {
      isManaged: isDomainManaged,
      recipient,
      domain,
      managedDomains,
      timestamp: new Date()
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Check recipient error:', error)
    return NextResponse.json(
      { 
        isManaged: false,
        error: 'Failed to check recipient status'
      },
      { status: 500 }
    )
  }
} 
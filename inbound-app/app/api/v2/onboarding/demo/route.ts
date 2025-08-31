import { NextRequest, NextResponse } from 'next/server'
import { Inbound } from '@inboundemail/sdk'
import { validateRequest } from '../../../v2/helper/main'
import { db } from '@/lib/db'
import { onboardingDemoEmails, sentEmails } from '@/lib/db/schema'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

/**
 * POST /api/v2/onboarding/demo
 * Demo route for onboarding to test SDK email sending
 */

interface DemoRequest {
  apiKey: string
  to: string
}

export async function POST(request: NextRequest) {
  console.log('📧 POST /api/v2/onboarding/demo - Starting demo request')
  
  try {
    console.log('🔐 Validating request authentication')
    const { userId, error: authError } = await validateRequest(request)
    if (!userId) {
      console.log('❌ Authentication failed:', authError)
      return NextResponse.json({ error: authError }, { status: 401 })
    }
    console.log('✅ Authentication successful for userId:', userId)

    const body: DemoRequest = await request.json()
    
    if (!body.apiKey || !body.to) {
      console.log('❌ Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields: apiKey and to are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.to)) {
      console.log('❌ Invalid email format:', body.to)
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    console.log('📤 Sending demo email via SDK to:', body.to)
    console.log('🔑 Using API key (first 8 chars):', body.apiKey.slice(0, 8))

    // Initialize SDK with provided API key
    const inbound = new Inbound(body.apiKey)
    
    console.log('🔧 SDK configured with baseURL:', process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://inbound.new')

    // Send email using SDK
    const { data: response, error: errorResponse } = await inbound.emails.send({
      from: 'Inbound Agent <agent@inbnd.dev>',
      to: body.to,
      subject: 'Welcome to Inbound - Reply to Complete Onboarding!',
      text: 'Thanks for signing up! Please reply to this email with your favorite email client.',
      html: '<p>Thanks for signing up!</p><p><strong>Please reply to this email with your favorite email client.</strong></p>'
    })

    if (errorResponse) {
      console.error('❌ Demo email error:', errorResponse)
      return NextResponse.json(
        { error: errorResponse },
        { status: 500 }
      )
    }

    console.log('✅ Demo email sent successfully:', response?.id)
    console.log('📧 Message ID:', response?.id)

    // Get the messageId from the sent email record for proper reply matching
    console.log('🔍 Fetching messageId from sent email record...')
    let messageId: string | null = null
    
    // Wait a moment for the email to be processed and messageId to be set
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const sentEmailRecord = await db
      .select({ messageId: sentEmails.messageId })
      .from(sentEmails)
      .where(eq(sentEmails.id, response?.id!))
      .limit(1)

    if (sentEmailRecord.length > 0 && sentEmailRecord[0].messageId) {
      messageId = sentEmailRecord[0].messageId
      console.log('📧 Found messageId for reply matching:', messageId)
    } else {
      console.log('⚠️ No messageId found yet, will rely on email matching as fallback')
    }

    // Track the demo email for reply matching
    const demoEmailId = nanoid()
    await db.insert(onboardingDemoEmails).values({
      id: demoEmailId,
      userId,
      emailId: response?.id!,
      messageId,
      recipientEmail: body.to,
      sentAt: new Date()
    })

    console.log('📝 Tracked demo email for reply matching:', { demoEmailId, messageId })
    return NextResponse.json({ id: response?.id }, { status: 200 })

  } catch (error) {
    console.error('❌ Demo email error:', error)
    
    // Handle SDK errors
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to send demo email' },
      { status: 500 }
    )
  }
}

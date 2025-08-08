import { NextRequest, NextResponse } from 'next/server'
import { Inbound } from '@inboundemail/sdk'
import { validateRequest } from '../../../v2/helper/main'
import { db } from '@/lib/db'
import { onboardingDemoEmails } from '@/lib/db/schema'
import { nanoid } from 'nanoid'

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
    const inbound = new Inbound({ 
      apiKey: body.apiKey,
      baseUrl: process.env.NODE_ENV === 'development' 
        ? 'http://localhost:3000/api/v2' 
        : 'https://inbound.new/api/v2'
    })
    
    console.log('🔧 SDK configured with baseURL:', process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://inbound.new')

    // Send email using SDK
    const { id } = await inbound.emails.send({
      from: 'Inbound Agent <agent@inbnd.dev>',
      to: body.to,
      subject: 'Welcome to Inbound - Reply to Complete Onboarding!',
      text: 'Thanks for signing up! Please reply to this email with your favorite email client.',
      html: '<p>Thanks for signing up!</p><p><strong>Please reply to this email with your favorite email client.</strong></p>'
    })

    console.log('✅ Demo email sent successfully:', id)

    // Track the demo email for reply matching
    const demoEmailId = nanoid()
    await db.insert(onboardingDemoEmails).values({
      id: demoEmailId,
      userId,
      emailId: id,
      recipientEmail: body.to,
      sentAt: new Date()
    })

    console.log('📝 Tracked demo email for reply matching:', demoEmailId)
    return NextResponse.json({ id }, { status: 200 })

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

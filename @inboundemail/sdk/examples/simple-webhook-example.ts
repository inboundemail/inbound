/**
 * Simple webhook handler example for Inbound Email
 * Copy and paste this into your Next.js app/api/webhook/inbound/route.ts file
 */

import { NextRequest, NextResponse } from 'next/server'
import { Inbound } from '@inboundemail/sdk'
import type { 
  InboundWebhookPayload, 
  isInboundWebhook,
  getSenderInfo,
  getEmailText 
} from '@inboundemail/sdk'

// Initialize with default reply address for streamlined replies
const inbound = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
  defaultReplyFrom: 'support@yourdomain.com' // 🔥 Set this for simple replies
})

export async function POST(request: NextRequest) {
  try {
    // Parse the incoming webhook payload with type safety
    const payload: InboundWebhookPayload = await request.json()
    
    // Verify it's a valid Inbound webhook (optional but recommended)
    if (!isInboundWebhook(payload)) {
      console.error('❌ Invalid webhook payload received')
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }
    
    // Extract email data with full type safety
    const { email, endpoint, timestamp } = payload
    
    console.log('📧 New email received!')
    console.log(`   Subject: ${email.subject}`)
    console.log(`   Via endpoint: ${endpoint.name}`)
    console.log(`   Received at: ${timestamp}`)
    
    // Get sender information using helper function
    const sender = getSenderInfo(email)
    console.log(`   From: ${sender.name} <${sender.address}>`)
    
    // Get email content using helper function
    const emailText = getEmailText(email)
    console.log(`   Content preview: ${emailText.substring(0, 100)}...`)
    
    // Check if email has attachments
    if (email.cleanedContent.attachments.length > 0) {
      console.log(`   📎 Has ${email.cleanedContent.attachments.length} attachment(s)`)
      email.cleanedContent.attachments.forEach((attachment, index) => {
        console.log(`      ${index + 1}. ${attachment.filename} (${attachment.contentType})`)
      })
    }
    
    // ===== YOUR BUSINESS LOGIC WITH STREAMLINED REPLIES =====
    
    // 🔥 Example 1: Super simple auto-replies (uses defaultReplyFrom)
    if (email.subject?.toLowerCase().includes('thanks')) {
      console.log('😊 Sending thank you reply')
      await inbound.reply(email, "You're welcome! Let us know if you need anything else.")
    }
    
    if (email.subject?.toLowerCase().includes('support')) {
      console.log('🤖 Detected support email - sending auto-reply')
      await inbound.reply(email, "Thanks for contacting support! We'll get back to you within 24 hours.")
    }
    
    // 🔥 Example 2: Simple replies with custom from address
    if (email.subject?.toLowerCase().includes('billing')) {
      await inbound.reply(email, {
        from: 'billing@yourdomain.com', // Override default
        text: "Thanks for your billing inquiry. Our finance team will review and respond soon.",
        cc: ['finance@yourdomain.com']
      })
    }
    
    // 🔥 Example 3: Advanced replies with HTML
    if (email.subject?.toLowerCase().includes('order')) {
      console.log('📦 Processing order email')
      await inbound.reply(email, {
        from: 'orders@yourdomain.com',
        subject: 'Order Confirmation Received',
        html: `
          <h2>Order Confirmation</h2>
          <p>Hi ${sender.name || 'there'},</p>
          <p>We've received your order inquiry and will process it shortly.</p>
          <p>Order details will be sent to you within 1 business day.</p>
          <p>Best regards,<br>The Orders Team</p>
        `,
        text: `Order Confirmation\n\nHi ${sender.name || 'there'},\n\nWe've received your order inquiry and will process it shortly.\n\nOrder details will be sent to you within 1 business day.\n\nBest regards,\nThe Orders Team`
      })
    }
    
    // 🔥 Example 4: Conditional replies based on business hours
    const now = new Date()
    const isBusinessHours = isWithinBusinessHours(now)
    
    if (email.subject?.toLowerCase().includes('urgent') && !isBusinessHours) {
      await inbound.reply(email, {
        subject: 'Urgent Request Received - Out of Hours',
        text: `Thanks for your urgent request! We're currently outside business hours (9 AM - 5 PM EST), but we'll prioritize your message first thing tomorrow morning.`,
        headers: {
          'X-Priority': 'High',
          'X-Auto-Reply': 'out-of-hours'
        }
      })
    }
    
    // Example 5: Save email to database (your implementation)
    console.log('💾 Saving email to database')
    // await saveEmailToDatabase({
    //   id: email.id,
    //   subject: email.subject,
    //   from: sender.address,
    //   content: emailText,
    //   receivedAt: email.receivedAt,
    //   endpointName: endpoint.name
    // })
    
    // Example 6: Send notification (your implementation)
    console.log('🔔 Sending notification')
    // await sendSlackNotification(`New email from ${sender.address}: ${email.subject}`)
    
    // ===== END BUSINESS LOGIC =====
    
    console.log('✅ Webhook processed successfully')
    
    // Return success response
    return NextResponse.json({ 
      success: true, 
      emailId: email.id,
      processed: true 
    })
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error)
    
    // Return error response
    return NextResponse.json(
      { 
        success: false, 
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    )
  }
}

// Optional: Handle other HTTP methods
export async function GET() {
  return NextResponse.json({ 
    message: 'Inbound Email webhook endpoint is ready',
    timestamp: new Date().toISOString()
  })
}

// Helper function for business hours check
function isWithinBusinessHours(date: Date): boolean {
  const hour = date.getHours()
  const day = date.getDay() // 0 = Sunday, 6 = Saturday
  
  // Monday to Friday, 9 AM to 5 PM
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17
}

/*
🔥 STREAMLINED REPLY EXAMPLES:

// Method 1: Configure default reply address (recommended)
const inbound = new Inbound({
  apiKey: 'your-key',
  defaultReplyFrom: 'support@yourdomain.com'
})

// Super simple replies
await inbound.reply(email, "Thanks!")
await inbound.reply(email, "Got your message, we'll respond soon.")

// Method 2: Override from address when needed
await inbound.reply(email, {
  from: 'billing@yourdomain.com',
  text: "Thanks for your billing inquiry."
})

// Method 3: Full control
await inbound.reply(email, {
  from: 'sales@yourdomain.com',
  subject: 'Custom subject',
  html: '<p>HTML content</p>',
  text: 'Text content',
  cc: ['manager@yourdomain.com'],
  attachments: [{ ... }]
})

// Method 4: Reply by email ID (if you don't have the email object)
await inbound.reply('email-id', {
  from: 'support@yourdomain.com',
  text: "Thanks!"
})

// Example helper functions you might implement:

async function saveEmailToDatabase(emailData: {
  id: string
  subject: string | null
  from: string | null
  content: string
  receivedAt: Date | string
  endpointName: string
}) {
  // Save to your database
  await db.emails.create({
    data: emailData
  })
}

async function sendSlackNotification(message: string) {
  // Send notification to Slack
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  })
}
*/
/**
 * Simple webhook handler example for Inbound Email
 * Copy and paste this into your Next.js app/api/webhook/inbound/route.ts file
 */

import { NextRequest, NextResponse } from 'next/server'
import type { 
  InboundWebhookPayload, 
  isInboundWebhook,
  getSenderInfo,
  getEmailText 
} from '@inboundemail/sdk'

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
    
    // ===== YOUR BUSINESS LOGIC HERE =====
    
    // Example 1: Auto-reply to support emails
    if (email.subject?.toLowerCase().includes('support')) {
      console.log('🤖 Detected support email - sending auto-reply')
      // await sendAutoReply(sender.address, email.subject)
    }
    
    // Example 2: Process different email types
    if (email.subject?.toLowerCase().includes('order')) {
      console.log('📦 Processing order email')
      // await processOrderEmail(email)
    } else if (email.subject?.toLowerCase().includes('invoice')) {
      console.log('💰 Processing invoice email')
      // await processInvoiceEmail(email)
    }
    
    // Example 3: Save to database
    console.log('💾 Saving email to database')
    // await saveEmailToDatabase({
    //   id: email.id,
    //   subject: email.subject,
    //   from: sender.address,
    //   content: emailText,
    //   receivedAt: email.receivedAt,
    //   endpointName: endpoint.name
    // })
    
    // Example 4: Send notification
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

// Optional: Verify webhook signature for security
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  // Implementation depends on your webhook signature method
  // This is just a placeholder - implement based on Inbound's webhook signature format
  return true
}

/*
// Example helper functions you might implement:

async function sendAutoReply(to: string, originalSubject: string) {
  // Use the Inbound SDK to send a reply
  const inbound = new Inbound(process.env.INBOUND_API_KEY!)
  
  await inbound.emails.send({
    from: 'support@yourdomain.com',
    to: to,
    subject: `Re: ${originalSubject}`,
    text: 'Thank you for contacting us! We will get back to you soon.',
    html: '<p>Thank you for contacting us! We will get back to you soon.</p>'
  })
}

async function processOrderEmail(email: InboundWebhookEmail) {
  // Extract order information from email
  const orderNumber = extractOrderNumber(getEmailText(email))
  
  // Update order status in your database
  await updateOrderStatus(orderNumber, 'email_received')
}

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
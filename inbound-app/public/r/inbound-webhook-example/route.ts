import { NextRequest, NextResponse } from 'next/server'
import { isInboundWebhook } from '@inboundemail/sdk'
import type { InboundWebhookPayload, InboundWebhookEmail } from '@inboundemail/sdk'

// Example: Process different types of emails
async function processEmail(email: InboundWebhookEmail) {
  const senderInfo = email.from?.addresses[0]
  const senderEmail = senderInfo?.address
  const senderName = senderInfo?.name
  const subject = email.subject
  const textContent = email.cleanedContent.text
  const htmlContent = email.cleanedContent.html
  
  console.log('📧 Processing email:', {
    from: `${senderName || 'Unknown'} <${senderEmail || 'unknown@example.com'}>`,
    subject: subject || 'No subject',
    recipient: email.recipient,
    hasText: email.cleanedContent.hasText,
    hasHtml: email.cleanedContent.hasHtml,
    attachments: email.cleanedContent.attachments.length
  })

  // Example: Handle different email types based on recipient or subject
  const recipient = email.recipient.toLowerCase()
  
  if (recipient.includes('support')) {
    return await handleSupportEmail(email)
  } else if (recipient.includes('sales')) {
    return await handleSalesEmail(email)
  } else if (subject?.toLowerCase().includes('unsubscribe')) {
    return await handleUnsubscribeEmail(email)
  } else {
    return await handleGeneralEmail(email)
  }
}

// Example: Handle support emails
async function handleSupportEmail(email: InboundWebhookEmail) {
  console.log('🎧 Processing support email')
  
  // Example: Create a support ticket
  const ticket = {
    id: `ticket-${Date.now()}`,
    from: email.from?.addresses[0]?.address || 'unknown',
    subject: email.subject || 'No subject',
    content: email.cleanedContent.text || email.cleanedContent.html || '',
    attachments: email.cleanedContent.attachments.length,
    priority: email.subject?.toLowerCase().includes('urgent') ? 'high' : 'normal',
    createdAt: new Date().toISOString()
  }
  
  // TODO: Save to your database
  console.log('🎟️ Created support ticket:', ticket)
  
  return { type: 'support', ticketId: ticket.id }
}

// Example: Handle sales emails
async function handleSalesEmail(email: InboundWebhookEmail) {
  console.log('💼 Processing sales email')
  
  // Example: Create a lead
  const lead = {
    id: `lead-${Date.now()}`,
    email: email.from?.addresses[0]?.address || 'unknown',
    name: email.from?.addresses[0]?.name || 'Unknown',
    subject: email.subject || 'No subject',
    message: email.cleanedContent.text || email.cleanedContent.html || '',
    source: 'email',
    createdAt: new Date().toISOString()
  }
  
  // TODO: Save to your CRM
  console.log('🎯 Created sales lead:', lead)
  
  return { type: 'sales', leadId: lead.id }
}

// Example: Handle unsubscribe emails
async function handleUnsubscribeEmail(email: InboundWebhookEmail) {
  console.log('🚫 Processing unsubscribe email')
  
  const emailAddress = email.from?.addresses[0]?.address
  if (emailAddress) {
    // TODO: Add to unsubscribe list
    console.log('📝 Added to unsubscribe list:', emailAddress)
    return { type: 'unsubscribe', email: emailAddress }
  }
  
  return { type: 'unsubscribe', error: 'No email address found' }
}

// Example: Handle general emails
async function handleGeneralEmail(email: InboundWebhookEmail) {
  console.log('📬 Processing general email')
  
  // Example: Log the email for general processing
  const emailLog = {
    id: email.id,
    messageId: email.messageId,
    from: email.from?.addresses[0]?.address,
    to: email.recipient,
    subject: email.subject,
    receivedAt: email.receivedAt,
    hasAttachments: email.cleanedContent.attachments.length > 0
  }
  
  // TODO: Save to your email log
  console.log('📋 Logged general email:', emailLog)
  
  return { type: 'general', emailId: email.id }
}

export async function POST(request: NextRequest) {
  console.log('🔔 Webhook received')
  
  try {
    // Parse the webhook payload
    const payload: InboundWebhookPayload = await request.json()
    
    // Validate the webhook payload using the SDK type guard
    if (!isInboundWebhook(payload)) {
      console.error('❌ Invalid webhook payload')
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      )
    }
    
    console.log('✅ Valid webhook payload received:', {
      event: payload.event,
      timestamp: payload.timestamp,
      emailId: payload.email.id,
      endpointId: payload.endpoint.id,
      endpointName: payload.endpoint.name
    })
    
    // Process the email
    const result = await processEmail(payload.email)
    
    console.log('✅ Email processed successfully:', result)
    
    // Return success response
    return NextResponse.json({ 
      success: true,
      processed: result,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error)
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// Optional: Handle GET requests for webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const challenge = searchParams.get('challenge')
  
  if (challenge) {
    // Some webhook services use challenge verification
    return NextResponse.json({ challenge })
  }
  
  return NextResponse.json({ 
    status: 'Webhook endpoint is active',
    timestamp: new Date().toISOString()
  })
}

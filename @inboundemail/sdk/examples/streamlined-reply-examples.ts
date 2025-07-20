/**
 * Examples of using the streamlined reply function
 */

import { Inbound, type InboundWebhookPayload, isInboundWebhook } from '@inboundemail/sdk'
import { NextRequest, NextResponse } from 'next/server'

// ===== Method 1: Configure default reply address (Recommended) =====

const inbound = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
  defaultReplyFrom: 'support@yourdomain.com' // Set default reply address
})

export async function POST(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  
  // ✨ Super simple replies with default from address
  if (email.subject?.toLowerCase().includes('thanks')) {
    await inbound.reply(email, "You're welcome! Let us know if you need anything else.")
  }
  
  if (email.subject?.toLowerCase().includes('support')) {
    await inbound.reply(email, "Thanks for contacting support! We'll get back to you within 24 hours.")
  }
  
  if (email.subject?.toLowerCase().includes('billing')) {
    await inbound.reply(email, {
      text: "Thanks for your billing inquiry. Our finance team will review and respond soon.",
      cc: ['finance@yourdomain.com']
    })
  }
  
  return NextResponse.json({ success: true })
}

// ===== Method 2: Explicit from address every time =====

const inboundSimple = new Inbound(process.env.INBOUND_API_KEY!)

export async function handleWebhookExplicit(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  
  // Always specify from address
  await inbound.reply(email, {
    from: 'support@yourdomain.com',
    text: "Thanks for your message!"
  })
  
  return NextResponse.json({ success: true })
}

// ===== Method 3: Advanced reply scenarios =====

export async function handleAdvancedReplies(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  
  // Auto-reply based on subject
  if (email.subject?.toLowerCase().includes('order')) {
    await inbound.reply(email, {
      from: 'orders@yourdomain.com',
      subject: 'Order Confirmation Received',
      html: `
        <h2>Order Confirmation</h2>
        <p>We've received your order inquiry and will process it shortly.</p>
        <p>Order details will be sent to you within 1 business day.</p>
        <p>Best regards,<br>The Orders Team</p>
      `,
      text: `Order Confirmation\n\nWe've received your order inquiry and will process it shortly.\n\nOrder details will be sent to you within 1 business day.\n\nBest regards,\nThe Orders Team`,
      headers: {
        'X-Priority': 'High'
      }
    })
  }
  
  // Reply with attachment
  if (email.subject?.toLowerCase().includes('invoice')) {
    const pdfContent = await generateInvoicePDF(email)
    
    await inbound.reply(email, {
      from: 'billing@yourdomain.com',
      text: 'Please find your invoice attached.',
      attachments: [{
        filename: 'invoice.pdf',
        content: pdfContent, // Base64 encoded PDF
        content_type: 'application/pdf'
      }]
    })
  }
  
  // Reply to multiple recipients
  if (email.subject?.toLowerCase().includes('urgent')) {
    await inbound.reply(email, {
      from: 'support@yourdomain.com',
      text: 'We have received your urgent request and escalated it to our priority queue.',
      cc: ['manager@yourdomain.com', 'urgent@yourdomain.com'],
      headers: {
        'X-Priority': 'High',
        'X-Urgent': 'true'
      }
    })
  }
  
  return NextResponse.json({ success: true })
}

// ===== Method 4: Different reply addresses based on content =====

const inboundMultiDomain = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
  defaultReplyFrom: 'info@yourdomain.com' // Default fallback
})

export async function handleMultiDomainReplies(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  const subject = email.subject?.toLowerCase() || ''
  
  // Route replies to different departments
  if (subject.includes('support') || subject.includes('help')) {
    await inboundMultiDomain.reply(email, {
      from: 'support@yourdomain.com',
      text: "Thanks for contacting support! We'll help you resolve this issue."
    })
  } else if (subject.includes('sales') || subject.includes('pricing')) {
    await inboundMultiDomain.reply(email, {
      from: 'sales@yourdomain.com',
      text: "Thanks for your interest! Our sales team will be in touch soon."
    })
  } else if (subject.includes('billing') || subject.includes('invoice')) {
    await inboundMultiDomain.reply(email, {
      from: 'billing@yourdomain.com',
      text: "Thanks for your billing inquiry. Our finance team will review this."
    })
  } else {
    // Use default from address for general inquiries
    await inboundMultiDomain.reply(email, "Thanks for your message! We'll get back to you soon.")
  }
  
  return NextResponse.json({ success: true })
}

// ===== Method 5: Error handling =====

export async function handleRepliesWithErrorHandling(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  
  try {
    // Try to reply
    await inbound.reply(email, "Thanks for your message!")
    console.log(`✅ Reply sent for email: ${email.subject}`)
  } catch (error) {
    console.error(`❌ Failed to reply to email ${email.id}:`, error)
    
    // Could implement fallback logic here
    // e.g., save to database for manual reply later
    await logFailedReply(email.id, error)
  }
  
  return NextResponse.json({ success: true })
}

// ===== Method 6: Conditional auto-replies =====

export async function handleConditionalReplies(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  
  // Check business hours
  const now = new Date()
  const isBusinessHours = isWithinBusinessHours(now)
  
  if (!isBusinessHours) {
    await inbound.reply(email, {
      text: `Thanks for your message! We're currently outside business hours (9 AM - 5 PM EST). We'll respond during our next business day.`,
      headers: {
        'X-Auto-Reply': 'out-of-hours'
      }
    })
  } else {
    // During business hours, send different message
    await inbound.reply(email, "Thanks for your message! We'll respond within 2 hours during business hours.")
  }
  
  return NextResponse.json({ success: true })
}

// ===== Helper functions =====

async function generateInvoicePDF(email: any): Promise<string> {
  // Generate PDF and return base64 content
  // This is a placeholder - implement based on your needs
  return Buffer.from('PDF content here').toString('base64')
}

async function logFailedReply(emailId: string, error: any) {
  // Log failed reply for manual processing
  console.error(`Failed reply for ${emailId}:`, error)
  // Could save to database, send to monitoring service, etc.
}

function isWithinBusinessHours(date: Date): boolean {
  const hour = date.getHours()
  const day = date.getDay() // 0 = Sunday, 6 = Saturday
  
  // Monday to Friday, 9 AM to 5 PM
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17
}

// ===== Real-world example: Customer support system =====

export async function customerSupportWebhook(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email, endpoint } = payload
  
  // Different handling based on endpoint
  switch (endpoint.name) {
    case 'Support Tickets':
      // Create support ticket and send confirmation
      const ticketId = await createSupportTicket(email)
      await inbound.reply(email, {
        subject: `Support Ticket Created - #${ticketId}`,
        html: `
          <h2>Support Ticket Created</h2>
          <p>Thanks for contacting us! We've created ticket <strong>#${ticketId}</strong> for your inquiry.</p>
          <p>We'll respond within 24 hours during business days.</p>
          <p>You can track your ticket status at: https://support.yourdomain.com/tickets/${ticketId}</p>
        `,
        text: `Support Ticket Created - #${ticketId}\n\nThanks for contacting us! We've created ticket #${ticketId} for your inquiry.\n\nWe'll respond within 24 hours during business days.\n\nYou can track your ticket status at: https://support.yourdomain.com/tickets/${ticketId}`
      })
      break
      
    case 'Sales Inquiries':
      await inbound.reply(email, {
        from: 'sales@yourdomain.com',
        text: "Thanks for your interest in our products! A sales representative will contact you within 4 business hours."
      })
      // Notify sales team
      await notifySalesTeam(email)
      break
      
    case 'General Contact':
      await inbound.reply(email, "Thanks for reaching out! We'll get back to you soon.")
      break
  }
  
  return NextResponse.json({ success: true })
}

async function createSupportTicket(email: any): Promise<string> {
  // Create ticket in your system and return ticket ID
  return `TK${Date.now()}`
}

async function notifySalesTeam(email: any) {
  // Send notification to sales team
  console.log('Notifying sales team about new inquiry')
}
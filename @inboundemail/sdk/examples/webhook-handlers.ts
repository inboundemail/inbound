/**
 * Examples of using Inbound webhook types in different server frameworks
 */

import type { 
  InboundWebhookPayload, 
  InboundWebhookEmail,
  InboundWebhookHeaders,
  isInboundWebhook,
  getSenderInfo,
  getEmailText,
  getEmailHtml,
  getAttachmentInfo
} from '@inboundemail/sdk'

// ===== Next.js App Router Example =====
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Parse the webhook payload with type safety
    const payload: InboundWebhookPayload = await request.json()
    
    // Verify it's a valid Inbound webhook
    if (!isInboundWebhook(payload)) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }
    
    // Access webhook data with full type safety
    const { email, endpoint, timestamp } = payload
    
    console.log(`📧 Received email: ${email.subject}`)
    console.log(`🔗 Via endpoint: ${endpoint.name} (${endpoint.id})`)
    console.log(`⏰ At: ${timestamp}`)
    
    // Get sender info with helper function
    const sender = getSenderInfo(email)
    console.log(`👤 From: ${sender.name} <${sender.address}>`)
    
    // Process email content
    const textContent = getEmailText(email)
    const htmlContent = getEmailHtml(email)
    
    // Process attachments
    email.cleanedContent.attachments.forEach((attachment, index) => {
      const attachmentInfo = getAttachmentInfo(attachment)
      console.log(`📎 Attachment ${index + 1}: ${attachment.filename} (${attachmentInfo.isImage ? 'Image' : attachmentInfo.isDocument ? 'Document' : 'Other'})`)
    })
    
    // Your business logic here
    await processIncomingEmail(email)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// ===== Next.js Pages Router Example =====
import type { NextApiRequest, NextApiResponse } from 'next'

interface TypedNextApiRequest extends NextApiRequest {
  body: InboundWebhookPayload
}

export default async function handler(
  req: TypedNextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = req.body
    
    if (!isInboundWebhook(payload)) {
      return res.status(400).json({ error: 'Invalid webhook payload' })
    }

    // Process the email with type safety
    const { email } = payload
    
    // Example: Auto-reply to emails containing "support"
    if (email.subject?.toLowerCase().includes('support')) {
      await sendAutoReply(email)
    }
    
    // Example: Save email to database
    await saveEmailToDatabase(email)
    
    res.status(200).json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
}

// ===== Express.js Example =====
import express from 'express'

const app = express()
app.use(express.json())

app.post('/webhook/inbound', (req: express.Request, res: express.Response) => {
  try {
    // Type the request body
    const payload = req.body as InboundWebhookPayload
    
    if (!isInboundWebhook(payload)) {
      return res.status(400).json({ error: 'Invalid webhook payload' })
    }
    
    const { email, endpoint } = payload
    
    // Access typed email data
    console.log(`New email from ${getSenderInfo(email).address}`)
    console.log(`Subject: ${email.subject}`)
    console.log(`Content: ${getEmailText(email).substring(0, 100)}...`)
    
    // Process based on endpoint
    switch (endpoint.name) {
      case 'Support Emails':
        processSupportEmail(email)
        break
      case 'Sales Inquiries':
        processSalesEmail(email)
        break
      default:
        processGeneralEmail(email)
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// ===== Fastify Example =====
import fastify from 'fastify'

const server = fastify()

interface InboundWebhookRequest {
  Body: InboundWebhookPayload
  Headers: InboundWebhookHeaders
}

server.post<InboundWebhookRequest>('/webhook/inbound', async (request, reply) => {
  try {
    const payload = request.body
    
    if (!isInboundWebhook(payload)) {
      return reply.status(400).send({ error: 'Invalid webhook payload' })
    }
    
    // Access headers with type safety
    const webhookHeaders = request.headers as InboundWebhookHeaders
    console.log(`Webhook from endpoint: ${webhookHeaders['x-endpoint-id']}`)
    console.log(`Email ID: ${webhookHeaders['x-email-id']}`)
    
    // Process email
    await processEmailWithFastify(payload.email)
    
    return { success: true }
  } catch (error) {
    console.error('Webhook error:', error)
    return reply.status(500).send({ error: 'Webhook processing failed' })
  }
})

// ===== Hono Example (for Cloudflare Workers, Bun, etc.) =====
import { Hono } from 'hono'

const app = new Hono()

app.post('/webhook/inbound', async (c) => {
  try {
    const payload: InboundWebhookPayload = await c.req.json()
    
    if (!isInboundWebhook(payload)) {
      return c.json({ error: 'Invalid webhook payload' }, 400)
    }
    
    const { email } = payload
    
    // Example: Process different email types
    if (email.subject?.includes('order')) {
      await processOrderEmail(email)
    } else if (email.subject?.includes('invoice')) {
      await processInvoiceEmail(email)
    } else {
      await processGeneralEmail(email)
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

// ===== Webhook Signature Verification Example =====
import crypto from 'crypto'

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

// Enhanced webhook handler with signature verification
export async function secureWebhookHandler(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-webhook-signature') || ''
    const secret = process.env.INBOUND_WEBHOOK_SECRET || ''
    
    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    
    const payload: InboundWebhookPayload = JSON.parse(rawBody)
    
    if (!isInboundWebhook(payload)) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }
    
    // Process verified webhook
    await processVerifiedWebhook(payload)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Secure webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// ===== Helper Functions (implement these based on your needs) =====

async function processIncomingEmail(email: InboundWebhookEmail) {
  // Your email processing logic here
  console.log(`Processing email: ${email.subject}`)
}

async function sendAutoReply(email: InboundWebhookEmail) {
  // Auto-reply logic
  const sender = getSenderInfo(email)
  console.log(`Sending auto-reply to: ${sender.address}`)
}

async function saveEmailToDatabase(email: InboundWebhookEmail) {
  // Database save logic
  console.log(`Saving email ${email.id} to database`)
}

async function processSupportEmail(email: InboundWebhookEmail) {
  // Support email processing
  console.log(`Processing support email: ${email.subject}`)
}

async function processSalesEmail(email: InboundWebhookEmail) {
  // Sales email processing
  console.log(`Processing sales email: ${email.subject}`)
}

async function processGeneralEmail(email: InboundWebhookEmail) {
  // General email processing
  console.log(`Processing general email: ${email.subject}`)
}

async function processEmailWithFastify(email: InboundWebhookEmail) {
  // Fastify-specific processing
  console.log(`Fastify processing: ${email.subject}`)
}

async function processOrderEmail(email: InboundWebhookEmail) {
  // Order email processing
  console.log(`Processing order email: ${email.subject}`)
}

async function processInvoiceEmail(email: InboundWebhookEmail) {
  // Invoice email processing
  console.log(`Processing invoice email: ${email.subject}`)
}

async function processVerifiedWebhook(payload: InboundWebhookPayload) {
  // Process verified webhook
  console.log(`Processing verified webhook for email: ${payload.email.subject}`)
}

export {
  // Export types for use in other files
  type InboundWebhookPayload,
  type InboundWebhookEmail,
  type InboundWebhookHeaders,
  isInboundWebhook,
  getSenderInfo,
  getEmailText,
  getEmailHtml,
  getAttachmentInfo
}
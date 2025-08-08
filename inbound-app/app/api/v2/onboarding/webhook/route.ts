import { NextRequest, NextResponse } from 'next/server'
import { Inbound, isInboundWebhook } from '@inboundemail/sdk'
import type { InboundWebhookPayload } from '@inboundemail/sdk'
import { db } from '@/lib/db'
import { onboardingDemoEmails } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  console.log('📧 POST /api/v2/onboarding/webhook - Received webhook')
  
  try {
    const payload: InboundWebhookPayload = await request.json()
    
    // Validate webhook payload
    if (!isInboundWebhook(payload)) {
      console.log('❌ Invalid webhook payload')
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      )
    }
    
    const { email } = payload
    console.log(`📨 New email from: ${email.from?.text}`)
    console.log(`📝 Subject: ${email.subject}`)
    console.log(`📄 Body: ${email.cleanedContent.text?.substring(0, 100)}...`)

    // Check if this is a reply to a demo email
    const fromEmail = email.from?.addresses[0]?.address || email.from?.text
    if (!fromEmail) {
      console.log('⚠️ No from email found, skipping demo check')
      return NextResponse.json({ success: true })
    }

    console.log('🔍 Checking for demo email reply match...')
    console.log('📧 Reply headers:', {
      inReplyTo: email.parsedData?.inReplyTo,
      references: email.parsedData?.references,
      fromEmail
    })

    // Helper function to extract messageId from email header format
    const extractMessageId = (headerValue: string): string => {
      // Remove angle brackets and extract just the messageId part before @
      // Example: "<010f01988ac2c958-25262f92-271c-4f99-9fad-a483f03511d6-000000@us-east-2.amazonses.com>" 
      // becomes: "010f01988ac2c958-25262f92-271c-4f99-9fad-a483f03511d6-000000"
      return headerValue.replace(/[<>]/g, '').split('@')[0]
    }

    // Look for matching demo email using proper reply headers first
    let demoEmail: any[] = []
    
    // Method 1: Match by In-Reply-To header (most reliable)
    if (email.parsedData?.inReplyTo) {
      console.log('🎯 Trying to match by In-Reply-To:', email.parsedData.inReplyTo)
      const extractedMessageId = extractMessageId(email.parsedData.inReplyTo)
      console.log('🔍 Extracted messageId:', extractedMessageId)
      
      demoEmail = await db
        .select()
        .from(onboardingDemoEmails)
        .where(
          and(
            eq(onboardingDemoEmails.messageId, extractedMessageId),
            eq(onboardingDemoEmails.replyReceived, false)
          )
        )
        .limit(1)
    }
    
    // Method 2: Match by References header if In-Reply-To didn't work
    if (demoEmail.length === 0 && email.parsedData?.references?.length) {
      console.log('🎯 Trying to match by References:', email.parsedData.references)
      for (const ref of email.parsedData.references) {
        const extractedMessageId = extractMessageId(ref)
        console.log('🔍 Checking reference messageId:', extractedMessageId)
        
        demoEmail = await db
          .select()
          .from(onboardingDemoEmails)
          .where(
            and(
              eq(onboardingDemoEmails.messageId, extractedMessageId),
              eq(onboardingDemoEmails.replyReceived, false)
            )
          )
          .limit(1)
        
        if (demoEmail.length > 0) {
          console.log('✅ Found match in references:', ref, '→', extractedMessageId)
          break
        }
      }
    }
    
    // Method 3: Fallback to sender email matching (less secure but better than nothing)
    if (demoEmail.length === 0) {
      console.log('🔄 Falling back to sender email matching:', fromEmail)
      demoEmail = await db
        .select()
        .from(onboardingDemoEmails)
        .where(
          and(
            eq(onboardingDemoEmails.recipientEmail, fromEmail),
            eq(onboardingDemoEmails.replyReceived, false)
          )
        )
        .limit(1)
    }

    if (demoEmail.length > 0) {
      const demo = demoEmail[0]
      console.log(`🎯 Found matching demo email for user ${demo.userId}`)
      
      // Update the demo email with reply information
      await db
        .update(onboardingDemoEmails)
        .set({
          replyReceived: true,
          replyFrom: fromEmail,
          replySubject: email.subject || '',
          replyBody: email.cleanedContent.text || email.cleanedContent.html || '',
          replyReceivedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(onboardingDemoEmails.id, demo.id))

      console.log(`✅ Updated demo email ${demo.id} with reply information`)
    } else {
      console.log('ℹ️ No matching demo email found for this reply')
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ Webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
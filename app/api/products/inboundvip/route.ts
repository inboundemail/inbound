import { NextRequest, NextResponse } from 'next/server'
import { Inbound, isInboundWebhook } from '@inboundemail/sdk'
import type { InboundWebhookPayload } from '@inboundemail/sdk'
import { db } from '@/lib/db'
import { emailAddresses, vipConfigs, vipAllowedSenders, vipPaymentSessions, vipEmailAttempts, userAccounts, structuredEmails } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import Stripe from 'stripe'
import { generateVipPaymentRequestEmail } from '@/emails/vip-payment-request-preview'

const inbound = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
  defaultReplyFrom: 'noreply@inbound.new'
})

// Default Stripe instance for Inbound
const defaultStripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: NextRequest) {
  try {
    const payload: InboundWebhookPayload = await request.json()
    
    // Validate webhook payload
    if (!isInboundWebhook(payload)) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      )
    }
    
    const { email } = payload
    
    // Extract recipient email address
    const recipientEmail = email.to?.addresses?.[0]?.address
    if (!recipientEmail) {
      console.error('No recipient email found')
      return NextResponse.json({ success: true })
    }

    // Check if this email address has VIP enabled
    const emailAddressRecord = await db
      .select()
      .from(emailAddresses)
      .where(eq(emailAddresses.address, recipientEmail))
      .limit(1)

    if (!emailAddressRecord[0]?.isVipEnabled || !emailAddressRecord[0]?.vipConfigId) {
      // Not a VIP email, process normally
      console.log('Email is not VIP-enabled, processing normally')
      return NextResponse.json({ success: true })
    }

    // Get VIP config
    const vipConfig = await db
      .select()
      .from(vipConfigs)
      .where(eq(vipConfigs.id, emailAddressRecord[0].vipConfigId))
      .limit(1)

    if (!vipConfig[0] || !vipConfig[0].isActive) {
      console.log('VIP config not found or inactive')
      return NextResponse.json({ success: true })
    }

    // Extract sender email
    const senderEmail = email.from?.addresses?.[0]?.address
    if (!senderEmail) {
      console.error('No sender email found')
      return NextResponse.json({ success: true })
    }

    // Check if sender is already allowed
    const allowedSender = await db
      .select()
      .from(vipAllowedSenders)
      .where(
        and(
          eq(vipAllowedSenders.vipConfigId, vipConfig[0].id),
          eq(vipAllowedSenders.senderEmail, senderEmail)
        )
      )
      .limit(1)

    if (allowedSender[0]) {
      // Check if still valid (not expired)
      if (!allowedSender[0].allowedUntil || new Date(allowedSender[0].allowedUntil) > new Date()) {
        console.log('Sender is allowed, delivering email')
        
        // Log the allowed attempt
        await db.insert(vipEmailAttempts).values({
          id: nanoid(),
          vipConfigId: vipConfig[0].id,
          senderEmail,
          recipientEmail,
          originalEmailId: email.id,
          emailSubject: email.subject,
          status: 'allowed',
          allowedReason: 'previous_payment',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        
        return NextResponse.json({ success: true })
      }
    }

    // Get user's account-level Stripe key
    const userAccount = await db
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.userId, vipConfig[0].userId))
      .limit(1)

    // Determine which Stripe instance to use
    const stripe = userAccount[0]?.stripeRestrictedKey 
      ? new Stripe(userAccount[0].stripeRestrictedKey)
      : defaultStripe

    // Sender not allowed, create payment session
    const sessionId = nanoid()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + (vipConfig[0].paymentLinkExpirationHours || 24))

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Email delivery to ${recipientEmail}`,
            description: vipConfig[0].customMessage || 
              `Pay to deliver your email to ${recipientEmail}. ${
                vipConfig[0].allowAfterPayment 
                  ? 'After payment, all your future emails will be delivered automatically.' 
                  : 'This payment covers delivery of your current email only.'
              }`
          },
          unit_amount: vipConfig[0].priceInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: {
        sessionId,
        vipConfigId: vipConfig[0].id,
        senderEmail,
        recipientEmail,
        emailId: email.id,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/products/inboundvip/success?session_id=${sessionId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/products/inboundvip/cancelled`,
      expires_at: Math.floor(expiresAt.getTime() / 1000), // Convert to Unix timestamp
    })

    // Store payment session
    await db.insert(vipPaymentSessions).values({
      id: sessionId,
      vipConfigId: vipConfig[0].id,
      senderEmail,
      originalEmailId: email.id,
      stripePaymentLinkId: checkoutSession.id,
      stripePaymentLinkUrl: checkoutSession.url,
      stripeSessionId: checkoutSession.id,
      status: 'pending',
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Log the payment required attempt
    await db.insert(vipEmailAttempts).values({
      id: nanoid(),
      vipConfigId: vipConfig[0].id,
      senderEmail,
      recipientEmail,
      originalEmailId: email.id,
      emailSubject: email.subject,
      status: 'payment_required',
      paymentSessionId: sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Send payment request email
    const recipientName = email.to?.addresses?.[0]?.name || recipientEmail.split('@')[0]
    const senderName = email.from?.addresses?.[0]?.name || senderEmail
    
    const emailHtml = await generateVipPaymentRequestEmail({
      senderName,
      senderEmail,
      recipientName,
      recipientEmail,
      emailSubject: email.subject || 'No subject',
      priceInCents: vipConfig[0].priceInCents,
      customMessage: vipConfig[0].customMessage || undefined,
      paymentUrl: checkoutSession.url!,
      allowAfterPayment: vipConfig[0].allowAfterPayment || false,
      expirationHours: vipConfig[0].paymentLinkExpirationHours || 24,
    })
    
    await inbound.reply(email, {
      from: 'payments@inbound.new',
      subject: `Payment Required: ${email.subject}`,
      html: emailHtml,
      text: `Payment Required to Deliver Your Email

Hi ${senderName},

You're trying to reach ${recipientName} at ${recipientEmail}, but they require a payment of $${(vipConfig[0].priceInCents / 100).toFixed(2)} to receive emails from new senders.

${vipConfig[0].customMessage || ''}

Your email subject: ${email.subject}

Pay here: ${checkoutSession.url}

${vipConfig[0].allowAfterPayment 
  ? 'After payment, all your future emails to this address will be delivered automatically.' 
  : 'This payment covers delivery of your current email only.'}

This payment link expires in ${vipConfig[0].paymentLinkExpirationHours} hours.`
    })

    console.log(`VIP payment request sent to ${senderEmail} for ${recipientEmail}`)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
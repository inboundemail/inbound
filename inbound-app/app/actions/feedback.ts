'use server'

import { auth } from '@/lib/auth/auth'
import { headers } from 'next/headers'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import FeedbackEmail from '@/emails/feedback'
import { Inbound } from '@inboundemail/sdk'

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY)
const inbound = new Inbound(process.env.INBOUND_API_KEY!)

export interface FeedbackData {
  feedback: string
}

/**
 * Server action to send feedback email to ryan@inbound.new
 */
export async function sendFeedbackAction(
  data: FeedbackData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Authentication required'
      }
    }

    // Validate required environment variable
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ sendFeedbackAction - RESEND_API_KEY not configured')
      return {
        success: false,
        error: 'Email service not configured'
      }
    }

    // Validate feedback content
    if (!data.feedback?.trim()) {
      return {
        success: false,
        error: 'Feedback content is required'
      }
    }

    if (data.feedback.length > 5000) {
      return {
        success: false,
        error: 'Feedback is too long (max 5000 characters)'
      }
    }

    console.log(`📧 sendFeedbackAction - Sending feedback from user: ${session.user.email}`)

    // Prepare email template props
    const templateProps = {
      userFirstname: session.user.name?.split(' ')[0] || 'User',
      userEmail: session.user.email,
      feedback: data.feedback.trim(),
      submittedAt: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })
    }

    // Render the email template
    const html = await render(FeedbackEmail(templateProps))

    // Determine the from address
    const fromEmail = 'notifications@inbound.new'
    
    // Format sender with name - Resend accepts "Name <email@domain.com>" format
    const fromWithName = `inbound feedback <${fromEmail}>`

    // Send the email
    const response = await resend.emails.send({
      from: fromWithName,
      to: 'ryan@inbound.new',
      replyTo: session.user.email ? session.user.email : 'ryan@inbound.new', // Allow Ryan to reply directly to the user
      subject: `💬 New Feedback from ${session.user.name || session.user.email} - inbound`,
      html: html,
      tags: [
        { name: 'type', value: 'user-feedback' },
        { name: 'user_id', value: session.user.id }
      ]
    })

    if (response.error) {
      console.error('❌ sendFeedbackAction - Resend API error:', response.error)
      return {
        success: false,
        error: `Email sending failed: ${response.error.message}`
      }
    }

    console.log(`✅ sendFeedbackAction - Feedback email sent successfully from ${session.user.email}`)
    console.log(`   📧 Message ID: ${response.data?.id}`)

    return {
      success: true,
      messageId: response.data?.id
    }

  } catch (error) {
    console.error('❌ sendFeedbackAction - Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
} 
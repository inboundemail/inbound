'use server'

import { Inbound } from '@inboundemail/sdk'

// Initialize Inbound client
const inbound = new Inbound(process.env.INBOUND_API_KEY!)

export interface AmbassadorApplicationData {
  name: string
  email: string
  xHandle: string
  reason: string
}

/**
 * Server action to send ambassador application to ryan@mandarin3d.com
 */
export async function submitAmbassadorApplication(
  data: AmbassadorApplicationData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Validate required environment variable
    if (!process.env.INBOUND_API_KEY) {
      console.error('❌ submitAmbassadorApplication - INBOUND_API_KEY not configured')
      return {
        success: false,
        error: 'Email service not configured'
      }
    }

    // Validate required fields
    if (!data.name?.trim()) {
      return {
        success: false,
        error: 'Name is required'
      }
    }

    if (!data.email?.trim()) {
      return {
        success: false,
        error: 'Email is required'
      }
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email.trim())) {
      return {
        success: false,
        error: 'Please enter a valid email address'
      }
    }

    if (!data.xHandle?.trim()) {
      return {
        success: false,
        error: 'X (Twitter) handle is required'
      }
    }

    if (!data.reason?.trim()) {
      return {
        success: false,
        error: 'Please tell us why you want to be an ambassador'
      }
    }

    // Validate reason length (basic minimum)
    if (data.reason.length < 10) {
      return {
        success: false,
        error: 'Please provide a brief explanation of why you want to be an ambassador'
      }
    }

    if (data.reason.length > 1000) {
      return {
        success: false,
        error: 'Please keep your response under 1000 characters'
      }
    }

    console.log(`📧 submitAmbassadorApplication - New ambassador application from: ${data.email}`)

    // Create plain text email content
    const plainTextContent = `
New Inbound Ambassador Application

Name: ${data.name.trim()}
Email: ${data.email.trim()}
X (Twitter) Handle: ${data.xHandle.trim()}

Why they want to be an ambassador:
${data.reason.trim()}

Submitted: ${new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short'
})}
    `.trim()

    // Send the email using Inbound
    const { data: response, error: errorResponse } = await inbound.emails.send({
      from: 'New Ambassador Application <notifications@inbound.new>',
      to: 'ryan@mandarin3d.com',
      replyTo: data.email.trim(),
      subject: `🎯 New Ambassador Application from ${data.name.trim()} - Inbound`,
      text: plainTextContent,
    })

    if (errorResponse) {
      console.error('❌ submitAmbassadorApplication - Inbound API error:', errorResponse)
      return {
        success: false,
        error: `Email sending failed: ${errorResponse}`
      }
    }

    // Check if the response indicates success
    if (!response?.id) {
      console.error('❌ submitAmbassadorApplication - Inbound API error:', response)
      return {
        success: false,
        error: `Email sending failed: ${response?.id || 'Unknown error'}`
      }
    }

    console.log(`✅ submitAmbassadorApplication - Ambassador application sent successfully from ${data.email}`)
    console.log(`   📧 Message ID: ${response?.id}`)

    return {
      success: true,
      messageId: response.id
    }

  } catch (error) {
    console.error('❌ submitAmbassadorApplication - Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

'use server'

import { Inbound } from '@inboundemail/sdk'
import { getApiKey } from './apiManagement'

// Types based on the SDK documentation
export type EmailListParams = {
  limit?: number
  offset?: number
  search?: string
  status?: 'all' | 'processed' | 'failed'
  domain?: string
  timeRange?: '24h' | '7d' | '30d' | '90d'
  includeArchived?: boolean
}

export type EmailItem = {
  id: string
  emailId: string
  messageId: string | null
  subject: string
  from: string
  fromName: string | null
  recipient: string
  preview: string
  receivedAt: Date
  isRead: boolean
  readAt: Date | null
  isArchived: boolean
  archivedAt: Date | null
  hasAttachments: boolean
  attachmentCount: number
  parseSuccess: boolean | null
  parseError: string | null
  createdAt: Date
}

export type EmailListResponse = {
  emails: EmailItem[]
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore?: boolean
  }
}

export type EmailDetailsResponse = {
  id: string
  emailId: string
  subject: string
  from: string
  to: string
  content: {
    textBody: string
    htmlBody: string
  }
  receivedAt: Date
  attachments?: Array<{
    filename: string
    contentType: string
    size: number
    contentId?: string
  }>
}

export type EmailActionResult = {
  success: boolean
  data?: any
  error?: string
}

// Get emails for a user
export async function getEmails(userId: string, params?: EmailListParams): Promise<EmailActionResult> {
  try {
    // Get the user's API key
    const apiKeyResult = await getApiKey(userId)
    if (!apiKeyResult.success || !apiKeyResult.data) {
      return {
        success: false,
        error: 'API key not found'
      }
    }

    // Initialize the Inbound SDK
    const inbound = new Inbound({ 
      apiKey: apiKeyResult.data.api_key 
    })

    // Fetch emails with the provided parameters
    const emailsResponse = await inbound.mail.list({
      limit: params?.limit || 50,
      offset: params?.offset || 0,
      search: params?.search,
      status: params?.status,
      domain: params?.domain,
      timeRange: params?.timeRange,
      includeArchived: params?.includeArchived || false
    })

    return {
      success: true,
      data: emailsResponse
    }

  } catch (error) {
    console.error('Error fetching emails:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch emails'
    }
  }
}

// Get email details by ID
export async function getEmailDetails(userId: string, emailId: string): Promise<EmailActionResult> {
  try {
    // Get the user's API key
    const apiKeyResult = await getApiKey(userId)
    if (!apiKeyResult.success || !apiKeyResult.data) {
      return {
        success: false,
        error: 'API key not found'
      }
    }

    // Initialize the Inbound SDK
    const inbound = new Inbound({ 
      apiKey: apiKeyResult.data.api_key 
    })

    // Fetch email details
    const emailDetails = await inbound.mail.get(emailId)

    // Debug: Log the actual response structure
    console.log('Email details response:', JSON.stringify(emailDetails, null, 2))

    return {
      success: true,
      data: emailDetails
    }

  } catch (error) {
    console.error('Error fetching email details:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch email details'
    }
  }
}

// Reply to an email
export async function replyToEmail(
  userId: string, 
  emailId: string, 
  replyData: {
    from: string
    to: string
    subject: string
    textBody: string
    htmlBody?: string
    cc?: string[]
    bcc?: string[]
    attachments?: Array<{
      filename: string
      content: string
      content_type?: string
    }>
  }
): Promise<EmailActionResult> {
  try {
    // Get the user's API key
    const apiKeyResult = await getApiKey(userId)
    if (!apiKeyResult.success || !apiKeyResult.data) {
      return {
        success: false,
        error: 'API key not found'
      }
    }

    // Initialize the Inbound SDK
    const inbound = new Inbound({ 
      apiKey: apiKeyResult.data.api_key 
    })

    // Reply to the email
    await inbound.emails.reply(emailId, {
      from: replyData.from, // This should be a verified domain email from the user's domains
      to: [replyData.to],
      cc: replyData.cc,
      bcc: replyData.bcc,
      subject: replyData.subject,
      text: replyData.textBody,
      html: replyData.htmlBody,
      attachments: replyData.attachments,
      include_original: true
    })

    return {
      success: true
    }

  } catch (error) {
    console.error('Error replying to email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reply to email'
    }
  }
}

// Mark email as read (this would need to be implemented based on your backend)
export async function markEmailAsRead(userId: string, emailId: string): Promise<EmailActionResult> {
  try {
    // This is a placeholder - you'd need to implement this based on your backend
    // The SDK doesn't seem to have a direct method for marking emails as read
    // You might need to track this in your own database or use a different approach
    
    return {
      success: true
    }

  } catch (error) {
    console.error('Error marking email as read:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark email as read'
    }
  }
}
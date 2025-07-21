'use server'

import { inboundClient } from '@/lib/inbound-client'
import type { GetMailRequest, EmailItem, GetMailByIdResponse } from '@inboundemail/sdk'

export async function listEmails(params?: GetMailRequest) {
  try {
    const response = await inboundClient.mail.list(params)
    return {
      success: true,
      data: response
    }
  } catch (error) {
    console.error('Error listing emails:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list emails'
    }
  }
}

export async function getEmail(id: string) {
  try {
    const response = await inboundClient.mail.get(id)
    return {
      success: true,
      data: response
    }
  } catch (error) {
    console.error('Error getting email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get email'
    }
  }
}

export async function replyToEmail(
  emailId: string,
  replyData: {
    from?: string
    text?: string
    html?: string
    subject?: string
    to?: string | string[]
  }
) {
  try {
    const response = await inboundClient.emails.reply(emailId, replyData)
    return {
      success: true,
      data: response
    }
  } catch (error) {
    console.error('Error replying to email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reply to email'
    }
  }
} 
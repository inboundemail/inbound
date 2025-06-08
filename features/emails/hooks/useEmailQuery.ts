'use client'

import { useQuery } from '@tanstack/react-query'
import { getEmailDetails } from '@/app/actions/primary'

export interface EmailDetails {
  id: string
  messageId: string
  from: string
  to: string
  recipient: string
  subject: string | null
  receivedAt: Date
  processedAt: Date | null
  status: string
  emailContent: {
    htmlBody: string | null
    textBody: string | null
    attachments: Array<{
      filename: string
      contentType: string
      size: number
    }>
    headers: Record<string, string>
    rawContent: string
  }
  authResults: {
    spf: string
    dkim: string
    dmarc: string
    spam: string
    virus: string
  }
  metadata: {
    processingTime: number | null
    timestamp: Date | null
    receiptTimestamp: Date | null
    actionType: string | null
    s3Info: {
      bucketName: string | null
      objectKey: string | null
      contentFetched: boolean | null
      contentSize: number | null
      error: string | null
    }
    commonHeaders: any
    emailMetadata: any
  }
  createdAt: Date | null
  updatedAt: Date | null
}

export const useEmailQuery = (emailId: string | null) => {
  return useQuery({
    queryKey: ['email', emailId],
    queryFn: async () => {
      if (!emailId) {
        throw new Error('Email ID is required')
      }
      
      const result = await getEmailDetails(emailId)
      
      if (result.error) {
        throw new Error(result.error)
      }
      
      return result.data as EmailDetails
    },
    enabled: !!emailId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on 404 errors
      if (error.message === 'Email not found') {
        return false
      }
      return failureCount < 3
    },
  })
} 
"use client"

import { Button } from '@/components/ui/button'
import { HiDocumentText, HiDownload } from 'react-icons/hi'
import { downloadAttachment } from '@/app/actions/primary'
import { CustomInboundIcon } from '@/components/icons/customInbound'

interface EmailAttachment {
  filename?: string
  contentType?: string
  size?: number
  contentId?: string
  isInline?: boolean
  contentDisposition?: string
}

interface EmailAttachmentsProps {
  emailId: string
  attachments: EmailAttachment[]
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function handleDownloadAttachment(emailId: string, attachmentFilename: string) {
  try {
    const result = await downloadAttachment(emailId, attachmentFilename)
    
    if (!result.success || !result.data) {
      console.error('Failed to download attachment:', result.error)
      
      // Show user-friendly error message
      if (result.error?.includes('content not available')) {
        alert('This attachment cannot be downloaded because the email was processed without full binary data storage. This typically happens with older emails or emails processed during system maintenance.')
      } else {
        alert(`Failed to download attachment: ${result.error}`)
      }
      return
    }

    // Convert base64 to blob
    const binaryString = atob(result.data.content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    const blob = new Blob([bytes], { type: result.data.contentType })
    
    // Create download link
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.data.filename
    link.style.display = 'none'
    
    // Trigger download
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // Clean up
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error downloading attachment:', error)
    alert('An unexpected error occurred while downloading the attachment.')
  }
}

export function EmailAttachments({ emailId, attachments }: EmailAttachmentsProps) {
  if (!attachments || attachments.length === 0) {
    return null
  }

  // Filter out attachments without filenames
  const validAttachments = attachments.filter(attachment => attachment.filename)

  if (validAttachments.length === 0) {
    return null
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h3 className="text-sm font-medium text-gray-900 mb-3">
        {validAttachments.length} Attachment{validAttachments.length > 1 ? 's' : ''}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {validAttachments.map((attachment, index) => (
          <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <CustomInboundIcon
              Icon={HiDocumentText}
              backgroundColor="#6b7280"
              size={32}
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900 truncate">{attachment.filename}</div>
              <div className="text-xs text-gray-500">
                {attachment.contentType || 'Unknown type'} • {formatBytes(attachment.size || 0)}
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-gray-600 hover:bg-gray-100"
              onClick={() => handleDownloadAttachment(emailId, attachment.filename!)}
              disabled={!attachment.filename}
            >
              <HiDownload className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
} 
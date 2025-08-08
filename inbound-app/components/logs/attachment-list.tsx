"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Hashtag2 from '@/components/icons/hashtag-2'
import Download2 from '@/components/icons/download-2'
import { downloadAttachment } from '@/app/actions/primary'

interface Attachment {
  filename?: string
  contentType?: string
  size?: number
  contentId?: string
}

interface AttachmentListProps {
  emailId: string
  attachments: Attachment[]
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

export function AttachmentList({ emailId, attachments }: AttachmentListProps) {
  return (
    <div className="space-y-2">
      {attachments.map((att: Attachment, idx: number) => (
        <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <Hashtag2 width="16" height="16" className="text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">{att.filename}</p>
              <p className="text-xs text-muted-foreground">{att.contentType} • {att.size ? `${Math.round(att.size / 1024)}KB` : 'Unknown size'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {att.contentId && (
              <Badge variant="outline" className="text-xs">Inline</Badge>
            )}
            {att.filename && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => handleDownloadAttachment(emailId, att.filename!)}
                title="Download attachment"
              >
                <Download2 width="14" height="14" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  extractEmailAttachment, 
  extractEmailAttachmentByContentId, 
  getEmailAttachments 
} from '@/app/actions/primary'

interface AttachmentInfo {
  filename: string
  contentType: string
  size: number
  contentId?: string
  contentDisposition?: string
  hasContent: boolean
}

interface ExtractedAttachment {
  filename: string
  contentType: string
  size: number
  content: string // base64 content
  contentId?: string
  contentDisposition?: string
}

export default function AttachmentExtractionExample({ emailId }: { emailId: string }) {
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([])
  const [extractedAttachment, setExtractedAttachment] = useState<ExtractedAttachment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load all attachments for the email
  const loadAttachments = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await getEmailAttachments(emailId)
      
      if (result.error) {
        setError(result.error)
        return
      }
      
      setAttachments(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attachments')
    } finally {
      setLoading(false)
    }
  }

  // Extract specific attachment by filename
  const extractByFilename = async (filename: string) => {
    setLoading(true)
    setError(null)
    setExtractedAttachment(null)
    
    try {
      const result = await extractEmailAttachment(emailId, filename)
      
      if (result.error) {
        setError(result.error)
        return
      }
      
      setExtractedAttachment(result.data || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract attachment')
    } finally {
      setLoading(false)
    }
  }

  // Extract attachment by contentId (useful for inline images)
  const extractByContentId = async (contentId: string) => {
    setLoading(true)
    setError(null)
    setExtractedAttachment(null)
    
    try {
      const result = await extractEmailAttachmentByContentId(emailId, contentId)
      
      if (result.error) {
        setError(result.error)
        return
      }
      
      setExtractedAttachment(result.data || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract attachment by contentId')
    } finally {
      setLoading(false)
    }
  }

  // Download attachment content as file
  const downloadAttachment = (attachment: ExtractedAttachment) => {
    if (!attachment.content) return

    // Convert base64 to blob
    const byteCharacters = atob(attachment.content)
    const byteNumbers = new Array(byteCharacters.length)
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: attachment.contentType })
    
    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.filename || 'attachment'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  // Create data URL for inline display (images, etc.)
  const getDataUrl = (attachment: ExtractedAttachment): string => {
    return `data:${attachment.contentType};base64,${attachment.content}`
  }

  // Check if attachment is an image
  const isImage = (contentType: string): boolean => {
    return contentType.startsWith('image/')
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Attachment Extraction Example</CardTitle>
          <p className="text-sm text-muted-foreground">
            Email ID: {emailId}
          </p>
        </CardHeader>
        <CardContent>
          <Button onClick={loadAttachments} disabled={loading}>
            {loading ? 'Loading...' : 'Load Attachments'}
          </Button>
          
          {error && (
            <div className="mt-4 p-3 border border-red-200 rounded bg-red-50 text-red-700">
              Error: {error}
            </div>
          )}
        </CardContent>
      </Card>

      {attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attachments.map((attachment, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div className="flex-1">
                    <div className="font-medium">{attachment.filename}</div>
                    <div className="text-sm text-muted-foreground">
                      Type: {attachment.contentType} • Size: {attachment.size} bytes
                    </div>
                    {attachment.contentId && (
                      <div className="text-xs text-muted-foreground">
                        Content ID: {attachment.contentId}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={attachment.hasContent ? 'default' : 'secondary'}>
                      {attachment.hasContent ? 'Available' : 'Metadata Only'}
                    </Badge>
                    
                    {attachment.hasContent && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => extractByFilename(attachment.filename)}
                          disabled={loading}
                        >
                          Extract by Filename
                        </Button>
                        
                        {attachment.contentId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => extractByContentId(attachment.contentId!)}
                            disabled={loading}
                          >
                            Extract by Content ID
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {extractedAttachment && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Attachment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Filename:</strong> {extractedAttachment.filename}
              </div>
              <div>
                <strong>Content Type:</strong> {extractedAttachment.contentType}
              </div>
              <div>
                <strong>Size:</strong> {extractedAttachment.size} bytes
              </div>
              {extractedAttachment.contentId && (
                <div>
                  <strong>Content ID:</strong> {extractedAttachment.contentId}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => downloadAttachment(extractedAttachment)}>
                Download File
              </Button>
              
              {isImage(extractedAttachment.contentType) && (
                <Button 
                  variant="outline"
                  onClick={() => window.open(getDataUrl(extractedAttachment), '_blank')}
                >
                  View Image
                </Button>
              )}
            </div>

            {/* Display image inline if it's an image */}
            {isImage(extractedAttachment.contentType) && (
              <div className="mt-4">
                <img 
                  src={getDataUrl(extractedAttachment)} 
                  alt={extractedAttachment.filename}
                  className="max-w-full max-h-96 object-contain border rounded"
                />
              </div>
            )}

            {/* Show content preview for text files */}
            {extractedAttachment.contentType.startsWith('text/') && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">Content Preview:</h4>
                <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-48">
                  {atob(extractedAttachment.content)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
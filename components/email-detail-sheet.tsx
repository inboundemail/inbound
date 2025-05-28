"use client"

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  CopyIcon, 
  CheckIcon, 
  FileIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  ShieldAlertIcon,
  ClockIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

interface EmailDetails {
  id: string
  messageId: string
  from: string
  to: string
  recipient: string
  subject: string
  receivedAt: string
  processedAt: string
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
    processingTime: number
    timestamp: string
    receiptTimestamp: string
    actionType: string
    s3Info: {
      bucketName: string
      objectKey: string
      contentFetched: boolean
      contentSize: number
      error: string | null
    }
    commonHeaders: any
    emailMetadata: any
  }
  createdAt: string
  updatedAt: string
}

interface EmailDetailSheetProps {
  emailId: string | null
  isOpen: boolean
  onClose: () => void
}

export function EmailDetailSheet({ emailId, isOpen, onClose }: EmailDetailSheetProps) {
  const [emailDetails, setEmailDetails] = useState<EmailDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (emailId && isOpen) {
      fetchEmailDetails()
    }
  }, [emailId, isOpen])

  const fetchEmailDetails = async () => {
    if (!emailId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/emails/${emailId}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Email not found')
        }
        throw new Error('Failed to fetch email details')
      }

      const data = await response.json()
      setEmailDetails(data)
    } catch (error) {
      console.error('Error fetching email details:', error)
      setError(error instanceof Error ? error.message : 'Failed to load email details')
      toast.error('Failed to load email details')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedItems(prev => ({ ...prev, [key]: true }))
      toast.success('Copied to clipboard')
      setTimeout(() => {
        setCopiedItems(prev => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      toast.error('Failed to copy to clipboard')
    }
  }

  const getAuthBadge = (result: string, type: string) => {
    const isPass = result === 'PASS'
    const isFail = result === 'FAIL'
    
    if (isPass) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200 transition-colors">
          <ShieldCheckIcon className="h-3 w-3 mr-1" />
          {type.toUpperCase()} Pass
        </Badge>
      )
    } else if (isFail) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-200 transition-colors">
          <ShieldXIcon className="h-3 w-3 mr-1" />
          {type.toUpperCase()} Fail
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
          <ShieldAlertIcon className="h-3 w-3 mr-1" />
          {type.toUpperCase()} {result}
        </Badge>
      )
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-3/4 sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Email Details</SheetTitle>
          <SheetDescription>
            {emailDetails ? `Message ID: ${emailDetails.messageId}` : 'Loading email details...'}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="text-muted-foreground">Loading email details...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchEmailDetails} variant="secondary">
                Try Again
              </Button>
            </div>
          </div>
        )}

        {emailDetails && !isLoading && !error && (
          <div className="mt-6 space-y-6">
            {/* Email Header Info */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">{emailDetails.subject}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">From:</span> {emailDetails.from}
                  </div>
                  <div>
                    <span className="font-medium">To:</span> {emailDetails.to}
                  </div>
                  <div>
                    <span className="font-medium">Recipient:</span> {emailDetails.recipient}
                  </div>
                  <div>
                    <span className="font-medium">Received:</span> {formatDistanceToNow(new Date(emailDetails.receivedAt), { addSuffix: true })}
                  </div>
                </div>
              </div>

              {/* Authentication Results */}
              <div>
                <h4 className="font-medium mb-2">Authentication Results</h4>
                <div className="flex flex-wrap gap-2">
                  {getAuthBadge(emailDetails.authResults.spf, 'spf')}
                  {getAuthBadge(emailDetails.authResults.dkim, 'dkim')}
                  {getAuthBadge(emailDetails.authResults.dmarc, 'dmarc')}
                  {getAuthBadge(emailDetails.authResults.spam, 'spam')}
                  {getAuthBadge(emailDetails.authResults.virus, 'virus')}
                </div>
              </div>
            </div>

            <Separator />

            {/* Email Content Tabs */}
            <Tabs defaultValue="html" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
                <TabsTrigger value="raw">Raw</TabsTrigger>
              </TabsList>

              <TabsContent value="html" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">HTML Content</h4>
                    {emailDetails.emailContent.htmlBody && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(emailDetails.emailContent.htmlBody!, 'html')}
                      >
                        {copiedItems.html ? (
                          <CheckIcon className="h-4 w-4 mr-2" />
                        ) : (
                          <CopyIcon className="h-4 w-4 mr-2" />
                        )}
                        Copy HTML
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-96 w-full border rounded-md p-4">
                    {emailDetails.emailContent.htmlBody ? (
                      <div 
                        dangerouslySetInnerHTML={{ __html: emailDetails.emailContent.htmlBody }}
                        className="prose prose-sm max-w-none"
                      />
                    ) : (
                      <p className="text-muted-foreground">No HTML content available</p>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="text" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Text Content</h4>
                    {emailDetails.emailContent.textBody && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(emailDetails.emailContent.textBody!, 'text')}
                      >
                        {copiedItems.text ? (
                          <CheckIcon className="h-4 w-4 mr-2" />
                        ) : (
                          <CopyIcon className="h-4 w-4 mr-2" />
                        )}
                        Copy Text
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-96 w-full border rounded-md p-4">
                    {emailDetails.emailContent.textBody ? (
                      <pre className="whitespace-pre-wrap text-sm">
                        {emailDetails.emailContent.textBody}
                      </pre>
                    ) : (
                      <p className="text-muted-foreground">No text content available</p>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="headers" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Email Headers</h4>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(JSON.stringify(emailDetails.emailContent.headers, null, 2), 'headers')}
                    >
                      {copiedItems.headers ? (
                        <CheckIcon className="h-4 w-4 mr-2" />
                      ) : (
                        <CopyIcon className="h-4 w-4 mr-2" />
                      )}
                      Copy Headers
                    </Button>
                  </div>
                  <ScrollArea className="h-96 w-full border rounded-md p-4">
                    <div className="space-y-2">
                      {Object.entries(emailDetails.emailContent.headers).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-3 gap-4 text-sm">
                          <div className="font-medium text-right">{key}:</div>
                          <div className="col-span-2 break-all">{value}</div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="raw" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Raw Email Content</h4>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(emailDetails.emailContent.rawContent, 'raw')}
                    >
                      {copiedItems.raw ? (
                        <CheckIcon className="h-4 w-4 mr-2" />
                      ) : (
                        <CopyIcon className="h-4 w-4 mr-2" />
                      )}
                      Copy Raw
                    </Button>
                  </div>
                  <ScrollArea className="h-96 w-full border rounded-md p-4">
                    <pre className="whitespace-pre-wrap text-xs font-mono">
                      {emailDetails.emailContent.rawContent}
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>

            {/* Attachments */}
            {emailDetails.emailContent.attachments.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Attachments ({emailDetails.emailContent.attachments.length})</h4>
                  <div className="space-y-2">
                    {emailDetails.emailContent.attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{attachment.filename}</div>
                          <div className="text-sm text-muted-foreground">
                            {attachment.contentType} • {formatBytes(attachment.size)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Metadata */}
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Metadata</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Processing Time:</span> {emailDetails.metadata.processingTime}ms
                </div>
                <div>
                  <span className="font-medium">Action Type:</span> {emailDetails.metadata.actionType}
                </div>
                <div>
                  <span className="font-medium">S3 Bucket:</span> {emailDetails.metadata.s3Info.bucketName}
                </div>
                <div>
                  <span className="font-medium">Content Size:</span> {formatBytes(emailDetails.metadata.s3Info.contentSize)}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
} 
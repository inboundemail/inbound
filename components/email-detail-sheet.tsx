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
import Clipboard2 from "@/components/icons/clipboard-2"
import CircleCheck from "@/components/icons/circle-check"
import File2 from "@/components/icons/file-2"
import ShieldCheck from "@/components/icons/shield-check"
import Ban2 from "@/components/icons/ban-2"
import ShieldAlert from "@/components/icons/shield-alert"
import Clock2 from "@/components/icons/clock-2"
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { useEmailQuery, useMarkEmailAsReadMutation } from '@/features/emails/hooks'
import { EmailAttachments } from '@/components/email-attachments'

interface EmailDetailSheetProps {
  emailId: string | null
  isOpen: boolean
  onClose: () => void
}

export function EmailDetailSheet({ emailId, isOpen, onClose }: EmailDetailSheetProps) {
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({})
  
  // Use React Query hooks
  const { 
    data: emailDetails, 
    isLoading, 
    error,
    refetch 
  } = useEmailQuery(emailId && isOpen ? emailId : null)
  
  const markAsReadMutation = useMarkEmailAsReadMutation()

  // Mark email as read when viewing (non-blocking)
  useEffect(() => {
    if (emailDetails && emailId && isOpen) {
      // Mark as read in the background using the mutation
      markAsReadMutation.mutate(emailId)
    }
  }, [emailDetails, emailId, isOpen, markAsReadMutation])

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
          <ShieldCheck width="12" height="12" className="mr-1" />
          {type.toUpperCase()} Pass
        </Badge>
      )
    } else if (isFail) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-200 transition-colors">
          <Ban2 width="12" height="12" className="mr-1" />
          {type.toUpperCase()} Fail
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
          <ShieldAlert width="12" height="12" className="mr-1" />
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
              <p className="text-red-600 mb-4">{error.message}</p>
              <Button onClick={() => refetch()} variant="secondary">
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
                    <span className="font-medium">Received:</span> {formatDistanceToNow(emailDetails.receivedAt || new Date(), { addSuffix: true })}
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
                          <CircleCheck width="16" height="16" className="mr-2" />
                        ) : (
                          <Clipboard2 width="16" height="16" className="mr-2" />
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
                          <CircleCheck width="16" height="16" className="mr-2" />
                        ) : (
                          <Clipboard2 width="16" height="16" className="mr-2" />
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
                        <CircleCheck width="16" height="16" className="mr-2" />
                      ) : (
                        <Clipboard2 width="16" height="16" className="mr-2" />
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
                      onClick={() => copyToClipboard(emailDetails.emailContent.rawContent || '', 'raw')}
                    >
                      {copiedItems.raw ? (
                        <CircleCheck width="16" height="16" className="mr-2" />
                      ) : (
                        <Clipboard2 width="16" height="16" className="mr-2" />
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
                <EmailAttachments 
                  emailId={emailDetails.id} 
                  attachments={emailDetails.emailContent.attachments} 
                />
              </>
            )}

            {/* Metadata */}
            <Separator />
            <div>
              <h4 className="font-medium mb-2">Metadata</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Processing Time:</span> {emailDetails.metadata.processingTime ? `${emailDetails.metadata.processingTime}ms` : 'Unknown'}
                </div>
                <div>
                  <span className="font-medium">Action Type:</span> {emailDetails.metadata.actionType || 'Unknown'}
                </div>
                <div>
                  <span className="font-medium">S3 Bucket:</span> {emailDetails.metadata.s3Info.bucketName || 'Unknown'}
                </div>
                <div>
                  <span className="font-medium">Content Size:</span> {emailDetails.metadata.s3Info.contentSize ? formatBytes(emailDetails.metadata.s3Info.contentSize) : 'Unknown'}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
} 
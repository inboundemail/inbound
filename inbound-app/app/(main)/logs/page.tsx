"use client"

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// Sheet removed in favor of dedicated details page
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'

// Import Nucleo icons
import Clock2 from '@/components/icons/clock-2'
import Database2 from '@/components/icons/database-2'
import Eye2 from '@/components/icons/eye-2'
import Filter2 from '@/components/icons/filter-2'
import Refresh2 from '@/components/icons/refresh-2'
import Magnifier2 from '@/components/icons/magnifier-2'
import ObjRemove from '@/components/icons/obj-remove'
import CircleCheck from '@/components/icons/circle-check'
import TabClose from '@/components/icons/tab-close'
import CirclePlay from '@/components/icons/circle-play'
import CircleDots from '@/components/icons/circle-dots'
import Hashtag2 from '@/components/icons/hashtag-2'
import ShieldCheck from '@/components/icons/shield-check'
import Ban2 from '@/components/icons/ban-2'
import ArrowUpRight2 from '@/components/icons/arrow-up-right-2'
import ArchiveDownload from '@/components/icons/archive-download'
import ArchiveExport from '@/components/icons/archive-export'

import { useInfiniteUnifiedEmailLogsQuery } from '@/features/emails/hooks'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { EmailLogsOptions, EmailLogEntry, InboundEmailLogEntry, OutboundEmailLogEntry } from '@/features/emails/types'

function getTypeIcon(email: EmailLogEntry) {
  if (email.type === 'inbound') {
    return <ArchiveDownload width="16" height="16" className="text-purple-600" />
  } else {
    return <ArchiveExport width="16" height="16" className="text-blue-600" />
  }
}

function getStatusDot(email: EmailLogEntry) {
  if (email.type === 'inbound') {
    const inboundEmail = email as InboundEmailLogEntry
    const hasDeliveries = inboundEmail.deliveries.length > 0
    const hasSuccessfulDelivery = inboundEmail.deliveries.some(d => d.status === 'success')
    const hasFailedDelivery = inboundEmail.deliveries.some(d => d.status === 'failed')
    const hasPendingDelivery = inboundEmail.deliveries.some(d => d.status === 'pending')

    if (!inboundEmail.parseSuccess) {
      return <div className="w-2 h-2 rounded-full bg-red-500" />
    } else if (hasSuccessfulDelivery) {
      return <div className="w-2 h-2 rounded-full bg-green-500" />
    } else if (hasFailedDelivery) {
      return <div className="w-2 h-2 rounded-full bg-red-500" />
    } else if (hasPendingDelivery) {
      return <div className="w-2 h-2 rounded-full bg-yellow-500" />
    } else if (!hasDeliveries) {
      return <div className="w-2 h-2 rounded-full bg-gray-400" />
    } else {
      return <div className="w-2 h-2 rounded-full bg-gray-400" />
    }
  } else {
    // Outbound email
    const outboundEmail = email as OutboundEmailLogEntry
    
    switch (outboundEmail.status) {
      case 'sent':
        return <div className="w-2 h-2 rounded-full bg-green-500" />
      case 'failed':
        return <div className="w-2 h-2 rounded-full bg-red-500" />
      case 'pending':
        return <div className="w-2 h-2 rounded-full bg-yellow-500" />
      default:
        return <div className="w-2 h-2 rounded-full bg-gray-400" />
    }
  }
}

function LogDetailSheet({ log, isOpen, onClose }: { log: EmailLogEntry | null, isOpen: boolean, onClose: () => void }) {
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // noop
    } catch (err) {
      // noop
    }
  }

  if (!log) return null

  const isInbound = log.type === 'inbound'
  const inboundLog = isInbound ? log as InboundEmailLogEntry : null
  const outboundLog = !isInbound ? log as OutboundEmailLogEntry : null

  // Removed fetching; detail page will handle content
  const inboundEmailContent: any = null
  const outboundEmailContent: any = null
  const isLoadingContent = false
  const contentError: any = null

  return (
    <div hidden={!isOpen}>
      <div className="pb-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              {getTypeIcon(log)}
              <div className="absolute -top-1 -right-1">
                {getStatusDot(log)}
              </div>
            </div>
            {isInbound ? 'Inbound' : 'Outbound'} Email Log Details
            {isLoadingContent && <span className="text-xs text-muted-foreground ml-2">(Loading...)</span>}
          </div>
          <div>
            Message ID: {log.messageId}
          </div>
      </div>

        <ScrollArea className="h-[calc(85vh-120px)]">
          <div className="space-y-6 pb-6">
            {isLoadingContent && (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Loading email details...</div>
              </div>
            )}
            {/* Email Information */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Email Information</h3>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        {getTypeIcon(log)}
                        <div className="absolute -top-1 -right-1">
                          {getStatusDot(log)}
                        </div>
                      </div>
                      <p className="font-medium capitalize">{log.type}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">From:</span>
                    <p className="font-medium">{log.from}</p>
                  </div>
                  
                  {isInbound && inboundLog && (
                    <>
                      <div>
                        <span className="text-muted-foreground">To:</span>
                        <p className="font-medium">{inboundLog.recipient}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Received:</span>
                        <p className="font-medium">{format(new Date(inboundLog.receivedAt), 'PPpp')}</p>
                      </div>
                    </>
                  )}
                  
                  {!isInbound && outboundLog && (
                    <>
                      <div>
                        <span className="text-muted-foreground">To:</span>
                        <div className="font-medium">
                          {outboundLog.to.map((recipient, index) => (
                            <div key={index}>{recipient}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <p className="font-medium capitalize">{outboundLog.status}</p>
                      </div>
                      {outboundLog.sentAt && (
                        <div>
                          <span className="text-muted-foreground">Sent:</span>
                          <p className="font-medium">{format(new Date(outboundLog.sentAt), 'PPpp')}</p>
                        </div>
                      )}
                      {outboundLog.provider && (
                        <div>
                          <span className="text-muted-foreground">Provider:</span>
                          <p className="font-medium uppercase">{outboundLog.provider}</p>
                        </div>
                      )}
                    </>
                  )}
                  
                  <div>
                    <span className="text-muted-foreground">Subject:</span>
                    <p className="font-medium">{log.subject}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Domain:</span>
                    <p className="font-medium">{log.domain}</p>
                  </div>
                  
                  {isInbound && inboundLog && (
                    <div>
                      <span className="text-muted-foreground">Processing Time:</span>
                      <p className="font-medium">{inboundLog.processingTimeMs}ms</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Email Content */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Email Content</h3>
              {isLoadingContent ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">Loading email content...</div>
                </div>
              ) : contentError ? (
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-destructive">Failed to Load Content</span>
                  </div>
                  <p className="text-sm text-destructive">{contentError.message}</p>
                </div>
                             ) : (inboundEmailContent || outboundEmailContent) ? (
                 <Tabs defaultValue="html" className="w-full">
                   <TabsList className="grid w-full grid-cols-3">
                     <TabsTrigger value="html">HTML</TabsTrigger>
                     <TabsTrigger value="text">Text</TabsTrigger>
                     <TabsTrigger value="raw">Raw</TabsTrigger>
                   </TabsList>
                   <TabsContent value="html" className="space-y-2">
                     {(isInbound ? inboundEmailContent?.content?.htmlBody : outboundEmailContent?.html) ? (
                       <div className="space-y-2">
                         <div className="flex items-center justify-between">
                           <span className="text-xs text-muted-foreground">HTML Content:</span>
                            
                         </div>
                         <div className="border rounded-lg p-4 bg-muted/20 max-h-96 overflow-auto">
                           <iframe
                             srcDoc={`
                               <html>
                                 <head>
                                   <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
                                   <style>
                                     body {
                                       font-family: 'Outfit', Arial, Helvetica, sans-serif;
                                       color: white;
                                       background-color: transparent;
                                       margin: 0;
                                       padding: 16px;
                                     }
                                     * {
                                       font-family: 'Outfit', Arial, Helvetica, sans-serif;
                                       font-weight: 400;
                                       color: white;
                                     }
                                     a {
                                       color: #60a5fa !important;
                                     }
                                   </style>
                                 </head>
                                 <body>
                                   ${isInbound ? inboundEmailContent?.content?.htmlBody || '' : outboundEmailContent?.html || ''}
                                 </body>
                               </html>
                             `}
                             className="w-full min-h-[300px] border-0"
                             sandbox="allow-same-origin"
                             title="Email HTML Content"
                           />
                         </div>
                       </div>
                     ) : (
                       <p className="text-sm text-muted-foreground">No HTML content available</p>
                     )}
                   </TabsContent>
                   <TabsContent value="text" className="space-y-2">
                     {(isInbound ? inboundEmailContent?.content?.textBody : outboundEmailContent?.text) ? (
                       <div className="space-y-2">
                         <div className="flex items-center justify-between">
                           <span className="text-xs text-muted-foreground">Text Content:</span>
                            
                         </div>
                         <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                           {isInbound ? inboundEmailContent?.content?.textBody : outboundEmailContent?.text}
                         </pre>
                       </div>
                     ) : (
                       <p className="text-sm text-muted-foreground">No text content available</p>
                     )}
                   </TabsContent>
                   <TabsContent value="raw" className="space-y-2">
                     {isInbound && inboundEmailContent?.content?.rawContent ? (
                       <div className="space-y-2">
                         <div className="flex items-center justify-between">
                           <span className="text-xs text-muted-foreground">Raw Email Content:</span>
                            
                         </div>
                         <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto font-mono max-h-96 overflow-y-auto">
                           {inboundEmailContent?.content?.rawContent}
                         </pre>
                       </div>
                     ) : (
                       <p className="text-sm text-muted-foreground">Raw content not available {!isInbound && '(outbound emails only store HTML/text)'}</p>
                     )}
                   </TabsContent>
                 </Tabs>
              ) : (
                <p className="text-sm text-muted-foreground">No email content available</p>
              )}
            </div>

            <Separator />

                         {/* Email Statistics and Metadata */}
             {(inboundEmailContent || outboundEmailContent) && (
               <>
                 <div>
                   <h3 className="text-sm font-semibold mb-3">Email Statistics</h3>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     {isInbound && inboundEmailContent ? (
                       <>
                         <div>
                           <span className="text-muted-foreground">Parse Success:</span>
                           <div className="flex items-center gap-2">
                             {inboundEmailContent.metadata?.parseSuccess ? (
                               <CircleCheck width="14" height="14" className="text-green-600" />
                             ) : (
                               <TabClose width="14" height="14" className="text-destructive" />
                             )}
                             <p className="font-medium">{inboundEmailContent.metadata?.parseSuccess ? 'Yes' : 'No'}</p>
                           </div>
                         </div>
                         {inboundEmailContent.metadata?.parseError && (
                           <div>
                             <span className="text-muted-foreground">Parse Error:</span>
                             <p className="font-medium text-destructive">{inboundEmailContent.metadata.parseError}</p>
                           </div>
                         )}
                         <div>
                           <span className="text-muted-foreground">Has Text Body:</span>
                           <p className="font-medium">{inboundEmailContent.metadata?.hasTextBody ? 'Yes' : 'No'}</p>
                         </div>
                         <div>
                           <span className="text-muted-foreground">Has HTML Body:</span>
                           <p className="font-medium">{inboundEmailContent.metadata?.hasHtmlBody ? 'Yes' : 'No'}</p>
                         </div>
                         <div>
                           <span className="text-muted-foreground">Attachments:</span>
                           <p className="font-medium">{inboundEmailContent.metadata?.attachmentCount || 0}</p>
                         </div>
                         {inboundEmailContent.metadata?.priority && (
                           <div>
                             <span className="text-muted-foreground">Priority:</span>
                             <p className="font-medium">{inboundEmailContent.metadata.priority}</p>
                           </div>
                         )}
                       </>
                     ) : outboundEmailContent ? (
                       <>
                         <div>
                           <span className="text-muted-foreground">Created:</span>
                           <p className="font-medium">{format(new Date(outboundEmailContent.created_at), 'PPpp')}</p>
                         </div>
                         <div>
                           <span className="text-muted-foreground">Last Event:</span>
                           <p className="font-medium capitalize">{outboundEmailContent.last_event}</p>
                         </div>
                         <div>
                           <span className="text-muted-foreground">Recipients:</span>
                           <p className="font-medium">{outboundEmailContent.to?.length || 0} to, {outboundEmailContent.cc?.filter(Boolean).length || 0} cc, {outboundEmailContent.bcc?.filter(Boolean).length || 0} bcc</p>
                         </div>
                         <div>
                           <span className="text-muted-foreground">Content Type:</span>
                           <p className="font-medium">
                             {outboundEmailContent.html && outboundEmailContent.text ? 'HTML + Text' : 
                              outboundEmailContent.html ? 'HTML Only' : 
                              outboundEmailContent.text ? 'Text Only' : 'None'}
                           </p>
                         </div>
                       </>
                     ) : null}
                   </div>
                 </div>
                 <Separator />
               </>
             )}

                         {/* Attachments */}
             {isInbound && inboundEmailContent?.content?.attachments && inboundEmailContent.content.attachments.length > 0 && (
               <>
                 <div>
                   <h3 className="text-sm font-semibold mb-3">Attachments ({inboundEmailContent.content.attachments.length})</h3>
                   <div className="space-y-2">
                     {inboundEmailContent.content.attachments.map((attachment: any, index: number) => (
                       <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                         <div className="flex items-center gap-3">
                           <Hashtag2 width="16" height="16" className="text-muted-foreground" />
                           <div>
                             <p className="font-medium text-sm">{attachment.filename}</p>
                             <p className="text-xs text-muted-foreground">
                               {attachment.contentType} • {attachment.size ? `${Math.round(attachment.size / 1024)}KB` : 'Unknown size'}
                             </p>
                           </div>
                         </div>
                         {attachment.contentId && (
                           <Badge variant="outline" className="text-xs">
                             Inline
                           </Badge>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
                 <Separator />
               </>
             )}

            {/* Additional Recipients for Outbound */}
            {!isInbound && outboundLog && (outboundLog.cc || outboundLog.bcc || outboundLog.replyTo) && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3">Additional Recipients</h3>
                  <div className="space-y-2 text-sm">
                    {outboundLog.cc && (
                      <div>
                        <span className="text-muted-foreground">CC:</span>
                        <div className="font-medium">
                          {outboundLog.cc.map((recipient, index) => (
                            <div key={index}>{recipient}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {outboundLog.bcc && (
                      <div>
                        <span className="text-muted-foreground">BCC:</span>
                        <div className="font-medium">
                          {outboundLog.bcc.map((recipient, index) => (
                            <div key={index}>{recipient}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {outboundLog.replyTo && (
                      <div>
                        <span className="text-muted-foreground">Reply-To:</span>
                        <div className="font-medium">
                          {outboundLog.replyTo.map((recipient, index) => (
                            <div key={index}>{recipient}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Authentication Results (Inbound only) */}
            {isInbound && inboundLog && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3">Authentication Results</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge 
                      variant={inboundLog.authResults.spf === 'PASS' ? 'default' : 'destructive'}
                      className={inboundLog.authResults.spf === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    >
                      {inboundLog.authResults.spf === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />}
                      SPF: {inboundLog.authResults.spf}
                    </Badge>
                    <Badge 
                      variant={inboundLog.authResults.dkim === 'PASS' ? 'default' : 'destructive'}
                      className={inboundLog.authResults.dkim === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    >
                      {inboundLog.authResults.dkim === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />}
                      DKIM: {inboundLog.authResults.dkim}
                    </Badge>
                    <Badge 
                      variant={inboundLog.authResults.dmarc === 'PASS' ? 'default' : 'destructive'}
                      className={inboundLog.authResults.dmarc === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    >
                      {inboundLog.authResults.dmarc === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />}
                      DMARC: {inboundLog.authResults.dmarc}
                    </Badge>
                    <Badge 
                      variant={inboundLog.authResults.spam === 'PASS' ? 'default' : 'destructive'}
                      className={inboundLog.authResults.spam === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    >
                      Spam: {inboundLog.authResults.spam}
                    </Badge>
                    <Badge 
                      variant={inboundLog.authResults.virus === 'PASS' ? 'default' : 'destructive'}
                      className={inboundLog.authResults.virus === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    >
                      Virus: {inboundLog.authResults.virus}
                    </Badge>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Delivery Information (Inbound only) */}
            {isInbound && inboundLog && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3">Delivery Information</h3>
                  {inboundLog.deliveries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No delivery configured for this email</p>
                  ) : (
                    <div className="space-y-4">
                      {inboundLog.deliveries.map((delivery) => (
                        <div key={delivery.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-medium">{delivery.config?.name || 'Unknown Endpoint'}</h4>
                              <p className="text-sm text-muted-foreground">
                                {delivery.type === 'webhook' ? 'Webhook' : 'Email Forward'}
                              </p>
                            </div>
                            <Badge 
                              variant={delivery.status === 'success' ? 'default' : delivery.status === 'failed' ? 'destructive' : 'secondary'}
                              className={
                                delivery.status === 'success' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                delivery.status === 'failed' ? '' :
                                'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                              }
                            >
                              {delivery.status.toUpperCase()}
                            </Badge>
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-muted-foreground">Attempts:</span>
                                <p className="font-medium">{delivery.attempts}</p>
                              </div>
                              {delivery.lastAttemptAt && (
                                <div>
                                  <span className="text-muted-foreground">Last Attempt:</span>
                                  <p className="font-medium">{format(new Date(delivery.lastAttemptAt), 'PPp')}</p>
                                </div>
                              )}
                              {delivery.deliveryTimeMs && (
                                <div>
                                  <span className="text-muted-foreground">Delivery Time:</span>
                                  <p className="font-medium">{delivery.deliveryTimeMs}ms</p>
                                </div>
                              )}
                              {delivery.responseCode && (
                                <div>
                                  <span className="text-muted-foreground">Response Code:</span>
                                  <p className="font-medium">{delivery.responseCode}</p>
                                </div>
                              )}
                            </div>

                            {delivery.config?.url && (
                              <div>
                                <span className="text-muted-foreground">URL:</span>
                                <p className="font-medium font-mono text-xs break-all">{delivery.config.url}</p>
                              </div>
                            )}

                            {delivery.error && (
                              <div className="mt-2 p-2 bg-destructive/10 rounded">
                                <span className="text-destructive text-sm font-medium">Error:</span>
                                <p className="text-destructive text-sm mt-1">{delivery.error}</p>
                              </div>
                            )}

                            {delivery.responseData && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-muted-foreground">Response Data:</span>
                                  
                                </div>
                                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                  {JSON.stringify(delivery.responseData, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Failure Information (Outbound only) */}
            {!isInbound && outboundLog && outboundLog.status === 'failed' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-3">Failure Information</h3>
                  <div className="p-4 bg-destructive/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TabClose width="16" height="16" className="text-destructive" />
                      <span className="font-medium text-destructive">Email Failed to Send</span>
                    </div>
                    {outboundLog.failureReason && (
                      <p className="text-sm text-destructive">{outboundLog.failureReason}</p>
                    )}
                    {outboundLog.providerResponse && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-muted-foreground text-xs">Provider Response:</span>
                          
                        </div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(outboundLog.providerResponse, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/mail/${log.id}`}>
                  <Eye2 width="14" height="14" className="mr-2" />
                  View Email
                </Link>
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
  )
}

export default function LogsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<string>('7d')
  const [selectedLog, setSelectedLog] = useState<EmailLogEntry | null>(null)

  // Debounce inputs to cut request volume
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const debouncedStatus = useDebouncedValue(statusFilter, 150)
  const debouncedType = useDebouncedValue(typeFilter, 150)
  const debouncedDomain = useDebouncedValue(domainFilter, 150)
  const debouncedTime = useDebouncedValue(timeRange, 150)

  const infiniteOptions: Omit<EmailLogsOptions, 'offset'> = {
    searchQuery: debouncedSearch,
    statusFilter: debouncedStatus as any,
    typeFilter: debouncedType as any,
    domainFilter: debouncedDomain,
    timeRange: debouncedTime as any,
    limit: 100,
  }

  const {
    data,
    isLoading,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteUnifiedEmailLogsQuery(infiniteOptions)

  const firstPage = data?.pages?.[0]
  const stats = firstPage?.stats
  const filtersUniqueDomains = firstPage?.filters?.uniqueDomains ?? []

  const { ref: sentinelRef, hasIntersected } = useIntersectionObserver({ rootMargin: '400px' })
  useEffect(() => {
    if (hasIntersected && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [hasIntersected, hasNextPage, isFetchingNextPage, fetchNextPage])

  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
            <div className="flex items-center gap-2 text-destructive">
              <ObjRemove width="16" height="16" />
              <span>{error.message}</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto text-destructive hover:text-destructive/80">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
                Email Flow
              </h2>
              <p className="text-muted-foreground text-sm font-medium">
                {stats?.totalEmails || 0} total logs found ({stats?.inbound || 0} inbound, {stats?.outbound || 0} outbound)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <Refresh2 width="14" height="14" className="mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 rounded-xl"
              />
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[120px] h-9 rounded-xl">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="no_delivery">No Delivery</SelectItem>
                <SelectItem value="parse_failed">Parse Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[140px] h-9 rounded-xl">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {filtersUniqueDomains.map((domain: string) => (
                  <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px] h-9 rounded-xl">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || domainFilter !== 'all' || timeRange !== '7d') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                  setTypeFilter('all')
                  setDomainFilter('all')
                  setTimeRange('7d')
                }}
                className="h-9"
              >
                <Filter2 width="14" height="14" className="mr-2" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        {stats && (
            <div className="mb-6 bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <ArchiveDownload width="14" height="14" className="text-purple-600" />
                <span className="text-muted-foreground">Inbound:</span>
                <span className="font-medium text-foreground">{stats.inbound}</span>
              </div>
              <div className="flex items-center gap-2">
                <ArchiveExport width="14" height="14" className="text-blue-600" />
                <span className="text-muted-foreground">Outbound:</span>
                <span className="font-medium text-foreground">{stats.outbound}</span>
              </div>
              <div className="flex items-center gap-2">
                <CircleCheck width="14" height="14" className="text-green-600" />
                <span className="text-muted-foreground">Delivered:</span>
                <span className="font-medium text-foreground">{stats.delivered}</span>
              </div>
              <div className="flex items-center gap-2">
                <TabClose width="14" height="14" className="text-destructive" />
                <span className="text-muted-foreground">Failed:</span>
                <span className="font-medium text-foreground">{stats.failed}</span>
              </div>
              <div className="flex items-center gap-2">
                <CirclePlay width="14" height="14" className="text-yellow-600" />
                <span className="text-muted-foreground">Pending:</span>
                <span className="font-medium text-foreground">{stats.pending}</span>
              </div>
              <div className="flex items-center gap-2">
                <CircleDots width="14" height="14" className="text-muted-foreground" />
                <span className="text-muted-foreground">No Delivery:</span>
                <span className="font-medium text-foreground">{stats.noDelivery}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock2 width="14" height="14" className="text-muted-foreground" />
                <span className="text-muted-foreground">Avg Processing:</span>
                <span className="font-medium text-foreground">{Math.round(stats.avgProcessingTime)}ms</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Logs List - Edge to Edge */}
      <div className="w-full max-w-6xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading logs...</div>
          </div>
        ) : !((data?.pages?.flatMap(p => p.emails) || []).length) ? (
          <div className="max-w-6xl mx-auto p-4">
            <div className="bg-card border-border rounded-xl p-8">
              <div className="text-center">
                <Database2 width="48" height="48" className="text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-foreground">No logs found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || domainFilter !== 'all' || timeRange !== '7d'
                    ? 'Try adjusting your filters or search query.'
                    : 'Start receiving or sending emails to see logs here.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(data?.pages ?? []).flatMap(p => p.emails).map((log) => {
              const isInbound = log.type === 'inbound'
              const inboundLog = isInbound ? log as InboundEmailLogEntry : null
              const outboundLog = !isInbound ? log as OutboundEmailLogEntry : null
              
              return (
                 <div 
                   key={log.id}
                   className="flex items-center gap-4 px-6 py-3 hover:bg-muted/50 transition-colors"
                 >
                   {/* Type Icon with Status Dot */}
                   <div className="flex-shrink-0">
                     <div className="relative">
                       {getTypeIcon(log)}
                       <div className="absolute -top-1 -right-1">
                         {getStatusDot(log)}
                       </div>
                     </div>
                   </div>

                  {/* Time */}
                  <div className="flex-shrink-0 w-20 text-xs font-mono text-muted-foreground">
                    {format(new Date(log.createdAt), 'HH:mm:ss')}
                  </div>

                  {/* From */}
                  <div className="flex-shrink-0 w-48 truncate">
                    <span className="text-sm font-medium">{log.from}</span>
                  </div>

                  {/* To/Recipient */}
                  <div className="flex-shrink-0 w-48 truncate">
                    {isInbound && inboundLog ? (
                      <span className="text-sm">{inboundLog.recipient}</span>
                    ) : (
                      outboundLog && (
                        <span className="text-sm">
                          {outboundLog.to.length > 1 ? `${outboundLog.to[0]} +${outboundLog.to.length - 1}` : outboundLog.to[0]}
                        </span>
                      )
                    )}
                  </div>

                  {/* Subject */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{log.subject}</span>
                      {log.hasAttachments && (
                        <Hashtag2 width="14" height="14" className="text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {log.domain} • {isInbound ? 'Inbound' : 'Outbound'}
                    </div>
                  </div>

                  {/* Status/Delivery Info */}
                  <div className="flex-shrink-0 text-right">
                    {isInbound && inboundLog ? (
                      inboundLog.deliveries.length > 0 ? (
                        <div className="text-xs">
                          <div className="font-medium">
                            {inboundLog.deliveries[0].config?.name || 'Unknown'}
                          </div>
                          <div className="text-muted-foreground">
                            {inboundLog.deliveries[0].responseCode ? `${inboundLog.deliveries[0].responseCode}` : 
                             inboundLog.deliveries[0].error ? 'Error' : 
                             inboundLog.deliveries[0].status}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No delivery</span>
                      )
                    ) : (
                      outboundLog && (
                        <div className="text-xs">
                          <div className="font-medium capitalize">{outboundLog.status}</div>
                          <div className="text-muted-foreground uppercase">{outboundLog.provider}</div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Auth badges (Inbound only) */}
                  <div className="flex-shrink-0 flex gap-1">
                    {isInbound && inboundLog && (
                      <>
                        {inboundLog.authResults.spf === 'PASS' && (
                          <Badge variant="outline" className="text-xs px-1 py-0 h-5">SPF</Badge>
                        )}
                        {inboundLog.authResults.dkim === 'PASS' && (
                          <Badge variant="outline" className="text-xs px-1 py-0 h-5">DKIM</Badge>
                        )}
                        {inboundLog.authResults.spf === 'FAIL' && (
                          <Badge variant="destructive" className="text-xs px-1 py-0 h-5">SPF✗</Badge>
                        )}
                        {inboundLog.authResults.dkim === 'FAIL' && (
                          <Badge variant="destructive" className="text-xs px-1 py-0 h-5">DKIM✗</Badge>
                        )}
                      </>
                    )}
                  </div>

                  {/* Processing time / Timing info */}
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    {isInbound && inboundLog ? 
                      `${inboundLog.processingTimeMs}ms` : 
                      outboundLog?.sentAt ? format(new Date(outboundLog.sentAt), 'HH:mm') : 'Pending'
                    }
                  </div>

                  {/* View link for prefetch */}
                  <Link href={`/logs/${log.id}`} className="h-6 w-6 p-0 flex-shrink-0 inline-flex items-center justify-center rounded hover:bg-accent">
                    <ArrowUpRight2 width="12" height="12" />
                  </Link>
                </div>
              )
            })}
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef as any} className="h-12 flex items-center justify-center">
              {isFetchingNextPage && (
                <div className="text-muted-foreground text-sm">Loading more…</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail sheet removed. */}
    </div>
  )
} 
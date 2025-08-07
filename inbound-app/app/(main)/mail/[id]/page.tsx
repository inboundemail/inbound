"use client"

import { useParams, useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth/auth-client'
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import ArrowBoldLeft from '@/components/icons/arrow-bold-left'
import File2 from '@/components/icons/file-2'
import Envelope2 from '@/components/icons/envelope-2'
import Download2 from '@/components/icons/download-2'
import CircleCheck from '@/components/icons/circle-check'
import ArrowUpRight2 from '@/components/icons/arrow-up-right-2'
import { format } from 'date-fns'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { EmailAttachments } from '@/components/email-attachments'
import { useOptimizedEmailThreadV2 } from '@/features/emails/hooks/useOptimizedEmailThreadV2'
import { useReplyToEmailV2Mutation, useDomainsListV2Query } from '@/features/emails/hooks'
import { toast } from 'sonner'
import { extractNewContent } from '@/lib/email-management/email-thread-parser'
import SandboxedEmailViewer from '@/components/emails/SandboxedEmailViewer'
import type { ThreadMessage } from '@/lib/email-management/improved-threading'

interface ThreadMessageProps {
  message: ThreadMessage
  isLatest?: boolean
  showAttachments?: boolean
}

function ThreadMessageItem({ message, isLatest = false, showAttachments = true }: ThreadMessageProps) {
  // Extract initials for avatar
  const getInitials = (name: string) => {
    const words = name.trim().split(/\s+/)
    if (words.length >= 2) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
    } else {
      return name.slice(0, 2).toUpperCase()
    }
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', 
      '#f59e0b', '#ef4444', '#ec4899', '#84cc16'
    ]
    const hash = name.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)
    return colors[Math.abs(hash) % colors.length]
  }

  const senderName = message.fromName || message.from.split('<')[0].trim() || message.from.split('@')[0]
  const initials = getInitials(senderName)
  const avatarColor = getAvatarColor(senderName)
  const displayDate = message.receivedAt || message.sentAt

  // For threaded view, extract only the new content (not quoted content)
  const displayContent = message.content.htmlBody 
    ? extractNewContent(message.content.htmlBody) || message.content.htmlBody
    : extractNewContent(message.content.textBody || '') || message.content.textBody

  return (
    <div className={`border-l-2 pl-4 pb-6 ${
      message.type === 'outbound' 
        ? 'border-l-blue-200 bg-blue-50/30' 
        : 'border-l-gray-200'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <CustomInboundIcon 
          text={initials}
          size={32} 
          backgroundColor={avatarColor} 
        />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground text-sm">
                {senderName}
              </span>
              <span className="text-muted-foreground text-xs">
                &lt;{message.addresses.from?.addresses?.[0]?.address || message.from}&gt;
              </span>
              {message.type === 'outbound' && (
                <Badge className="bg-blue-500 text-white rounded-full px-2 py-0.5 text-xs">
                  Sent
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {displayDate ? format(new Date(displayDate), 'MMM d, h:mm a') : 'Unknown date'}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            to {message.to}
          </div>
        </div>
      </div>

      <div className="ml-8">
        {displayContent ? (
          <SandboxedEmailViewer
            htmlContent={message.content.htmlBody ? displayContent : null}
            textContent={!message.content.htmlBody ? displayContent : null}
            className="rounded-lg border border-gray-200"
            minHeight={100}
            maxHeight={600}
            onContentLoad={() => {
              // Optional: Track email content load for analytics
            }}
            onContentError={(error) => {
              console.error('Email content error:', error)
            }}
          />
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Envelope2 className="h-4 w-4 mx-auto mb-1" />
            <p>No content available</p>
          </div>
        )}

        {/* Attachments for the latest message or if explicitly requested */}
        {showAttachments && message.content.attachments && message.content.attachments.length > 0 && (
          <div className="mt-4">
            <EmailAttachments 
              emailId={message.id} 
              attachments={message.content.attachments} 
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function EmailViewPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const emailId = params.id as string
  
  // State for reply form
  const [replyText, setReplyText] = useState('')
  const [selectedFromAddress, setSelectedFromAddress] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customFromAddress, setCustomFromAddress] = useState('')

  // Use optimized thread query with advanced caching and performance features
  const {
    data: threadData,
    messages,
    isLoading,
    isError,
    error: threadError,
    confidence,
    threadingMethod,
    unreadMessages,
    hasUnread,
    markAsRead,
    refetch,
    performance
  } = useOptimizedEmailThreadV2(emailId, {
    enableBackgroundRefetch: true,
    staleTime: 2 * 60 * 1000, // 2 minutes
    enableOptimisticUpdates: true,
    includeRead: true
  })
  const replyMutation = useReplyToEmailV2Mutation()
  
  // Get user's verified domains for the from dropdown
  const { data: domainsData } = useDomainsListV2Query({ status: 'verified' })

  // Handle authentication
  useEffect(() => {
    if (!session) {
      router.push('/login')
    }
  }, [session, router])

  // Auto-mark original email as read when viewing (using optimized mutation)
  useEffect(() => {
    if (messages.length > 0) {
      const originalMessage = messages.find(m => m.id === emailId)
      if (originalMessage && !originalMessage.isRead && originalMessage.type === 'inbound') {
        markAsRead(emailId).catch(error => {
          console.error('Failed to mark email as read:', error)
        })
      }
    }
  }, [messages, emailId, markAsRead])
  
  // Set default from address when thread data is loaded
  useEffect(() => {
    if (messages.length > 0 && !selectedFromAddress && !showAdvanced) {
      // Use the recipient email address from the latest inbound message
      const latestInbound = messages
        .filter(m => m.type === 'inbound')
        .sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())[0]
      
      if (latestInbound) {
        const recipientAddress = latestInbound.addresses.to?.addresses?.[0]?.address || latestInbound.to
        setSelectedFromAddress(recipientAddress)
      }
    }
  }, [messages, selectedFromAddress, showAdvanced])

  // Validate custom email address domain
  const isCustomAddressValid = () => {
    if (!customFromAddress) return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(customFromAddress)) return false
    
    const domain = customFromAddress.split('@')[1]
    const verifiedDomains = domainsData?.data?.filter(d => d.status === 'verified') || []
    return verifiedDomains.some(d => d.domain === domain)
  }

  const handleReply = async () => {
    if (!replyText.trim()) {
      toast.error('Please enter a reply message')
      return
    }
    
    const fromAddress = showAdvanced && customFromAddress ? customFromAddress : selectedFromAddress
    
    if (!fromAddress) {
      toast.error('Please select a from address')
      return
    }
    
    if (showAdvanced && !isCustomAddressValid()) {
      toast.error('Invalid email address or domain not verified')
      return
    }
    
    // Extract the original sender's email address from the latest inbound message
    const latestInbound = messages
      .filter(m => m.type === 'inbound')
      .sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())[0]
    
    const originalSenderAddress = latestInbound?.addresses.from?.addresses?.[0]?.address || 
                                 (latestInbound?.from.includes('<') ? 
                                  latestInbound.from.split('<')[1].replace('>', '') : 
                                  latestInbound?.from)
    
    try {
      await replyMutation.mutateAsync({
        emailId,
        from: fromAddress,
        to: originalSenderAddress,
        text: replyText,
        include_original: true
      })
      
      toast.success('Reply sent successfully!')
      setReplyText('')
      setCustomFromAddress('')
      setShowAdvanced(false)
      
      // Refetch the thread to show the new reply
      refetch()
    } catch (error) {
      console.error('Failed to send reply:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send reply')
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 font-outfit">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading conversation...</div>
          </div>
        </div>
      </div>
    )
  }

  if (isError || !threadData) {
    return (
      <div className="p-4 font-outfit">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/mail">
              <Button variant="primary">
                <ArrowBoldLeft className="h-4 w-4 mr-2" />
                Back to Mail
              </Button>
            </Link>
          </div>

          <Card className="border-destructive/50 bg-destructive/10 rounded-xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-destructive">
                <Envelope2 className="h-4 w-4" />
                <span>{threadError?.message || 'Failed to load conversation'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Get the subject from the first message
  const conversationSubject = messages[0]?.subject || 'No Subject'
  const messageCount = messages.length

  return (
    <div className="p-4 font-outfit">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/mail">
            <Button variant="primary">
              <ArrowBoldLeft className="h-4 w-4 mr-2" />
              Back to Mail
            </Button>
          </Link>
        </div>

        {/* Conversation Header */}
        <Card className="rounded-xl overflow-hidden mb-4">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-2 tracking-tight">
                  {conversationSubject}
                </h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{messageCount} message{messageCount !== 1 ? 's' : ''} in conversation</span>
                  {hasUnread && (
                    <span className="text-blue-600 font-medium">
                      {unreadMessages.length} unread
                    </span>
                  )}
                  {performance && (
                    <span className="text-xs">
                      Threading: {confidence} confidence via {threadingMethod}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    confidence === 'high' ? 'bg-green-500 text-white' :
                    confidence === 'medium' ? 'bg-yellow-500 text-white' :
                    'bg-gray-500 text-white'
                  }`}
                >
                  <Envelope2 className="w-3 h-3 mr-1" />
                  {confidence} Thread
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversation Thread */}
        <Card className="rounded-xl overflow-hidden">
          <CardContent className="p-6">
            <div className="space-y-0">
              {messages.map((message, index) => (
                <ThreadMessageItem
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                  showAttachments={index === messages.length - 1} // Only show attachments on latest
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Reply Card */}
        <Card className="rounded-xl overflow-hidden mt-4">
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Reply Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Reply</h3>
                <div className="text-sm text-muted-foreground">
                  From: {showAdvanced && customFromAddress ? customFromAddress : selectedFromAddress}
                </div>
              </div>

              {/* Reply Textarea */}
              <div className="relative">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply here..."
                  rows={6}
                  className="w-full resize-none pr-16"
                  disabled={replyMutation.isPending}
                />
                
                {/* Send Button - Bottom Right of Textarea */}
                <Button
                  onClick={handleReply}
                  disabled={replyMutation.isPending || !replyText.trim() || (!showAdvanced && !selectedFromAddress) || (showAdvanced && (!customFromAddress || !isCustomAddressValid()))}
                  size="icon"
                  className="absolute bottom-2 right-2"
                  title="Send Reply"
                >
                  {replyMutation.isPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <ArrowUpRight2 className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Advanced Section Toggle */}
              <div className="pt-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                </Button>
              </div>

              {/* Advanced Options */}
              {showAdvanced && (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="custom-from">Custom From Address</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        id="custom-from"
                        value={customFromAddress}
                        onChange={(e) => setCustomFromAddress(e.target.value)}
                        placeholder="custom@yourdomain.com"
                        className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="flex items-center justify-center w-8 h-8">
                        {customFromAddress && (
                          isCustomAddressValid() ? (
                            <CircleCheck className="h-5 w-5 text-green-500" />
                          ) : (
                            <span className="text-red-500">❌</span>
                          )
                        )}
                      </div>
                    </div>
                    {customFromAddress && !isCustomAddressValid() && (
                      <p className="text-xs text-red-500">
                        Email address must use one of your verified domains: {domainsData?.data?.filter(d => d.status === 'verified').map(d => d.domain).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Available Domains Reference */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Your Verified Domains</Label>
                    <div className="flex flex-wrap gap-2">
                      {domainsData?.data?.filter(d => d.status === 'verified').map(domain => (
                        <Badge
                          key={domain.id}
                          variant="secondary"
                          className="text-xs cursor-pointer hover:bg-secondary/80"
                          onClick={() => {
                            const prefix = customFromAddress.split('@')[0] || 'noreply'
                            setCustomFromAddress(`${prefix}@${domain.domain}`)
                          }}
                        >
                          @{domain.domain}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Info Text */}
              <p className="text-xs text-muted-foreground">
                Your reply will be added to this conversation thread.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 
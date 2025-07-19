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
import { useMailDetailsV2Query, useMarkEmailAsReadV2Mutation, useReplyToEmailV2Mutation, useDomainsListV2Query } from '@/features/emails/hooks'
import { toast } from 'sonner'

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

  // Use v2 hooks for data fetching
  const {
    data: emailDetails,
    isLoading,
    error: emailError,
    refetch
  } = useMailDetailsV2Query(emailId)

  const markAsReadMutation = useMarkEmailAsReadV2Mutation()
  const replyMutation = useReplyToEmailV2Mutation()
  
  // Get user's verified domains for the from dropdown
  const { data: domainsData } = useDomainsListV2Query({ status: 'verified' })

  // Handle authentication
  useEffect(() => {
    if (!session) {
      router.push('/login')
    }
  }, [session, router])

  // Auto-mark email as read when viewing
  useEffect(() => {
    if (emailDetails && !emailDetails.isRead) {
      markAsReadMutation.mutate(emailId)
    }
  }, [emailDetails, emailId, markAsReadMutation])
  
  // Set default from address when domains are loaded
  useEffect(() => {
    if (emailDetails && !selectedFromAddress && !showAdvanced) {
      // Use the recipient email address as the default from address
      setSelectedFromAddress(emailDetails.recipient)
    }
  }, [emailDetails, selectedFromAddress, showAdvanced])

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
    
    // Extract the original sender's email address
    const originalSenderAddress = emailDetails?.addresses.from?.addresses?.[0]?.address || 
                                 (emailDetails?.from.includes('<') ? 
                                  emailDetails.from.split('<')[1].replace('>', '') : 
                                  emailDetails?.from)
    
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
            <div className="text-muted-foreground">Loading email...</div>
          </div>
        </div>
      </div>
    )
  }

  if (emailError || !emailDetails) {
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
                <span>{emailError?.message || 'Failed to load email'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Use v2 API data structure
  const displayFrom = emailDetails.addresses.from?.text || emailDetails.from
  const displaySubject = emailDetails.subject || 'No Subject'

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

  const senderName = emailDetails.fromName || emailDetails.addresses.from?.addresses?.[0]?.name || displayFrom.split('<')[0].trim() || displayFrom.split('@')[0]
  const initials = getInitials(senderName)
  const avatarColor = getAvatarColor(senderName)

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

        {/* Email Content Card */}
        <Card className="rounded-xl overflow-hidden">
          <CardContent className="p-6">
            {/* Email Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground mb-4 tracking-tight">{displaySubject}</h1>

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <CustomInboundIcon 
                    text={initials}
                    size={40} 
                    backgroundColor={avatarColor} 
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {senderName}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        &lt;{emailDetails.addresses.from?.addresses?.[0]?.address || (displayFrom.includes('<') ? displayFrom.split('<')[1].replace('>', '') : displayFrom)}&gt;
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      to {emailDetails.recipient}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    {format(
                      emailDetails.receivedAt 
                        ? new Date(emailDetails.receivedAt) 
                        : new Date(), 
                      'MMM d, yyyy, h:mm a'
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {emailDetails.isRead && (
                      <Badge className="bg-emerald-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                        <CircleCheck className="w-3 h-3 mr-1" />
                        Read
                      </Badge>
                    )}
                    {emailDetails.metadata.hasAttachments && (
                      <Badge className="bg-blue-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                        <File2 className="w-3 h-3 mr-1" />
                        {emailDetails.metadata.attachmentCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Email Body */}
            <div className="border-t border-border pt-6">
              {emailDetails.content.htmlBody ? (
                <div 
                  className="prose prose-sm max-w-none rounded-lg new-thing"
                  style={{ 
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textAlign: 'left'
                  }}
                  dangerouslySetInnerHTML={{ __html: emailDetails.content.htmlBody }}
                />
              ) : emailDetails.content.textBody ? (
                <div 
                  className="whitespace-pre-wrap text-foreground leading-relaxed"
                  style={{ 
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textAlign: 'left'
                  }}
                >
                  {emailDetails.content.textBody}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CustomInboundIcon 
                    text="EM"
                    size={32} 
                    backgroundColor="#6b7280" 
                    className="mx-auto mb-2"
                  />
                  <p>No email content available</p>
                </div>
              )}
            </div>

            {/* Attachments */}
            <EmailAttachments 
              emailId={emailDetails.id} 
              attachments={emailDetails.content.attachments || []} 
            />

            {/* Debug Info (only in development) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-6 pt-6 border-t border-border">
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium">Debug Info</summary>
                  <div className="mt-2 space-y-2">
                    <div><strong>Parse Success:</strong> {emailDetails.metadata.parseSuccess ? 'Yes' : 'No'}</div>
                    {emailDetails.metadata.parseError && (
                      <div><strong>Parse Error:</strong> {emailDetails.metadata.parseError}</div>
                    )}
                    <div><strong>Message ID:</strong> {emailDetails.messageId}</div>
                    <div><strong>Has Text Body:</strong> {emailDetails.metadata.hasTextBody ? 'Yes' : 'No'}</div>
                    <div><strong>Has HTML Body:</strong> {emailDetails.metadata.hasHtmlBody ? 'Yes' : 'No'}</div>
                  </div>
                </details>
              </div>
            )}
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
                Your reply will include the original message quoted below your response.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 
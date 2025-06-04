"use client"

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  ArrowLeftIcon,
  CopyIcon, 
  CheckIcon, 
  FileIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  ShieldAlertIcon,
  ClockIcon,
  MailIcon,
  ReplyIcon,
  ForwardIcon,
  ArchiveIcon,
  TrashIcon,
  MoreHorizontalIcon,
  PrinterIcon,
  DownloadIcon,
  StarIcon,
  RefreshCwIcon
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
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

export default function EmailViewPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const emailId = params.id as string
  
  const [emailDetails, setEmailDetails] = useState<EmailDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState('html')

  useEffect(() => {
    if (emailId && session?.user) {
      fetchEmailDetails()
    }
  }, [emailId, session])

  // Mark email as read when viewing (non-blocking)
  useEffect(() => {
    if (emailDetails && session?.user) {
      // Mark as read in the background
      fetch(`/api/emails/${emailId}/read`, {
        method: 'POST',
      }).catch(error => {
        console.debug('Failed to mark email as read (non-critical):', error)
      })
    }
  }, [emailDetails, emailId, session])

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'received':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
            <CheckIcon className="h-3 w-3 mr-1" />
            Received
          </Badge>
        )
      case 'processing':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            Processing
          </Badge>
        )
      case 'forwarded':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors">
            <CheckIcon className="h-3 w-3 mr-1" />
            Forwarded
          </Badge>
        )
      case 'failed':
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 transition-colors">
            <ShieldXIcon className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            {status}
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

  const handleBackToMail = () => {
    router.push('/mail')
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToMail}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Mail
          </Button>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="text-muted-foreground">Loading email...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !emailDetails) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToMail}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Mail
          </Button>
        </div>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <MailIcon className="h-4 w-4" />
              <span>{error || 'Failed to load email'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchEmailDetails}
                className="ml-auto text-red-600 hover:text-red-700"
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col h-full bg-white">
      {/* Gmail-style Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToMail} className="text-gray-600 hover:bg-gray-100">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-100">
              <ArchiveIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-100">
              <TrashIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-100">
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-100">
            <ReplyIcon className="h-4 w-4 mr-2" />
            Reply
          </Button>
          <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-100">
            <ForwardIcon className="h-4 w-4 mr-2" />
            Forward
          </Button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Email Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-normal text-gray-900 mb-4">{emailDetails.subject}</h1>
            
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{
                    background: (() => {
                      const hash = emailDetails.from.split('').reduce((a, b) => {
                        a = ((a << 5) - a) + b.charCodeAt(0)
                        return a & a
                      }, 0)
                      const hue = Math.abs(hash) % 360
                      const hue2 = (hue + 30) % 360
                      return `linear-gradient(135deg, hsl(${hue}, 70%, 60%) 0%, hsl(${hue2}, 70%, 45%) 100%)`
                    })()
                  }}
                >
                  {emailDetails.from.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {emailDetails.from.split('<')[0].trim() || emailDetails.from.split('@')[0]}
                    </span>
                    <span className="text-gray-500 text-sm">
                      &lt;{emailDetails.from.includes('<') ? emailDetails.from.split('<')[1].replace('>', '') : emailDetails.from}&gt;
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    to {emailDetails.recipient}
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm text-gray-600">
                  {format(new Date(emailDetails.receivedAt), 'MMM d, yyyy, h:mm a')}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge(emailDetails.status)}
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                    <StarIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Email Body */}
          <div className="border-t border-gray-200 pt-6">
            {emailDetails.emailContent.htmlBody ? (
              <div className="prose prose-sm max-w-none">
                <iframe
                  srcDoc={emailDetails.emailContent.htmlBody}
                  className="w-full min-h-[400px] border-0"
                  sandbox="allow-same-origin"
                  title="Email Content"
                  style={{ height: 'auto' }}
                />
              </div>
            ) : emailDetails.emailContent.textBody ? (
              <div className="whitespace-pre-wrap text-gray-900 leading-relaxed">
                {emailDetails.emailContent.textBody}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <MailIcon className="h-8 w-8 mx-auto mb-2" />
                <p>No email content available</p>
              </div>
            )}
          </div>

          {/* Attachments */}
          {emailDetails.emailContent.attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                {emailDetails.emailContent.attachments.length} Attachment{emailDetails.emailContent.attachments.length > 1 ? 's' : ''}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {emailDetails.emailContent.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <FileIcon className="h-8 w-8 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{attachment.filename}</div>
                      <div className="text-xs text-gray-500">
                        {attachment.contentType} • {formatBytes(attachment.size)}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-100">
                      <DownloadIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Authentication Results - Collapsed by default */}
          <details className="mt-6 pt-6 border-t border-gray-200">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Security & Authentication Details
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {getAuthBadge(emailDetails.authResults.spf, 'spf')}
              {getAuthBadge(emailDetails.authResults.dkim, 'dkim')}
              {getAuthBadge(emailDetails.authResults.dmarc, 'dmarc')}
              {getAuthBadge(emailDetails.authResults.spam, 'spam')}
              {getAuthBadge(emailDetails.authResults.virus, 'virus')}
            </div>
          </details>

          {/* Technical Details - Collapsed by default */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Technical Details
            </summary>
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <div><span className="font-medium">Message ID:</span> {emailDetails.messageId}</div>
              <div><span className="font-medium">Processing Time:</span> {emailDetails.metadata.processingTime}ms</div>
              <div><span className="font-medium">Content Size:</span> {formatBytes(emailDetails.metadata.s3Info.contentSize)}</div>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
} 
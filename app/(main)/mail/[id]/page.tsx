import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { HiArrowLeft, HiDocumentText, HiMail, HiDownload, HiStar } from 'react-icons/hi'
import { format } from 'date-fns'
import { getEmailDetailsFromParsed, markEmailAsRead } from '@/app/actions/primary'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CustomInboundIcon } from '@/components/icons/customInbound'

interface PageProps {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    read?: string
  }>
}

export default async function EmailViewPage({ params, searchParams }: PageProps) {
  const { id: emailId } = await params
  const { read: readEmailId } = await searchParams
  
  // Get session on server
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session?.user) {
    redirect('/login')
  }

  // Handle read parameter - mark email as read if specified
  if (readEmailId) {
    try {
      console.log('Marking email as read on server:', readEmailId)
      await markEmailAsRead(readEmailId)
      console.log('Successfully marked email as read:', readEmailId)
    } catch (error) {
      console.error('Failed to mark email as read:', readEmailId, error)
    }
  }

  // Fetch email details on server using the new parsed email action
  const emailResult = await getEmailDetailsFromParsed(emailId)
  
  if (emailResult.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/mail">
              <Button variant="primary">
                <HiArrowLeft className="h-4 w-4 mr-2" />
                Back to Mail
              </Button>
            </Link>
          </div>

          <Card className="border-red-200 bg-red-50/95 backdrop-blur-sm shadow-sm rounded-xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-red-600">
                <HiMail className="h-4 w-4" />
                <span>{emailResult.error}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const emailDetails = emailResult.data!

  // Mark email as read synchronously
  try {
    await markEmailAsRead(emailId)
    console.log('Email marked as read:', emailId)
  } catch (error) {
    console.error('Failed to mark email as read:', emailId, error)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Use parsed data when available, fallback to original data
  const displayFrom = emailDetails.parsedData.fromData?.text || emailDetails.from
  const displaySubject = emailDetails.subject

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

  const senderName = emailDetails.parsedData.fromData?.addresses?.[0]?.name || displayFrom.split('<')[0].trim() || displayFrom.split('@')[0]
  const initials = getInitials(senderName)
  const avatarColor = getAvatarColor(senderName)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/mail">
            <Button variant="primary">
              <HiArrowLeft className="h-4 w-4 mr-2" />
              Back to Mail
            </Button>
          </Link>
        </div>

        {/* Email Content Card */}
        <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl overflow-hidden">
          <CardContent className="p-6">
            {/* Email Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-gray-900 mb-4 tracking-tight">{displaySubject}</h1>

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <CustomInboundIcon 
                    text={initials}
                    size={40} 
                    backgroundColor={avatarColor} 
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {senderName}
                      </span>
                      <span className="text-gray-500 text-sm">
                        &lt;{emailDetails.parsedData.fromData?.addresses?.[0]?.address || (displayFrom.includes('<') ? displayFrom.split('<')[1].replace('>', '') : displayFrom)}&gt;
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      to {emailDetails.recipient}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm text-gray-600">
                    {format(
                      emailDetails.parsedData.emailDate 
                        ? new Date(emailDetails.parsedData.emailDate) 
                        : emailDetails.receivedAt 
                          ? new Date(emailDetails.receivedAt) 
                          : new Date(), 
                      'MMM d, yyyy, h:mm a'
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                      {emailDetails.status}
                    </Badge>
                    {emailDetails.isRead && (
                      <Badge className="bg-green-100 text-green-700 border-green-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        Read
                      </Badge>
                    )}
                    {emailDetails.parsedData.hasAttachments && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        <HiDocumentText className="w-3 h-3 mr-1" />
                        {emailDetails.parsedData.attachmentCount}
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                      <HiStar className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Email Body */}
            <div className="border-t border-gray-200 pt-6">
              {emailDetails.emailContent.htmlBody ? (
                <div 
                  className="prose prose-sm max-w-none"
                  style={{ 
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textAlign: 'left'
                  }}
                  dangerouslySetInnerHTML={{ __html: emailDetails.emailContent.htmlBody }}
                />
              ) : emailDetails.emailContent.textBody ? (
                <div 
                  className="whitespace-pre-wrap text-gray-900 leading-relaxed"
                  style={{ 
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textAlign: 'left'
                  }}
                >
                  {emailDetails.emailContent.textBody}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
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
            {emailDetails.emailContent.attachments && emailDetails.emailContent.attachments.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  {emailDetails.emailContent.attachments.length} Attachment{emailDetails.emailContent.attachments.length > 1 ? 's' : ''}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {emailDetails.emailContent.attachments.map((attachment: any, index: number) => (
                    <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <HiDocumentText className="h-8 w-8 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{attachment.filename}</div>
                        <div className="text-xs text-gray-500">
                          {attachment.contentType} • {formatBytes(attachment.size || 0)}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-100">
                        <HiDownload className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Debug Info (only in development) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer font-medium">Debug Info</summary>
                  <div className="mt-2 space-y-2">
                    <div><strong>Parse Success:</strong> {emailDetails.parsedData.parseSuccess ? 'Yes' : 'No'}</div>
                    {emailDetails.parsedData.parseError && (
                      <div><strong>Parse Error:</strong> {emailDetails.parsedData.parseError}</div>
                    )}
                    <div><strong>Message ID:</strong> {emailDetails.messageId}</div>
                    <div><strong>Has Text Body:</strong> {emailDetails.parsedData.hasTextBody ? 'Yes' : 'No'}</div>
                    <div><strong>Has HTML Body:</strong> {emailDetails.parsedData.hasHtmlBody ? 'Yes' : 'No'}</div>
                  </div>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 
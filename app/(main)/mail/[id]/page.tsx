import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  ArrowLeftIcon,
  FileIcon,
  MailIcon,
  DownloadIcon,
  StarIcon
} from 'lucide-react'
import { format } from 'date-fns'
import { getEmailDetailsFromParsed, markEmailAsRead } from '@/app/actions/primary'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function EmailViewPage({ params }: PageProps) {
  const { id: emailId } = await params
  
  // Get session on server
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session?.user) {
    redirect('/login')
  }

  // Fetch email details on server using the new parsed email action
  const emailResult = await getEmailDetailsFromParsed(emailId)
  
  if (emailResult.error) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <Link href="/mail">
            <Button variant="ghost">
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Back to Mail
            </Button>
          </Link>
        </div>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <MailIcon className="h-4 w-4" />
              <span>{emailResult.error}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const emailDetails = emailResult.data!

  // Mark email as read (fire and forget)
  markEmailAsRead(emailId).catch(console.error)

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Use parsed data when available, fallback to original data
  const displayFrom = emailDetails.parsedData.fromText || emailDetails.from
  const displaySubject = emailDetails.parsedData.subject || emailDetails.subject

  return (
    <div className="flex flex-1 flex-col h-full bg-white">
      {/* Gmail-style Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <Link href="/mail">
            <Button variant="ghost" className="text-gray-600 hover:bg-gray-100">
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-auto w-full">
        <div className="max-w-4xl mx-auto p-6">
          {/* Email Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-normal text-gray-900 mb-4">{displaySubject}</h1>

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{
                    background: (() => {
                      const hash = displayFrom.split('').reduce((a, b) => {
                        a = ((a << 5) - a) + b.charCodeAt(0)
                        return a & a
                      }, 0)
                      const hue = Math.abs(hash) % 360
                      const hue2 = (hue + 30) % 360
                      return `linear-gradient(135deg, hsl(${hue}, 70%, 60%) 0%, hsl(${hue2}, 70%, 45%) 100%)`
                    })()
                  }}
                >
                  {(emailDetails.parsedData.fromName || displayFrom).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {emailDetails.parsedData.fromName || displayFrom.split('<')[0].trim() || displayFrom.split('@')[0]}
                    </span>
                    <span className="text-gray-500 text-sm">
                      &lt;{emailDetails.parsedData.fromAddress || (displayFrom.includes('<') ? displayFrom.split('<')[1].replace('>', '') : displayFrom)}&gt;
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    to {emailDetails.recipient}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-600">
                  {format(emailDetails.parsedData.emailDate ? new Date(emailDetails.parsedData.emailDate) : emailDetails.receivedAt, 'MMM d, yyyy, h:mm a')}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                    {emailDetails.status}
                  </Badge>
                  {emailDetails.isRead && (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      Read
                    </Badge>
                  )}
                  {emailDetails.parsedData.hasAttachments && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      📎 {emailDetails.parsedData.attachmentCount}
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
                    <StarIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Email Body */}
          <div className="border-t border-gray-200 pt-6 w-full mx-auto">
            {emailDetails.emailContent.htmlBody ? (
              <div 
                className="prose prose-sm max-w-none mx-auto text-center"
                dangerouslySetInnerHTML={{ __html: emailDetails.emailContent.htmlBody }}
              />
            ) : emailDetails.emailContent.textBody ? (
              <div className="whitespace-pre-wrap text-gray-900 leading-relaxed text-center">
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
          {emailDetails.emailContent.attachments && emailDetails.emailContent.attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                {emailDetails.emailContent.attachments.length} Attachment{emailDetails.emailContent.attachments.length > 1 ? 's' : ''}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {emailDetails.emailContent.attachments.map((attachment: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <FileIcon className="h-8 w-8 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{attachment.filename}</div>
                      <div className="text-xs text-gray-500">
                        {attachment.contentType} • {formatBytes(attachment.size || 0)}
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
        </div>
      </div>
    </div>
  )
} 
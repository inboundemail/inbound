'use client'

import { useState, useEffect } from 'react'
import { getEmail, replyToEmail } from '@/app/actions/emails'
import type { GetMailByIdResponse } from '@inboundemail/sdk'
import { Button } from './button'
import { ReplyForm } from './reply-form'

interface EmailDetailProps {
  emailId: string
  onBack?: () => void
}

export function EmailDetail({ emailId, onBack }: EmailDetailProps) {
  const [email, setEmail] = useState<GetMailByIdResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showReplyForm, setShowReplyForm] = useState(false)

  useEffect(() => {
    const loadEmail = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await getEmail(emailId)
        if (result.success && result.data) {
          setEmail(result.data)
        } else {
          setError(result.error || 'Failed to load email')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    loadEmail()
  }, [emailId])

  const handleReply = async (replyData: {
    from?: string
    text?: string
    html?: string
    subject?: string
  }) => {
    try {
      const result = await replyToEmail(emailId, replyData)
      if (result.success) {
        setShowReplyForm(false)
        // You might want to show a success message here
        alert('Reply sent successfully!')
      } else {
        alert(`Failed to send reply: ${result.error}`)
      }
    } catch (err) {
      alert(`Error sending reply: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading email...</p>
        </div>
      </div>
    )
  }

  if (error || !email) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Email not found'}</p>
          <Button onClick={onBack} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  const formatDate = (date: Date | string) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date))
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <Button onClick={onBack} variant="outline" size="sm">
          ← Back to Emails
        </Button>
        <Button 
          onClick={() => setShowReplyForm(!showReplyForm)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {showReplyForm ? 'Cancel Reply' : 'Reply'}
        </Button>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        {/* Email Header */}
        <div className="p-6 border-b bg-gray-50">
          <h1 className="text-2xl font-bold mb-4">{email.subject || '(No Subject)'}</h1>
          
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">From:</span> {email.from}
            </div>
            <div>
              <span className="font-medium">To:</span> {email.to}
            </div>
            <div>
              <span className="font-medium">Received:</span> {formatDate(email.receivedAt)}
            </div>
            {email.attachments && email.attachments.length > 0 && (
              <div>
                <span className="font-medium">Attachments:</span> {email.attachments.length} file(s)
              </div>
            )}
          </div>
        </div>

        {/* Email Content */}
        <div className="p-6">
          {email.htmlBody ? (
            <div 
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: email.htmlBody }}
            />
          ) : (
            <div className="whitespace-pre-wrap font-mono text-sm">
              {email.textBody || 'No content available'}
            </div>
          )}
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="p-6 border-t bg-gray-50">
            <h3 className="font-medium mb-3">Attachments</h3>
            <div className="space-y-2">
              {email.attachments.map((attachment, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <span>📎</span>
                  <span>{attachment.filename || `Attachment ${index + 1}`}</span>
                  {attachment.size && (
                    <span className="text-gray-500">({attachment.size} bytes)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reply Form */}
      {showReplyForm && (
        <div className="mt-6">
          <ReplyForm
            originalEmail={email}
            onSubmit={handleReply}
            onCancel={() => setShowReplyForm(false)}
          />
        </div>
      )}
    </div>
  )
} 
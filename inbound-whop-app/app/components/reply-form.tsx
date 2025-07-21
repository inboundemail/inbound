'use client'

import { useState } from 'react'
import type { GetMailByIdResponse } from '@inboundemail/sdk'
import { Button } from './button'

interface ReplyFormProps {
  originalEmail: GetMailByIdResponse
  onSubmit: (replyData: {
    from?: string
    text?: string
    html?: string
    subject?: string
  }) => Promise<void>
  onCancel: () => void
}

export function ReplyForm({ originalEmail, onSubmit, onCancel }: ReplyFormProps) {
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState(
    originalEmail.subject?.startsWith('Re: ') 
      ? originalEmail.subject 
      : `Re: ${originalEmail.subject || '(No Subject)'}`
  )
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!from.trim() || !message.trim()) {
      alert('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)
    
    try {
      await onSubmit({
        from: from.trim(),
        subject: subject.trim(),
        text: message.trim()
      })
    } catch (error) {
      console.error('Error submitting reply:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Reply to Email</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="from" className="block text-sm font-medium text-gray-700 mb-1">
            From Email Address *
          </label>
          <input
            type="email"
            id="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="your-email@domain.com"
            required
          />
        </div>

        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
            Subject
          </label>
          <input
            type="text"
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            Message *
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
            placeholder="Type your reply here..."
            required
          />
        </div>

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? 'Sending...' : 'Send Reply'}
          </Button>
          <Button
            type="button"
            onClick={onCancel}
            variant="outline"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>

      <div className="mt-6 pt-4 border-t">
        <details className="text-sm text-gray-600">
          <summary className="cursor-pointer font-medium">Original Message</summary>
          <div className="mt-2 p-3 bg-gray-50 rounded border-l-4 border-gray-300">
            <div className="mb-2">
              <strong>From:</strong> {originalEmail.from}<br/>
              <strong>To:</strong> {originalEmail.to}<br/>
              <strong>Subject:</strong> {originalEmail.subject}
            </div>
            <div className="whitespace-pre-wrap text-xs">
              {originalEmail.textBody || 'No text content available'}
            </div>
          </div>
        </details>
      </div>
    </div>
  )
} 
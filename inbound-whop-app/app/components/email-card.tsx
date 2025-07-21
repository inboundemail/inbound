'use client'

import type { EmailItem } from '@inboundemail/sdk'
import { cn } from '@/lib/utils'

interface EmailCardProps {
  email: EmailItem
  onClick?: () => void
}

export function EmailCard({ email, onClick }: EmailCardProps) {
  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d)
  }

  return (
    <div
      className={cn(
        "p-4 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50",
        !email.isRead && "border-l-4 border-l-blue-500 bg-blue-50/30",
        email.isArchived && "opacity-60"
      )}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "font-medium truncate",
              !email.isRead && "font-semibold"
            )}>
              {email.fromName || email.from}
            </span>
            {email.hasAttachments && (
              <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                📎 {email.attachmentCount}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 truncate">{email.recipient}</p>
        </div>
        <div className="text-xs text-gray-500 ml-4">
          {formatDate(email.receivedAt)}
        </div>
      </div>

      <div className="mb-2">
        <h3 className={cn(
          "text-sm truncate",
          !email.isRead && "font-semibold"
        )}>
          {email.subject || '(No Subject)'}
        </h3>
      </div>

      <p className="text-sm text-gray-600 line-clamp-2">
        {email.preview}
      </p>

      <div className="flex justify-between items-center mt-3">
        <div className="flex gap-2">
          {!email.isRead && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Unread
            </span>
          )}
          {email.isArchived && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Archived
            </span>
          )}
          {email.parseSuccess === false && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
              Parse Error
            </span>
          )}
        </div>
        
        <button className="text-xs text-blue-600 hover:text-blue-800">
          View Details →
        </button>
      </div>
    </div>
  )
} 
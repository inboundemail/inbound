'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import File2 from '@/components/icons/file-2'

interface EmailListItemProps {
  email: {
    id: string
    from: string
    subject: string
    receivedAt: string | undefined
    isRead: boolean
    parsedData: {
      fromData: any
      preview: string
      hasAttachments: boolean
      htmlContent?: string | null
      textContent?: string | null
    }
  }
}

export function EmailListItem({ email }: EmailListItemProps) {
  // Get sender name
  const senderName = email.parsedData.fromData?.addresses?.[0]?.name ||
    email.from.split('@')[0] ||
    email.from.split('<')[0] ||
    email.from

  const preview = email.parsedData.preview || 'No preview available'

  return (
    <Link
      href={`/mail/${email.id}`}
      className={`block w-full px-6 py-3 hover:bg-accent/50 transition-colors duration-200 group ${
        !email.isRead ? 'bg-primary/5 border-l-4 border-l-primary' : ''
      }`}
    >
      <div className="flex items-center gap-4 relative">
        {/* Name Column */}
        <div className="w-40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate text-foreground text-sm ${!email.isRead ? 'font-semibold' : ''}`}>
              {senderName}
            </span>
            {!email.isRead && (
              <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
            )}
          </div>
        </div>
        
        {/* Subject + Preview (flowing) */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 text-sm">
            <span className={`font-medium flex-shrink-0 text-foreground ${!email.isRead ? 'font-semibold' : ''}`}>
              {email.subject}
            </span>
            <span className="text-muted-foreground/80 truncate">
              — {preview}
            </span>
            {email.parsedData.hasAttachments && (
              <File2 width="14" height="14" className="text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </div>
        
        {/* Time Column */}
        <div className="w-24 flex-shrink-0 text-right">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(email.receivedAt || new Date()), { addSuffix: true })}
          </span>
        </div>
      </div>
    </Link>
  )
} 
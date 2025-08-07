'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import File2 from '@/components/icons/file-2'
import { Checkbox } from '@/components/ui/checkbox'
import { useUpdateEmailMutation } from '@/features/emails/hooks'

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
  isSelectMode?: boolean
  isSelected?: boolean
  onSelect?: (emailId: string, checked: boolean) => void
  threadCount?: number
}

export function EmailListItem({ email, isSelectMode = false, isSelected = false, onSelect, threadCount }: EmailListItemProps) {
  const updateEmailMutation = useUpdateEmailMutation()

  // Get sender name
  const senderName = email.parsedData.fromData?.addresses?.[0]?.name ||
    email.from.split('@')[0] ||
    email.from.split('<')[0] ||
    email.from

  const preview = email.parsedData.preview || 'No preview available'

  const handleCheckboxChange = (checked: boolean | 'indeterminate') => {
    if (onSelect) {
      onSelect(email.id, checked === true)
    }
  }

  const handleEmailClick = () => {
    // Optimistically mark as read when clicking on the email
    if (!email.isRead) {
      updateEmailMutation.mutate({
        emailId: email.id,
        updates: { isRead: true }
      })
    }
  }

  const content = (
    <div className="flex items-center gap-4 relative">
      {/* Selection checkbox */}
      {isSelectMode && (
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
          />
        </div>
      )}
      
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
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`font-medium text-foreground ${!email.isRead ? 'font-semibold' : ''}`}>
                {email.subject}
              </span>
              {threadCount && threadCount > 1 && (
                <span className="bg-muted-foreground/20 text-muted-foreground text-xs px-1.5 py-0.5 rounded-md font-medium">
                  {threadCount}
                </span>
              )}
            </div>
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
    )

  if (isSelectMode) {
    return (
      <div
        className={`block w-full px-6 py-3 hover:bg-accent/50 transition-colors duration-200 group cursor-pointer 
        } ${isSelected ? 'bg-accent/30' : ''}`}
        onClick={() => handleCheckboxChange(!isSelected)}
      >
        {content}
      </div>
    )
  }

  return (
    <Link
      href={`/mail/${email.id}`}
      className={`block w-full px-6 py-3 hover:bg-accent/50 transition-colors duration-200 group ${
        !email.isRead ? 'bg-primary/5 border-l-4 border-l-primary' : ''
      }`}
      onClick={handleEmailClick}
    >
      {content}
    </Link>
  )
} 
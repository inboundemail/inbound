"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import Clipboard2 from '@/components/icons/clipboard-2'
import CircleCheck from '@/components/icons/circle-check'

interface CopyEmailIdProps {
  emailId: string
  label?: string
}

export function CopyEmailId({ emailId, label = "Email ID" }: CopyEmailIdProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(emailId)
      setCopied(true)
      toast.success('Email ID copied to clipboard')
      
      // Reset the checkmark after 2 seconds
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch (error) {
      toast.error('Failed to copy email ID')
    }
  }

  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>
      <div className="flex items-center gap-2 mt-1">
        <code className="font-mono text-sm bg-muted px-2 py-1 rounded flex-1">
          {emailId}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0"
          title="Copy email ID"
        >
          {copied ? (
            <CircleCheck width="16" height="16" className="text-green-600" />
          ) : (
            <Clipboard2 width="16" height="16" className="text-muted-foreground" />
          )}
        </Button>
      </div>
    </div>
  )
}

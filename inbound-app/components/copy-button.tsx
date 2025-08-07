"use client"

import { Button } from "@/components/ui/button"
import Clipboard2 from "@/components/icons/clipboard-2"

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
}

export function CopyButton({ text, label, className }: CopyButtonProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      // Could add toast notification here
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={`h-6 px-2 text-xs hover:bg-slate-100 ${className || ''}`}
      title={`Copy ${label || text}`}
    >
      <Clipboard2 width="12" height="12" />
    </Button>
  )
} 
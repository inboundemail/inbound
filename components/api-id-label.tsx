"use client"

import { CopyButton } from "@/components/copy-button"
import { toast } from "sonner"

interface ApiIdLabelProps {
  id: string
  className?: string
  size?: 'sm' | 'md'
}

export function ApiIdLabel({ id, className = "", size = 'sm' }: ApiIdLabelProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success('API ID copied to clipboard')
    } catch (err) {
      toast.error('Failed to copy API ID')
    }
  }

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm'
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className={`text-muted-foreground font-mono ${sizeClasses[size]}`}>
        API ID:
      </span>
      <button
        onClick={handleCopy}
        className={`font-mono ${sizeClasses[size]} text-foreground hover:text-primary transition-colors cursor-pointer select-all`}
        title="Click to copy API ID"
      >
        {id}
      </button>
    </div>
  )
}

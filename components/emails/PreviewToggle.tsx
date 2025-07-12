'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import Eye2 from '@/components/icons/eye-2'

export function PreviewToggle() {
  const [isEnabled, setIsEnabled] = useState(true)

  useEffect(() => {
    // Load preference from localStorage
    const stored = localStorage.getItem('emailPreviewEnabled')
    if (stored !== null) {
      setIsEnabled(stored === 'true')
    }
  }, [])

  const handleToggle = () => {
    const newState = !isEnabled
    setIsEnabled(newState)
    localStorage.setItem('emailPreviewEnabled', newState.toString())
    // Dispatch custom event so EmailListItem components can react
    window.dispatchEvent(new CustomEvent('emailPreviewToggled', { detail: newState }))
  }

  return (
    <Button
      variant={isEnabled ? "primary" : "outline"}
      size="sm"
      onClick={handleToggle}
      className="flex items-center gap-2 px-3 rounded-xl transition-colors"
    >
      <Eye2 />
      <span className="text-xs font-medium">Toggle Preview</span>
    </Button>
  )
} 
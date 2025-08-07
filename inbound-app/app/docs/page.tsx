"use client"

import { useEffect } from 'react'

export default function DocsPage() {
  useEffect(() => {
    window.location.href = 'https://docs.inbound.new'
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-lg text-muted-foreground">Redirecting to documentation...</p>
      </div>
    </div>
  )
}
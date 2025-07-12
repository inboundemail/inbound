'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [showPreview, setShowPreview] = useState(false)
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const previewRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get sender name
  const senderName = email.parsedData.fromData?.addresses?.[0]?.name ||
    email.from.split('@')[0] ||
    email.from.split('<')[0] ||
    email.from

  const preview = email.parsedData.preview || 'No preview available'

  // Check localStorage on mount and listen for changes
  useEffect(() => {
    const checkPreviewEnabled = () => {
      const stored = localStorage.getItem('emailPreviewEnabled')
      setPreviewEnabled(stored !== 'false') // Default to true if not set
    }
    
    checkPreviewEnabled()
    
    // Listen for toggle changes
    const handleToggle = (e: Event) => {
      const customEvent = e as CustomEvent
      setPreviewEnabled(customEvent.detail)
    }
    
    window.addEventListener('emailPreviewToggled', handleToggle)
    return () => window.removeEventListener('emailPreviewToggled', handleToggle)
  }, [])

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!previewEnabled) return
    if (!email.parsedData.htmlContent && !email.parsedData.textContent) return
    
    setIsLoading(true)
    setShowPreview(true)
    setMousePosition({ x: e.clientX, y: e.clientY })
    
    // Simulate loading time for iframe
    loadingTimeoutRef.current = setTimeout(() => {
      setIsLoading(false)
    }, 200)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!showPreview) return
    setMousePosition({ x: e.clientX, y: e.clientY })
  }

  const handleMouseLeave = () => {
    setShowPreview(false)
    setIsLoading(true)
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current)
    }
  }

  // Calculate preview position based on available space
  useEffect(() => {
    if (!showPreview || !previewRef.current) return

    const preview = previewRef.current
    const previewWidth = 384 // w-96
    const previewHeight = 384 // h-96
    const padding = 20
    
    let x = mousePosition.x + padding
    let y = mousePosition.y - previewHeight / 2
    
    // If mouse position is 0,0 (not available), show in bottom right
    if (mousePosition.x === 0 && mousePosition.y === 0) {
      x = window.innerWidth - previewWidth - padding
      y = window.innerHeight - previewHeight - padding
      setPreviewPosition({ x, y })
      return
    }
    
    // Check if preview would go off right edge
    if (x + previewWidth > window.innerWidth - padding) {
      // Try to show it on the left of the cursor
      x = mousePosition.x - previewWidth - padding
      
      // If that would go off left edge, just pin to right edge
      if (x < padding) {
        x = window.innerWidth - previewWidth - padding
      }
    }
    
    // Check if preview would go off bottom edge
    if (y + previewHeight > window.innerHeight - padding) {
      y = window.innerHeight - previewHeight - padding
    }
    
    // Check if preview would go off top edge
    if (y < padding) {
      y = padding
    }
    
    setPreviewPosition({ x, y })
  }, [showPreview, mousePosition])

  return (
    <>
      <Link
        ref={linkRef}
        href={`/mail/${email.id}`}
        className={`block w-full px-6 py-3 hover:bg-accent/50 transition-colors duration-200 group ${
          !email.isRead ? 'bg-primary/5 border-l-4 border-l-primary' : ''
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
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

      {/* HTML Preview Popup */}
      {showPreview && (email.parsedData.htmlContent || email.parsedData.textContent) && (
        <div
          ref={previewRef}
          className="fixed z-50 w-96 h-96 bg-card border border-border rounded-lg shadow-2xl overflow-hidden pointer-events-none transition-opacity duration-200"
          style={{
            left: `${previewPosition.x}px`,
            top: `${previewPosition.y}px`,
            opacity: isLoading ? 0.8 : 1,
          }}
        >
          <div className="p-4 h-full flex flex-col">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Email Preview</div>
            <div className="flex-1 overflow-hidden rounded border border-border bg-background relative">
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Loading preview...</span>
                  </div>
                </div>
              )}
              
              {email.parsedData.htmlContent ? (
                <iframe
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                          * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                          }
                          body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            font-size: 13px;
                            line-height: 1.5;
                            color: #333;
                            padding: 16px;
                            background: white;
                            word-wrap: break-word;
                            overflow-wrap: break-word;
                          }
                          img {
                            max-width: 100%;
                            height: auto;
                          }
                          table {
                            border-collapse: collapse;
                            max-width: 100%;
                          }
                          a {
                            color: #0066cc;
                            text-decoration: none;
                          }
                          a:hover {
                            text-decoration: underline;
                          }
                          /* Dark mode support */
                          @media (prefers-color-scheme: dark) {
                            body {
                              background: #1a1a1a;
                              color: #e0e0e0;
                            }
                            a {
                              color: #4da3ff;
                            }
                          }
                        </style>
                      </head>
                      <body>
                        ${email.parsedData.htmlContent}
                      </body>
                    </html>
                  `}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="Email Preview"
                  onLoad={() => setIsLoading(false)}
                />
              ) : (
                <div className="p-4 h-full overflow-auto">
                  <pre className="whitespace-pre-wrap text-xs font-mono">{email.parsedData.textContent}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
} 
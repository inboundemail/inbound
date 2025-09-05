/**
 * Sandboxed Email Content Viewer
 * 
 * Renders email HTML content in a secure iframe sandbox to prevent:
 * - Style bleeding into the main application
 * - XSS attacks through malicious email content
 * - Script execution from email content
 * - Font and CSS pollution
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import DOMPurify from 'dompurify'

interface SandboxedEmailViewerProps {
  htmlContent?: string | null
  textContent?: string | null
  className?: string
  minHeight?: number
  maxHeight?: number
  onContentLoad?: () => void
  onContentError?: (error: string) => void
}

export function SandboxedEmailViewer({
  htmlContent,
  textContent,
  className,
  minHeight = 200,
  maxHeight = 800,
  onContentLoad,
  onContentError
}: SandboxedEmailViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [iframeHeight, setIframeHeight] = useState(minHeight)

  // Sanitize and prepare content for iframe
  const prepareContent = useCallback(() => {
    if (!htmlContent && !textContent) {
      return '<p style="color: #6b7280; text-align: center; padding: 2rem;">No content available</p>'
    }

    let content = htmlContent || textContent || ''
    
    // Enhanced HTML sanitization
    if (htmlContent) {
      content = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: [
          'p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 'ins', 'sub', 'sup',
          'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img', 'table',
          'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption'
        ],
        ALLOWED_ATTR: [
          'href', 'title', 'alt', 'src', 'width', 'height', 'style', 'class',
          'id', 'data-*', 'colspan', 'rowspan', 'cellpadding', 'cellspacing'
        ],
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        ALLOW_DATA_ATTR: true,
        SANITIZE_DOM: true,
        KEEP_CONTENT: true,
        FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style', 'meta', 'base'],
        FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur']
      })
    } else if (textContent) {
      // Convert plain text to HTML with proper escaping
      content = textContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\n/g, '<br>')
      
      content = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${content}</pre>`
    }

    // Create complete HTML document for iframe
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; img-src data: https: http: blob:; style-src 'unsafe-inline' data: https: http:; font-src data: https: http:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">
          <title>Email Content</title>
          <style>
            /* Minimal reset - let email styles take precedence */
            body {
              margin: 0;
              padding: 16px;
              word-wrap: break-word;
              overflow-wrap: break-word;
              font-family: 'Outfit', sans-serif;
            }
            
            /* Ensure images are responsive */
            img {
              max-width: 100%;
              height: auto;
            }
            
            /* Ensure tables don't break layout */
            table {
              max-width: 100%;
            }
          </style>
          <script>
            // Auto-resize functionality
            function updateHeight() {
              const height = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
                ${minHeight}
              );
              
              window.parent.postMessage({
                type: 'IFRAME_HEIGHT_UPDATE',
                height: Math.min(height, ${maxHeight})
              }, '*');
            }
            
            // Report loading status
            window.addEventListener('load', function() {
              updateHeight();
              window.parent.postMessage({ type: 'IFRAME_LOADED' }, '*');
            });
            
            window.addEventListener('error', function(e) {
              window.parent.postMessage({ 
                type: 'IFRAME_ERROR', 
                error: e.message || 'Content loading error' 
              }, '*');
            });
            
            // Update height on content changes
            if (window.ResizeObserver) {
              const resizeObserver = new ResizeObserver(updateHeight);
              document.addEventListener('DOMContentLoaded', function() {
                resizeObserver.observe(document.body);
              });
            }
            
            // Fallback height update
            setTimeout(updateHeight, 100);
            setTimeout(updateHeight, 500);
          </script>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `
  }, [htmlContent, textContent, minHeight, maxHeight])

  // Handle iframe messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (event.source !== iframeRef.current?.contentWindow) return

      switch (event.data?.type) {
        case 'IFRAME_HEIGHT_UPDATE':
          setIframeHeight(event.data.height)
          break
        case 'IFRAME_LOADED':
          setIsLoading(false)
          onContentLoad?.()
          break
        case 'IFRAME_ERROR':
          setError(event.data.error)
          setIsLoading(false)
          onContentError?.(event.data.error)
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onContentLoad, onContentError])

  // Handle iframe load errors
  const handleIframeError = useCallback(() => {
    setError('Failed to load email content')
    setIsLoading(false)
    onContentError?.('Failed to load email content')
  }, [onContentError])

  if (error) {
    return (
      <div className={cn(
        "flex items-center justify-center p-8 text-center",
        "border border-red-200 bg-red-50 rounded-lg",
        className
      )}>
        <div className="text-red-600">
          <svg className="h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm font-medium">Unable to display email content</p>
          <p className="text-xs text-red-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg z-10">
          <div className="flex items-center space-x-2 text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
            <span className="text-sm">Loading email content...</span>
          </div>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        srcDoc={prepareContent()}
        title="Email Content"
        width="100%"
        height={iframeHeight}
        style={{ 
          minHeight: minHeight,
          maxHeight: maxHeight,
          border: 'none',
          borderRadius: '6px',
          backgroundColor: 'transparent'
        }}
        sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads"
        loading="lazy"
        onError={handleIframeError}
        className="transition-all duration-200"
      />
    </div>
  )
}

export default SandboxedEmailViewer

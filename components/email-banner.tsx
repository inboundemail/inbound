import React from 'react'
import { Button } from '@/components/ui/button'

interface EmailBannerProps {
  recipientEmail: string
  senderEmail: string
  className?: string
}

export function EmailBanner({ recipientEmail, senderEmail, className = '' }: EmailBannerProps) {
  const blockUrl = `https://inbound.new/addtoblocklist?email=${encodeURIComponent(senderEmail)}`

  return (
    <div className={`w-full bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between ${className}`}>
      {/* Left side - Logo and recipient info */}
      <div className="flex items-center space-x-3">
        <img 
          src="/inbound-wordmark.png" 
          alt="Inbound" 
          className="h-6 w-auto"
        />
        <div className="text-sm text-gray-600">
          <span className="text-gray-500">sent to</span>{' '}
          <span className="font-medium text-gray-700">{recipientEmail}</span>
        </div>
      </div>

      {/* Right side - Block button */}
      <div className="flex items-center">
        <Button
          asChild
          variant="primary"
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700"
        >
          <a 
            href={blockUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium"
          >
            block this address
          </a>
        </Button>
      </div>
    </div>
  )
}

// HTML version for email templates
export function generateEmailBannerHTML(recipientEmail: string, senderEmail: string): string {
  const blockUrl = `https://inbound.new/addtoblocklist?email=${encodeURIComponent(senderEmail)}`
  
  return `
    <div style="
      width: 100%;
      background-color: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin-top: 20px;
    ">
      <!-- Left side - Logo and recipient info -->
      <div style="display: flex; align-items: center; gap: 12px;">
        <img 
          src="https://inbound.new/inbound-wordmark.png" 
          alt="Inbound" 
          style="height: 24px; width: auto;"
        />
        <div style="font-size: 14px; color: #4b5563;">
          <span style="color: #6b7280;">sent to</span>
          <span style="font-weight: 500; color: #374151; margin-left: 4px;">${recipientEmail}</span>
        </div>
      </div>

      <!-- Right side - Block button -->
      <div>
        <a 
          href="${blockUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="
            display: inline-block;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            border: 1px solid #2563eb;
            transition: background-color 0.2s;
          "
          onmouseover="this.style.backgroundColor='#1d4ed8'"
          onmouseout="this.style.backgroundColor='#2563eb'"
        >
          block this address
        </a>
      </div>
    </div>
  `
} 
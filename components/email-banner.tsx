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
    <div className={`max-w-2xl mx-auto mt-5 bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between shadow-sm ${className}`}>
      {/* Left side - Logo only */}
      <div className="flex items-center">
        <img 
          src="/inbound-wordmark.png" 
          alt="Inbound" 
          className="h-10 w-auto"
        />
      </div>

      {/* Right side - Block button with sender info */}
      <div className="flex items-center">
        <Button
          asChild
          variant="primary"
          size="sm"
          className="bg-purple-500 hover:bg-purple-600 text-white border-purple-500 hover:border-purple-600 rounded-lg px-4 py-3 whitespace-nowrap"
        >
          <a 
            href={blockUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium"
          >
            Block {senderEmail}
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
      max-width: 600px;
      margin: 20px auto 0 auto;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    ">
      <!-- Left side - Logo only -->
      <div style="display: flex; align-items: center;">
        <img 
          src="https://inbound.new/inbound-wordmark.png" 
          alt="Inbound" 
          style="height: 40px; width: auto;"
        />
      </div>

      <!-- Right side - Block button with recipient info -->
      <div>
        <a 
          href="${blockUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="
            display: inline-block;
            background-color: #8b5cf6;
            color: white;
            text-decoration: none;
            padding: 12px 18px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            border: 1px solid #8b5cf6;
            transition: background-color 0.2s;
            white-space: nowrap;
          "
          onmouseover="this.style.backgroundColor='#7c3aed'"
          onmouseout="this.style.backgroundColor='#8b5cf6'"
        >
          Block ${senderEmail}
        </a>
      </div>
    </div>
  `
} 
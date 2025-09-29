// Example API endpoint for attachment extraction
// app/api/emails/[emailId]/attachments/[filename]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { extractEmailAttachment, extractEmailAttachmentByContentId } from '@/app/actions/primary'

interface RouteParams {
  emailId: string
  filename: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const { emailId, filename } = params
    const { searchParams } = new URL(request.url)
    const contentId = searchParams.get('contentId')
    const download = searchParams.get('download') === 'true'

    console.log('Extracting attachment:', { emailId, filename, contentId, download })

    // Extract by contentId if provided, otherwise by filename
    const result = contentId 
      ? await extractEmailAttachmentByContentId(emailId, contentId)
      : await extractEmailAttachment(emailId, filename)

    if (result.error) {
      return NextResponse.json(
        { error: result.error }, 
        { status: result.error === 'Unauthorized' ? 401 : 404 }
      )
    }

    const attachment = result.data
    if (!attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' }, 
        { status: 404 }
      )
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(attachment.content, 'base64')

    // Set appropriate headers
    const headers: HeadersInit = {
      'Content-Type': attachment.contentType || 'application/octet-stream',
      'Content-Length': buffer.length.toString(),
    }

    if (download) {
      // Force download
      headers['Content-Disposition'] = `attachment; filename="${attachment.filename}"`
    } else {
      // Inline display (for images, PDFs, etc.)
      headers['Content-Disposition'] = `inline; filename="${attachment.filename}"`
    }

    return new NextResponse(buffer, { headers })

  } catch (error) {
    console.error('Error in attachment endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Usage examples:
// GET /api/emails/email123/attachments/document.pdf
// GET /api/emails/email123/attachments/image.jpg?download=true
// GET /api/emails/email123/attachments/inline-image.png?contentId=<abc123>

/* 
Frontend usage:

// Download attachment
const downloadUrl = `/api/emails/${emailId}/attachments/${filename}?download=true`
window.open(downloadUrl, '_blank')

// Display inline image
const imageUrl = `/api/emails/${emailId}/attachments/${filename}`
<img src={imageUrl} alt={filename} />

// Extract by contentId (for inline images in HTML emails)
const inlineImageUrl = `/api/emails/${emailId}/attachments/image.png?contentId=${contentId}`

// Direct fetch for processing
const response = await fetch(`/api/emails/${emailId}/attachments/${filename}`)
const blob = await response.blob()
// Process blob...
*/

// Alternative JSON endpoint that returns metadata + base64 content
// app/api/emails/[emailId]/attachments/[filename]/data/route.ts

export async function GET(
  request: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const { emailId, filename } = params
    const { searchParams } = new URL(request.url)
    const contentId = searchParams.get('contentId')

    // Extract attachment data
    const result = contentId 
      ? await extractEmailAttachmentByContentId(emailId, contentId)
      : await extractEmailAttachment(emailId, filename)

    if (result.error) {
      return NextResponse.json(
        { error: result.error }, 
        { status: result.error === 'Unauthorized' ? 401 : 404 }
      )
    }

    // Return full attachment data as JSON
    return NextResponse.json({
      success: true,
      data: result.data
    })

  } catch (error) {
    console.error('Error in attachment data endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/*
Frontend usage for JSON endpoint:

const response = await fetch(`/api/emails/${emailId}/attachments/${filename}/data`)
const result = await response.json()

if (result.success) {
  const attachment = result.data
  console.log('Filename:', attachment.filename)
  console.log('Content Type:', attachment.contentType)
  console.log('Size:', attachment.size)
  console.log('Base64 Content:', attachment.content)
  
  // Convert to blob
  const byteCharacters = atob(attachment.content)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: attachment.contentType })
  
  // Use blob for whatever you need
}
*/
# Getting Attachment Content from Webhook Payload

## The Problem

Your webhook payload contains **attachment metadata only**:
```json
{
  "filename": "email1.eml",
  "contentType": "message/rfc822", 
  "size": 12248,
  "contentId": "<f_mg4gbd9y0>",
  "contentDisposition": "attachment"
}
```

**The metadata tells you WHAT attachments exist, but not the actual file content.**

## The Solution

To get the actual attachment content, you need to parse the full raw email. Here are the available methods:

### Method 1: Use the New Attachment Extractor (Recommended)

```typescript
import { 
  extractEmailAttachment, 
  extractEmailAttachmentByContentId, 
  getEmailAttachments 
} from '@/app/actions/primary'

// Get all attachments with availability info
const attachmentsResult = await getEmailAttachments(emailId)
if (attachmentsResult.success) {
  console.log('Available attachments:', attachmentsResult.data)
  // [{ filename: "email1.eml", contentType: "message/rfc822", size: 12248, hasContent: true }, ...]
}

// Extract specific attachment by filename
const attachmentResult = await extractEmailAttachment(emailId, "email1.eml")
if (attachmentResult.success) {
  const attachment = attachmentResult.data
  // attachment.content contains the base64-encoded file content
  console.log('Attachment content (base64):', attachment.content)
  
  // Convert to blob for download
  const blob = new Blob([atob(attachment.content)], { type: attachment.contentType })
  // ... use blob for download or processing
}

// Extract by contentId (useful for inline images)
const inlineResult = await extractEmailAttachmentByContentId(emailId, "<f_mg4gbd9y0>")
if (inlineResult.success) {
  const inlineAttachment = inlineResult.data
  // Same structure with base64 content
}
```

### Method 2: Use the Existing Download Function

```typescript
import { downloadAttachment } from '@/app/actions/primary'

// This function already exists and works well
const result = await downloadAttachment(emailId, "email1.eml")
if (result.success) {
  const attachment = result.data
  console.log('Attachment content (base64):', attachment.content)
}
```

### Method 3: Direct Email Parsing (Advanced)

```typescript
import { extractAttachmentContent } from '@/lib/email-management/attachment-extractor'

// If you have the raw email content
const attachments = await extractAttachmentContent(rawEmailContent)
attachments.forEach(att => {
  console.log(`File: ${att.filename}`)
  console.log(`Content: ${att.content}`) // Buffer with actual file content
})

// Extract specific file
const specificAttachment = await extractAttachmentByFilename(rawEmailContent, "email1.eml")
if (specificAttachment) {
  console.log('File content as Buffer:', specificAttachment.content)
  console.log('File content as base64:', specificAttachment.content.toString('base64'))
}
```

## Data Flow

1. **Email arrives** → Stored in S3 by AWS SES
2. **Webhook triggered** → Contains attachment metadata only
3. **To get content** → Parse full email from S3/database
4. **Extract attachment** → Use `mailparser` to get actual file content

## Email Service Provider Patterns

### AWS SES (Your Current Setup)
- ✅ **Metadata**: Available in webhook payload
- ✅ **Content**: Must parse full email from S3
- ✅ **Your functions handle this automatically**

### Other Email Services
- **Mailgun**: Can include attachment content directly or provide URLs
- **SendGrid**: Similar to AWS SES, usually requires parsing full email
- **Postmark**: Provides attachment content in webhook payload

## Usage Examples

### Download Attachment as File
```typescript
const result = await extractEmailAttachment(emailId, filename)
if (result.success) {
  // Convert base64 to blob and trigger download
  const byteCharacters = atob(result.data.content)
  const byteNumbers = new Array(byteCharacters.length)
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: result.data.contentType })
  
  // Create download link
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = result.data.filename
  link.click()
  window.URL.revokeObjectURL(url)
}
```

### Display Inline Image
```typescript
const result = await extractEmailAttachmentByContentId(emailId, contentId)
if (result.success) {
  const dataUrl = `data:${result.data.contentType};base64,${result.data.content}`
  
  // Use in img tag
  const img = document.createElement('img')
  img.src = dataUrl
  img.alt = result.data.filename
}
```

### Process Text Content
```typescript
const result = await extractEmailAttachment(emailId, "document.txt")
if (result.success) {
  // Decode base64 to text
  const textContent = atob(result.data.content)
  console.log('File content:', textContent)
}
```

## Key Points

1. **Webhook payload = metadata only** (filename, size, type, etc.)
2. **Actual content = requires parsing full email** from S3/storage
3. **Your system handles this** with the functions above
4. **Content returned as base64** for easy transfer and processing
5. **Multiple extraction methods** available (filename, contentId)

## Error Handling

```typescript
const result = await extractEmailAttachment(emailId, filename)

if (result.error) {
  switch (result.error) {
    case "Raw email content not available":
      console.log("Email not fully stored - only metadata available")
      break
    case "Attachment not found":
      console.log("File doesn't exist in this email")
      break
    case "Unauthorized":
      console.log("User doesn't have access to this email")
      break
    default:
      console.log("Other error:", result.error)
  }
} else {
  // Success - use result.data
}
```

The answer to your original question is **YES** - you can get attachment content, but you need to use these functions to parse the full email since the webhook payload only contains metadata.
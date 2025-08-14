/**
 * Inline Images Examples - Inbound Email SDK
 * 
 * This example demonstrates how to embed inline images in emails using the Inbound Email SDK.
 * Inline images are embedded as attachments with contentId references that can be used in HTML.
 * 
 * Based on Resend's inline images documentation:
 * https://resend.com/docs/send/inline-images
 */

import { Inbound } from '../src/index'
import * as fs from 'fs'
import * as path from 'path'

// Initialize the Inbound client
const inbound = new Inbound('your-api-key-here')

/**
 * Example 1: Remote Inline Image
 * 
 * Send an email with an inline image loaded from a remote URL.
 * The image is referenced in the HTML using cid: prefix.
 */
async function sendEmailWithRemoteInlineImage() {
  try {
    const result = await inbound.emails.send({
      from: 'Acme <onboarding@yourdomain.com>',
      to: ['recipient@example.com'],
      subject: 'Thank you for contacting us',
      html: '<p>Here is our <img src="cid:logo-image"/> inline logo</p>',
      attachments: [
        {
          path: 'https://resend.com/static/sample/logo.png',
          filename: 'logo.png',
          contentId: 'logo-image',
        },
      ],
    })

    console.log('✅ Email sent with remote inline image:', result.id)
    return result
  } catch (error) {
    console.error('❌ Failed to send email with remote inline image:', error)
    throw error
  }
}

/**
 * Example 2: Local Inline Image
 * 
 * Send an email with an inline image loaded from a local file.
 * The image content is base64 encoded before sending.
 */
async function sendEmailWithLocalInlineImage() {
  try {
    // Read the local image file and convert to base64
    const imagePath = path.join(__dirname, 'assets', 'logo.png')
    const imageBuffer = fs.readFileSync(imagePath)
    const imageBase64 = imageBuffer.toString('base64')

    const result = await inbound.emails.send({
      from: 'Acme <onboarding@yourdomain.com>',
      to: ['recipient@example.com'],
      subject: 'Thank you for contacting us',
      html: '<p>Here is our <img src="cid:logo-image"/> inline logo</p>',
      attachments: [
        {
          content: imageBase64,
          filename: 'logo.png',
          contentType: 'image/png',
          contentId: 'logo-image',
        },
      ],
    })

    console.log('✅ Email sent with local inline image:', result.id)
    return result
  } catch (error) {
    console.error('❌ Failed to send email with local inline image:', error)
    throw error
  }
}

/**
 * Example 3: Multiple Inline Images
 * 
 * Send an email with multiple inline images, each with unique contentId.
 */
async function sendEmailWithMultipleInlineImages() {
  try {
    const result = await inbound.emails.send({
      from: 'Acme <onboarding@yourdomain.com>',
      to: ['recipient@example.com'],
      subject: 'Multiple inline images example',
      html: `
        <div>
          <h1>Welcome to Acme!</h1>
          <p>Here's our logo: <img src="cid:logo" alt="Acme Logo" style="width: 100px;"/></p>
          <p>And here's a banner: <img src="cid:banner" alt="Banner" style="width: 300px;"/></p>
          <p>Best regards,<br/>The Acme Team</p>
        </div>
      `,
      attachments: [
        {
          path: 'https://resend.com/static/sample/logo.png',
          filename: 'logo.png',
          contentType: 'image/png',
          contentId: 'logo',
        },
        {
          path: 'https://via.placeholder.com/300x100/0066cc/ffffff?text=Acme+Banner',
          filename: 'banner.png',
          contentType: 'image/png',
          contentId: 'banner',
        },
      ],
    })

    console.log('✅ Email sent with multiple inline images:', result.id)
    return result
  } catch (error) {
    console.error('❌ Failed to send email with multiple inline images:', error)
    throw error
  }
}

/**
 * Example 4: Mixed Attachments (Regular + Inline)
 * 
 * Send an email with both regular attachments and inline images.
 * Regular attachments don't have contentId, while inline images do.
 */
async function sendEmailWithMixedAttachments() {
  try {
    const result = await inbound.emails.send({
      from: 'Acme <onboarding@yourdomain.com>',
      to: ['recipient@example.com'],
      subject: 'Mixed attachments example',
      html: `
        <div>
          <h1>Invoice Attached</h1>
          <p>Please find your invoice attached to this email.</p>
          <p>Our company logo: <img src="cid:company-logo" alt="Company Logo" style="width: 80px;"/></p>
          <p>Thank you for your business!</p>
        </div>
      `,
      attachments: [
        // Regular attachment (will appear in email client's attachment list)
        {
          path: 'https://example.com/invoice.pdf',
          filename: 'invoice-2024.pdf',
          contentType: 'application/pdf',
          // No contentId = regular attachment
        },
        // Inline image (embedded in email body)
        {
          path: 'https://resend.com/static/sample/logo.png',
          filename: 'logo.png',
          contentType: 'image/png',
          contentId: 'company-logo', // contentId = inline image
        },
      ],
    })

    console.log('✅ Email sent with mixed attachments:', result.id)
    return result
  } catch (error) {
    console.error('❌ Failed to send email with mixed attachments:', error)
    throw error
  }
}

/**
 * Example 5: Inline Image in Email Reply
 * 
 * Reply to an email with an inline image.
 */
async function replyWithInlineImage(originalEmailId: string) {
  try {
    const result = await inbound.emails.reply(originalEmailId, {
      from: 'Support <support@yourdomain.com>',
      html: `
        <p>Thank you for your inquiry!</p>
        <p>Here's our support team signature:</p>
        <img src="cid:support-signature" alt="Support Team" style="width: 200px;"/>
        <p>Best regards,<br/>Support Team</p>
      `,
      attachments: [
        {
          path: 'https://via.placeholder.com/200x50/28a745/ffffff?text=Support+Team',
          filename: 'support-signature.png',
          contentType: 'image/png',
          contentId: 'support-signature',
        },
      ],
    })

    console.log('✅ Reply sent with inline image:', result.id)
    return result
  } catch (error) {
    console.error('❌ Failed to send reply with inline image:', error)
    throw error
  }
}

/**
 * Example 6: Newsletter with Inline Images
 * 
 * Send a newsletter-style email with multiple inline images and proper HTML structure.
 */
async function sendNewsletterWithInlineImages() {
  try {
    const result = await inbound.emails.send({
      from: 'Acme Newsletter <newsletter@yourdomain.com>',
      to: ['subscriber@example.com'],
      subject: 'Acme Monthly Newsletter - January 2024',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Acme Newsletter</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
            .header { text-align: center; padding: 20px 0; }
            .content { padding: 20px; }
            .footer { text-align: center; padding: 20px; background: #f8f9fa; }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="cid:newsletter-header" alt="Acme Newsletter" />
          </div>
          <div class="content">
            <h1>Welcome to our January Newsletter!</h1>
            <p>We're excited to share our latest updates with you.</p>
            
            <h2>Product Spotlight</h2>
            <img src="cid:product-image" alt="Featured Product" style="float: left; margin: 0 20px 20px 0; width: 200px;" />
            <p>Check out our latest product launch! This amazing widget will revolutionize your workflow.</p>
            <div style="clear: both;"></div>
            
            <h2>Company News</h2>
            <p>We're growing fast and have some exciting announcements:</p>
            <ul>
              <li>New office opening in San Francisco</li>
              <li>Partnership with TechCorp</li>
              <li>Award for Best Innovation 2024</li>
            </ul>
          </div>
          <div class="footer">
            <img src="cid:company-logo" alt="Acme" style="width: 100px;" />
            <p>© 2024 Acme Corp. All rights reserved.</p>
            <p><a href="#">Unsubscribe</a> | <a href="#">Update Preferences</a></p>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          path: 'https://via.placeholder.com/600x150/0066cc/ffffff?text=Acme+Newsletter',
          filename: 'newsletter-header.png',
          contentType: 'image/png',
          contentId: 'newsletter-header',
        },
        {
          path: 'https://via.placeholder.com/200x200/28a745/ffffff?text=Product',
          filename: 'product.png',
          contentType: 'image/png',
          contentId: 'product-image',
        },
        {
          path: 'https://resend.com/static/sample/logo.png',
          filename: 'logo.png',
          contentType: 'image/png',
          contentId: 'company-logo',
        },
      ],
    })

    console.log('✅ Newsletter sent with inline images:', result.id)
    return result
  } catch (error) {
    console.error('❌ Failed to send newsletter with inline images:', error)
    throw error
  }
}

/**
 * Utility function to convert local image to base64
 */
export function imageToBase64(imagePath: string): string {
  try {
    const imageBuffer = fs.readFileSync(imagePath)
    return imageBuffer.toString('base64')
  } catch (error) {
    console.error('❌ Failed to read image file:', error)
    throw new Error(`Failed to read image file: ${imagePath}`)
  }
}

/**
 * Utility function to get content type from file extension
 */
export function getContentTypeFromExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const contentTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  }
  return contentTypes[ext] || 'application/octet-stream'
}

// Example usage
async function runExamples() {
  console.log('🚀 Running Inline Images Examples...\n')

  try {
    // Example 1: Remote inline image
    console.log('1️⃣ Sending email with remote inline image...')
    await sendEmailWithRemoteInlineImage()

    // Example 2: Local inline image (commented out as it requires local file)
    // console.log('2️⃣ Sending email with local inline image...')
    // await sendEmailWithLocalInlineImage()

    // Example 3: Multiple inline images
    console.log('3️⃣ Sending email with multiple inline images...')
    await sendEmailWithMultipleInlineImages()

    // Example 4: Mixed attachments
    console.log('4️⃣ Sending email with mixed attachments...')
    await sendEmailWithMixedAttachments()

    // Example 6: Newsletter
    console.log('6️⃣ Sending newsletter with inline images...')
    await sendNewsletterWithInlineImages()

    console.log('\n✅ All examples completed successfully!')
  } catch (error) {
    console.error('\n❌ Examples failed:', error)
  }
}

// Export all functions for individual use
export {
  sendEmailWithRemoteInlineImage,
  sendEmailWithLocalInlineImage,
  sendEmailWithMultipleInlineImages,
  sendEmailWithMixedAttachments,
  replyWithInlineImage,
  sendNewsletterWithInlineImages,
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples()
}
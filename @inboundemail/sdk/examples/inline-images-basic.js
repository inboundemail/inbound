/**
 * Basic Inline Images Example - Inbound Email SDK (JavaScript)
 * 
 * This example shows the simplest way to send emails with inline images
 * using the Inbound Email SDK in plain JavaScript.
 */

const { Inbound } = require('../dist/index.js')

// Initialize the client
const inbound = new Inbound('your-api-key-here')

// Example 1: Remote inline image (simplest approach)
async function sendWithRemoteImage() {
  try {
    const result = await inbound.emails.send({
      from: 'Acme <hello@yourdomain.com>',
      to: 'recipient@example.com',
      subject: 'Welcome to Acme!',
      html: '<p>Welcome! Here is our logo: <img src="cid:logo"/></p>',
      attachments: [
        {
          path: 'https://resend.com/static/sample/logo.png',
          filename: 'logo.png',
          contentId: 'logo'
        }
      ]
    })

    console.log('✅ Email sent:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Example 2: Local inline image with base64
async function sendWithLocalImage() {
  const fs = require('fs')
  
  try {
    // Read and encode image
    const imageBuffer = fs.readFileSync('./logo.png')
    const imageBase64 = imageBuffer.toString('base64')

    const result = await inbound.emails.send({
      from: 'Acme <hello@yourdomain.com>',
      to: 'recipient@example.com',
      subject: 'Welcome to Acme!',
      html: '<p>Welcome! Here is our logo: <img src="cid:logo"/></p>',
      attachments: [
        {
          content: imageBase64,
          filename: 'logo.png',
          contentType: 'image/png',
          contentId: 'logo'
        }
      ]
    })

    console.log('✅ Email sent:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Example 3: Multiple inline images
async function sendWithMultipleImages() {
  try {
    const result = await inbound.emails.send({
      from: 'Newsletter <news@yourdomain.com>',
      to: 'subscriber@example.com',
      subject: 'Monthly Update',
      html: `
        <h1><img src="cid:header" alt="Header"/></h1>
        <p>Check out our latest product:</p>
        <img src="cid:product" alt="Product" style="width: 200px;"/>
        <p>Thanks for reading!</p>
      `,
      attachments: [
        {
          path: 'https://via.placeholder.com/400x100/0066cc/ffffff?text=Newsletter',
          filename: 'header.png',
          contentId: 'header'
        },
        {
          path: 'https://via.placeholder.com/200x200/28a745/ffffff?text=Product',
          filename: 'product.png',
          contentId: 'product'
        }
      ]
    })

    console.log('✅ Newsletter sent:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Example 4: Reply with inline image
async function replyWithImage(emailId) {
  try {
    const result = await inbound.emails.reply(emailId, {
      from: 'Support <support@yourdomain.com>',
      html: `
        <p>Thanks for contacting us!</p>
        <img src="cid:signature" alt="Signature"/>
      `,
      attachments: [
        {
          path: 'https://via.placeholder.com/200x50/333333/ffffff?text=Support+Team',
          filename: 'signature.png',
          contentId: 'signature'
        }
      ]
    })

    console.log('✅ Reply sent:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run examples
async function main() {
  console.log('🚀 Testing inline images...\n')

  await sendWithRemoteImage()
  // await sendWithLocalImage() // Uncomment if you have logo.png
  await sendWithMultipleImages()
  
  console.log('\n✅ Done!')
}

// Export functions
module.exports = {
  sendWithRemoteImage,
  sendWithLocalImage,
  sendWithMultipleImages,
  replyWithImage
}

// Run if called directly
if (require.main === module) {
  main()
}
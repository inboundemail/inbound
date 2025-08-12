// TypeScript usage example for @inboundemail/sdk
import { Inbound, type PostEmailsRequest, type GetMailResponse, type PostEndpointsRequest } from '@inboundemail/sdk'

// Initialize the SDK with type safety
const inbound = new Inbound(process.env.INBOUND_API_KEY || 'your-api-key-here')

async function typedEmailExample() {
  try {
    console.log('=== Typed Email Example ===')
    
    // Create a typed email request
    const emailRequest: PostEmailsRequest = {
      from: 'hello@yourdomain.com',
      to: ['user1@example.com', 'user2@example.com'],
      cc: ['manager@example.com'],
      subject: 'TypeScript Email Example',
      text: 'This email was sent using the TypeScript SDK with full type safety!',
      html: `
        <h1>TypeScript Email Example</h1>
        <p>This email was sent using the <strong>TypeScript SDK</strong> with full type safety!</p>
        <ul>
          <li>Type-safe API calls</li>
          <li>IntelliSense support</li>
          <li>Compile-time error checking</li>
        </ul>
      `,
      headers: {
        'X-Priority': 'High',
        'X-Custom-Header': 'typescript-example'
      },
      attachments: [{
        filename: 'example.txt',
        content: Buffer.from('Hello from TypeScript!').toString('base64'),
        contentType: 'text/plain'
      }]
    }
    
    // Send with full type safety
    const emailResponse = await inbound.emails.send(emailRequest)
    console.log('Email sent with ID:', emailResponse.id)
    
    // Retrieve with typed response
    const retrievedEmail = await inbound.emails.get(emailResponse.id)
    console.log('Retrieved email subject:', retrievedEmail.subject)
    console.log('Email status:', retrievedEmail.last_event)
    console.log('Recipients:', retrievedEmail.to)
    
  } catch (error) {
    console.error('Error sending email:', error)
  }
}

async function inlineImageExample() {
  try {
    console.log('\n=== Inline Image Example (CID) ===')
    
    // Create a simple 1x1 pixel PNG in base64 for demonstration
    const sampleImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    
    // Send email with inline images using Content-ID (CID)
    const emailRequest: PostEmailsRequest = {
      from: 'Newsletter <newsletter@yourdomain.com>',
      to: 'subscriber@example.com',
      subject: 'Monthly Newsletter with Inline Images',
      html: `
        <html>
          <body style="font-family: Arial, sans-serif;">
            <h1>Monthly Newsletter</h1>
            <p>Welcome to our monthly update!</p>
            
            <div style="text-align: center; margin: 20px 0;">
              <img src="cid:header-logo" alt="Company Logo" style="max-width: 200px;" />
            </div>
            
            <h2>This Month's Statistics</h2>
            <p>Check out our performance chart below:</p>
            
            <div style="text-align: center; margin: 20px 0;">
              <img src="cid:monthly-chart" alt="Monthly Performance Chart" style="max-width: 400px;" />
            </div>
            
            <p>Thanks for being a valued subscriber!</p>
            
            <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
              <img src="cid:footer-icon" alt="Footer Icon" style="width: 16px; height: 16px; vertical-align: middle;" />
              <small style="margin-left: 5px;">This email was sent with Inbound's inline image support.</small>
            </div>
          </body>
        </html>
      `,
      text: `
        Monthly Newsletter
        
        Welcome to our monthly update!
        
        This Month's Statistics
        Check out our performance chart (images not supported in plain text).
        
        Thanks for being a valued subscriber!
      `,
      attachments: [
        {
          filename: 'logo.png',
          content: sampleImageBase64,
          contentType: 'image/png',
          contentId: 'header-logo'  // Referenced as cid:header-logo in HTML
        },
        {
          filename: 'chart.png',
          content: sampleImageBase64, // In real usage, this would be your actual chart image
          contentType: 'image/png',
          contentId: 'monthly-chart'  // Referenced as cid:monthly-chart in HTML
        },
        {
          filename: 'icon.png',
          content: sampleImageBase64,
          contentType: 'image/png',
          contentId: 'footer-icon'  // Referenced as cid:footer-icon in HTML
        },
        {
          // Regular attachment (not inline)
          filename: 'newsletter-data.pdf',
          content: Buffer.from('PDF content would go here').toString('base64'),
          contentType: 'application/pdf'
          // No contentId = regular attachment, not inline
        }
      ]
    }
    
    const result = await inbound.emails.send(emailRequest)
    console.log('Newsletter sent successfully!')
    console.log('Email ID:', result.id)
    console.log('Message ID:', result.messageId)
    
  } catch (error) {
    console.error('Error sending newsletter:', error)
  }
}

async function typedMailboxExample() {
  try {
    console.log('\n=== Typed Mailbox Example ===')
    
    // List received emails with type safety
    const mailResponse: GetMailResponse = await inbound.mail.list({
      limit: 10,
      status: 'processed',
      timeRange: '24h'
    })
    
    console.log(`Found ${mailResponse.emails.length} emails`)
    console.log('Pagination:', mailResponse.pagination)
    
    // Process each email with type safety
    mailResponse.emails.forEach((email, index) => {
      console.log(`Email ${index + 1}:`)
      console.log(`  - ID: ${email.id}`)
      console.log(`  - Subject: ${email.subject}`)
      console.log(`  - From: ${email.from}`)
      console.log(`  - Received: ${email.receivedAt}`)
      console.log(`  - Read: ${email.isRead ? 'Yes' : 'No'}`)
      console.log(`  - Attachments: ${email.attachmentCount}`)
    })
    
  } catch (error) {
    console.error('Error listing emails:', error)
  }
}

async function typedEndpointExample() {
  try {
    console.log('\n=== Typed Endpoint Example ===')
    
    // Create endpoint with typed configuration
    const endpointRequest: PostEndpointsRequest = {
      name: 'TypeScript Webhook',
      type: 'webhook',
      description: 'A webhook endpoint created with TypeScript',
      config: {
        url: 'https://webhook.site/typescript-example',
        timeout: 45,
        retryAttempts: 5,
        headers: {
          'Authorization': 'Bearer typescript-token',
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'inbound-typescript-sdk'
        }
      }
    }
    
    const endpoint = await inbound.endpoints.create(endpointRequest)
    console.log('Created endpoint:', endpoint.id)
    console.log('Endpoint name:', endpoint.name)
    console.log('Endpoint type:', endpoint.type)
    console.log('Is active:', endpoint.isActive)
    
    // Get endpoint details with typed response
    const endpointDetails = await inbound.endpoints.get(endpoint.id)
    console.log('Delivery stats:', endpointDetails.deliveryStats)
    console.log('Associated emails:', endpointDetails.associatedEmails.length)
    console.log('Catch-all domains:', endpointDetails.catchAllDomains.length)
    
    // Update endpoint with partial typing
    await inbound.endpoints.update(endpoint.id, {
      name: 'Updated TypeScript Webhook',
      isActive: false
    })
    
    console.log('Endpoint updated successfully')
    
    // Clean up
    const deleteResult = await inbound.endpoints.delete(endpoint.id)
    console.log('Cleanup completed:', deleteResult.cleanup)
    
  } catch (error) {
    console.error('Error managing endpoint:', error)
  }
}

async function typedDomainExample() {
  try {
    console.log('\n=== Typed Domain Example ===')
    
    // List domains with verification check
    const domains = await inbound.domains.list({
      check: 'true',
      limit: 5
    })
    
    console.log(`Found ${domains.data.length} domains`)
    console.log('Meta info:', domains.meta)
    
    // Process domains with type safety
    domains.data.forEach((domain, index) => {
      console.log(`Domain ${index + 1}: ${domain.domain}`)
      console.log(`  - Status: ${domain.status}`)
      console.log(`  - Can receive emails: ${domain.canReceiveEmails}`)
      console.log(`  - Catch-all enabled: ${domain.isCatchAllEnabled}`)
      console.log(`  - Email addresses: ${domain.stats.totalEmailAddresses}`)
      
      if (domain.verificationCheck) {
        console.log(`  - SES Status: ${domain.verificationCheck.sesStatus}`)
        console.log(`  - Fully verified: ${domain.verificationCheck.isFullyVerified}`)
        console.log(`  - DNS records: ${domain.verificationCheck.dnsRecords?.length || 0}`)
      }
    })
    
  } catch (error) {
    console.error('Error listing domains:', error)
  }
}

async function replyExample() {
  try {
    console.log('\n=== Reply Example ===')
    
    // First, get some received emails to reply to
    const mailResponse = await inbound.mail.list({ limit: 1 })
    
    if (mailResponse.emails.length > 0) {
      const emailToReplyTo = mailResponse.emails[0]
      console.log(`Replying to email: ${emailToReplyTo.subject}`)
      
      // Reply with type safety
      const replyResponse = await inbound.emails.reply(emailToReplyTo.id, {
        from: 'support@yourdomain.com',
        text: 'Thank you for your email! This is an automated reply sent via the TypeScript SDK.',
        html: `
          <p>Thank you for your email!</p>
          <p>This is an automated reply sent via the <strong>TypeScript SDK</strong>.</p>
          <p>We will get back to you soon.</p>
        `,
        include_original: true
      })
      
      console.log('Reply sent with ID:', replyResponse.id)
    } else {
      console.log('No emails found to reply to')
    }
    
  } catch (error) {
    console.error('Error sending reply:', error)
  }
}

// Main execution function
async function main() {
  try {
    await typedEmailExample()
    await inlineImageExample()
    await typedMailboxExample()
    await typedEndpointExample()
    await typedDomainExample()
    await replyExample()
    
    console.log('\n=== All TypeScript examples completed successfully! ===')
  } catch (error) {
    console.error('Main execution error:', error)
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error)
}

export {
  typedEmailExample,
  typedMailboxExample,
  typedEndpointExample,
  typedDomainExample,
  replyExample
}
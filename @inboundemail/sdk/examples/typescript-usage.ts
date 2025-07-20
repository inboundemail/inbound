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
        content_type: 'text/plain'
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
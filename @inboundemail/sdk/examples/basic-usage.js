// Basic usage example for @inboundemail/sdk
const {
  Inbound
} = require('@inboundemail/sdk')

// Initialize the SDK (Resend-style constructor)
const inbound = new Inbound('macbook-testingVaWvxQLddFWZQSuqHLZxKVMCBrBbsGRoUOYmRtUCaOYltLpeQALEfcMTbhhDBmiU')

async function basicExample() {
  try {
    // Send an email
    console.log('Sending email...')
    const email = await inbound.emails.send({
      from: 'hello@inbound.new',
      to: 'user@inbound.new',
      subject: 'Hello from Inbound SDK!',
      text: 'This is a test email sent using the Inbound Email SDK.',
      html: '<h1>Hello from Inbound SDK!</h1><p>This is a test email sent using the <strong>Inbound Email SDK</strong>.</p>'
    })

    console.log('Email sent successfully:', email.id)

    // Retrieve the sent email
    console.log('Retrieving sent email...')
    const sentEmail = await inbound.emails.get(email.id)
    console.log('Retrieved email:', sentEmail.subject, '- Status:', sentEmail.last_event)

    // List received emails
    console.log('Listing received emails...')
    const receivedEmails = await inbound.mail.list({
      limit: 5
    })
    console.log('Found', receivedEmails.emails.length, 'received emails')

    // Filter emails by email address
    console.log('Filtering emails by specific email address...')
    const emailsByAddress = await inbound.mail.list({
      emailAddress: 'user@inbound.new',
      limit: 10
    })
    console.log('Found', emailsByAddress.emails.length, 'emails for user@inbound.new')

    // Filter emails by email ID
    if (receivedEmails.emails.length > 0) {
      console.log('Filtering emails by email ID...')
      const emailsByEmailId = await inbound.mail.list({
        emailId: receivedEmails.emails[0].emailId,
        limit: 10
      })
      console.log('Found', emailsByEmailId.emails.length, 'emails with emailId:', receivedEmails.emails[0].emailId)
    }

    // List endpoints
    console.log('Listing endpoints...')
    const endpoints = await inbound.endpoints.list({
      limit: 5
    })
    console.log('Found', endpoints.data.length, 'endpoints')

    // List domains
    console.log('Listing domains...')
    const domains = await inbound.domains.list()
    console.log('Found', domains.data.length, 'domains')

    // List email addresses
    console.log('Listing email addresses...')
    const addresses = await inbound.emailAddresses.list({
      limit: 5
    })
    console.log('Found', addresses.data.length, 'email addresses')

  } catch (error) {
    console.error('Error:', error.message)
  }
}

async function endpointExample() {
  try {
    console.log('Creating a webhook endpoint...')

    // Create a webhook endpoint
    const endpoint = await inbound.endpoints.create({
      name: 'My Test Webhook',
      type: 'webhook',
      description: 'A test webhook endpoint',
      config: {
        url: 'https://webhook.site/your-unique-url',
        timeout: 30,
        retryAttempts: 3,
        headers: {
          'Authorization': 'Bearer your-token',
          'X-Custom-Header': 'custom-value'
        }
      }
    })

    console.log('Endpoint created:', endpoint.id)

    // Get endpoint details
    const endpointDetails = await inbound.endpoints.get(endpoint.id)
    console.log('Endpoint details:', endpointDetails.name, '- Active:', endpointDetails.isActive)

    // Update the endpoint
    await inbound.endpoints.update(endpoint.id, {
      name: 'Updated Test Webhook',
      description: 'Updated description'
    })

    console.log('Endpoint updated successfully')

    // Clean up - delete the endpoint
    await inbound.endpoints.delete(endpoint.id)
    console.log('Endpoint deleted successfully')

  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('=== Basic Usage Example ===')
  basicExample().then(() => {
    console.log('\n=== Endpoint Management Example ===')
    return endpointExample()
  }).then(() => {
    console.log('\n=== Examples completed ===')
  }).catch(console.error)
}

module.exports = {
  basicExample,
  endpointExample
}
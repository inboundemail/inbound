/**
 * Example demonstrating the new hierarchical SDK structure
 * Version 4.0.0 - with email.address.* methods and { data, error } pattern
 */

import { InboundEmailClient } from '../src/client'

const inbound = new InboundEmailClient('your-api-key')

async function demonstrateHierarchicalStructure() {
  console.log('🚀 Demonstrating Inbound Email SDK v4.0.0 - Hierarchical Structure\n')

  // 📧 INBOUND EMAIL MANAGEMENT (mail.*)
  console.log('📧 Inbound Email Management:')
  
  const { data: emails, error: emailsError } = await inbound.mail.list({ limit: 10 })
  if (emailsError) {
    console.error('Error fetching emails:', emailsError)
  } else {
    console.log(`Found ${emails?.emails.length} emails`)
  }

  // Mark an email as read
  const { data: readResult, error: readError } = await inbound.mail.markRead('email-123')
  if (!readError) {
    console.log('Email marked as read')
  }

  // Get email thread
  const { data: thread, error: threadError } = await inbound.mail.thread('email-123')
  if (!threadError) {
    console.log('Retrieved email thread')
  }

  // 📤 OUTBOUND EMAIL MANAGEMENT (email.*)
  console.log('\n📤 Outbound Email Management:')
  
  const { data: sentEmail, error: sendError } = await inbound.email.send({
    from: 'hello@yourdomain.com',
    to: 'user@example.com',
    subject: 'Welcome!',
    html: '<h1>Welcome to our service!</h1>',
    text: 'Welcome to our service!'
  }, {
    idempotencyKey: 'welcome-email-123'
  })

  if (sendError) {
    console.error('Error sending email:', sendError)
  } else {
    console.log('Email sent successfully:', sentEmail?.id)
  }

  // Schedule an email
  const { data: scheduledEmail, error: scheduleError } = await inbound.email.schedule({
    from: 'hello@yourdomain.com',
    to: 'user@example.com',
    subject: 'Scheduled Reminder',
    text: 'This is your scheduled reminder!',
    scheduled_at: 'in 1 hour',
    timezone: 'America/New_York'
  })

  if (!scheduleError) {
    console.log('Email scheduled for:', scheduledEmail?.scheduled_at)
  }

  // 📮 EMAIL ADDRESS MANAGEMENT (email.address.*)
  console.log('\n📮 Email Address Management:')
  
  const { data: addresses, error: addressError } = await inbound.email.address.list()
  if (!addressError) {
    console.log(`Found ${addresses?.data.length} email addresses`)
  }

  const { data: newAddress, error: createAddressError } = await inbound.email.address.create({
    address: 'support@yourdomain.com',
    domainId: 'domain-123'
  })

  if (!createAddressError) {
    console.log('Created email address:', newAddress?.address)
  }

  // Update email address routing
  const { data: updatedAddress, error: updateError } = await inbound.email.address.update('address-123', {
    endpointId: 'endpoint-456',
    isActive: true
  })

  if (!updateError) {
    console.log('Updated email address routing')
  }

  // 🌐 DOMAIN MANAGEMENT (domain.*)
  console.log('\n🌐 Domain Management:')
  
  const { data: domains, error: domainsError } = await inbound.domain.list()
  if (!domainsError) {
    console.log(`Found ${domains?.data.length} domains`)
  }

  const { data: newDomain, error: domainCreateError } = await inbound.domain.create({
    domain: 'newdomain.com'
  })

  if (!domainCreateError) {
    console.log('Created domain:', newDomain?.domain)
    
    // Get DNS records for verification
    const { data: dnsRecords, error: dnsError } = await inbound.domain.getDnsRecords(newDomain.id)
    if (!dnsError) {
      console.log('DNS records required for verification:', dnsRecords?.length, 'records')
    }
  }

  // 🔗 ENDPOINT MANAGEMENT (endpoint.*)
  console.log('\n🔗 Endpoint Management:')
  
  const { data: endpoints, error: endpointsError } = await inbound.endpoint.list()
  if (!endpointsError) {
    console.log(`Found ${endpoints?.data.length} endpoints`)
  }

  const { data: webhook, error: webhookError } = await inbound.endpoint.create({
    name: 'My Webhook',
    type: 'webhook',
    config: {
      url: 'https://yourapp.com/webhook',
      timeout: 30000,
      retryAttempts: 3
    }
  })

  if (!webhookError) {
    console.log('Created webhook endpoint:', webhook?.name)
    
    // Test the endpoint
    const { data: testResult, error: testError } = await inbound.endpoint.test(webhook.id)
    if (!testError) {
      console.log('Endpoint test successful')
    }
  }

  // 🎯 CONVENIENCE METHODS
  console.log('\n🎯 Convenience Methods:')
  
  // Quick reply to an email with idempotency
  const { data: replyResult, error: replyError } = await inbound.quickReply(
    'email-123',
    'Thanks for your message!',
    'support@yourdomain.com',
    { idempotencyKey: 'support-reply-456' }
  )

  if (!replyError) {
    console.log('Quick reply sent')
  }

  // One-step domain setup with webhook
  const { data: setupResult, error: setupError } = await inbound.setupDomain(
    'autodomain.com',
    'https://yourapp.com/webhook'
  )

  if (!setupError) {
    console.log('Domain setup complete with webhook')
  }

  // Create email forwarder
  const { data: forwarder, error: forwarderError } = await inbound.createForwarder(
    'info@yourdomain.com',
    'team@yourdomain.com'
  )

  if (!forwarderError) {
    console.log('Email forwarder created')
  }

  // Schedule a reminder
  const { data: reminder, error: reminderError } = await inbound.scheduleReminder(
    'user@example.com',
    'Meeting Tomorrow',
    'tomorrow at 9am',
    'reminders@yourdomain.com'
  )

  if (!reminderError) {
    console.log('Reminder scheduled for:', reminder?.scheduled_at)
  }

  console.log('\n✅ Hierarchical SDK demonstration complete!')
}

// Example usage patterns
async function usagePatterns() {
  console.log('\n📚 Usage Patterns:\n')

  // Pattern 1: { data, error } destructuring
  console.log('1. Destructuring pattern:')
  const { data: emailList, error } = await inbound.mail.list()
  if (error) {
    console.error('Failed to fetch emails:', error)
    return
  }
  console.log(`Success: Found ${emailList.emails.length} emails\n`)

  // Pattern 2: Hierarchical navigation
  console.log('2. Hierarchical navigation:')
  console.log('inbound.mail.*        - Inbound email management')
  console.log('inbound.email.*       - Outbound email sending')
  console.log('inbound.email.address.* - Email address management')
  console.log('inbound.domain.*      - Domain management')
  console.log('inbound.endpoint.*    - Webhook/endpoint management\n')

  // Pattern 3: Legacy compatibility
  console.log('3. Legacy compatibility (still works):')
  console.log('inbound.emails === inbound.email')
  console.log('inbound.domains === inbound.domain')
  console.log('inbound.endpoints === inbound.endpoint')
  console.log('inbound.emailAddresses === inbound.email.address\n')
}

// Run the demonstration
if (require.main === module) {
  demonstrateHierarchicalStructure()
    .then(() => usagePatterns())
    .catch(console.error)
}
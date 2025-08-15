// Email filtering example for @inboundemail/sdk
const { Inbound } = require('@inboundemail/sdk')

// Initialize the SDK
const inbound = new Inbound(process.env.INBOUND_API_KEY || 'your-api-key')

async function emailFilteringExample() {
  try {
    console.log('=== Email Filtering Examples ===\n')

    // 1. Filter emails by specific email address
    console.log('1. Filtering emails by email address...')
    const emailsByAddress = await inbound.mail.list({
      emailAddress: 'support@example.com',
      limit: 10
    })
    console.log(`Found ${emailsByAddress.emails.length} emails for support@example.com`)
    
    if (emailsByAddress.emails.length > 0) {
      console.log('Sample email:', {
        subject: emailsByAddress.emails[0].subject,
        from: emailsByAddress.emails[0].from,
        recipient: emailsByAddress.emails[0].recipient,
        receivedAt: emailsByAddress.emails[0].receivedAt
      })
    }
    console.log()

    // 2. Filter emails by email ID (useful for getting all related emails)
    console.log('2. Filtering emails by email ID...')
    
    // First, get some emails to work with
    const allEmails = await inbound.mail.list({ limit: 5 })
    
    if (allEmails.emails.length > 0) {
      const sampleEmailId = allEmails.emails[0].emailId
      console.log(`Using emailId: ${sampleEmailId}`)
      
      const emailsByEmailId = await inbound.mail.list({
        emailId: sampleEmailId,
        limit: 10
      })
      console.log(`Found ${emailsByEmailId.emails.length} emails with emailId: ${sampleEmailId}`)
      
      if (emailsByEmailId.emails.length > 0) {
        console.log('Sample email:', {
          subject: emailsByEmailId.emails[0].subject,
          from: emailsByEmailId.emails[0].from,
          recipient: emailsByEmailId.emails[0].recipient
        })
      }
    } else {
      console.log('No emails found to demonstrate emailId filtering')
    }
    console.log()

    // 3. Combine email filtering with other filters
    console.log('3. Combining email address filter with other filters...')
    const combinedFilter = await inbound.mail.list({
      emailAddress: 'user@example.com',
      timeRange: '7d',
      status: 'processed',
      limit: 5
    })
    console.log(`Found ${combinedFilter.emails.length} processed emails for user@example.com in the last 7 days`)
    console.log()

    // 4. Use cases for email filtering
    console.log('4. Common use cases:')
    console.log('   • Customer support: Filter by support@yourcompany.com')
    console.log('   • Email threads: Use emailId to get all emails in a conversation')
    console.log('   • User-specific emails: Filter by a specific user\'s email address')
    console.log('   • Audit trails: Get all emails related to a specific original email')
    console.log()

    // 5. Error handling example
    console.log('5. Error handling example...')
    try {
      // This should fail validation (both emailAddress and emailId provided)
      await inbound.mail.list({
        emailAddress: 'test@example.com',
        emailId: 'some-email-id',
        limit: 5
      })
    } catch (error) {
      console.log('Expected error caught:', error.message)
    }

  } catch (error) {
    console.error('Unexpected error:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
  }
}

// Advanced filtering example
async function advancedFilteringExample() {
  try {
    console.log('\n=== Advanced Filtering Patterns ===\n')

    // Get all emails for a specific customer
    const customerEmails = await inbound.mail.list({
      emailAddress: 'customer@example.com',
      includeArchived: true, // Include archived emails too
      limit: 50
    })

    console.log(`Total emails for customer: ${customerEmails.emails.length}`)
    
    // Group by email threads (same emailId)
    const emailThreads = {}
    customerEmails.emails.forEach(email => {
      if (!emailThreads[email.emailId]) {
        emailThreads[email.emailId] = []
      }
      emailThreads[email.emailId].push(email)
    })

    console.log(`Email threads found: ${Object.keys(emailThreads).length}`)
    
    // Show thread information
    Object.entries(emailThreads).forEach(([emailId, emails], index) => {
      if (index < 3) { // Show first 3 threads
        console.log(`Thread ${index + 1} (emailId: ${emailId}):`)
        console.log(`  - ${emails.length} emails in thread`)
        console.log(`  - Subjects: ${[...new Set(emails.map(e => e.subject))].join(', ')}`)
        console.log(`  - Date range: ${new Date(Math.min(...emails.map(e => new Date(e.receivedAt)))).toLocaleDateString()} - ${new Date(Math.max(...emails.map(e => new Date(e.receivedAt)))).toLocaleDateString()}`)
      }
    })

  } catch (error) {
    console.error('Advanced filtering error:', error.message)
  }
}

// Run examples
if (require.main === module) {
  emailFilteringExample()
    .then(() => advancedFilteringExample())
    .then(() => console.log('\n✅ Email filtering examples completed!'))
    .catch(error => console.error('❌ Example failed:', error.message))
}

module.exports = {
  emailFilteringExample,
  advancedFilteringExample
}

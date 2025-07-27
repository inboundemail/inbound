/**
 * Examples demonstrating sender name formatting functionality
 * This shows how the API automatically formats sender names with proper quotes
 */

import { Inbound } from '../src'

const inbound = new Inbound('your-api-key-here')

async function sendEmailExamples() {
    console.log('=== Sender Name Formatting Examples ===\n')

    // Example 1: Using default user name (fetched from database)
    console.log('1. Using default user name:')
    try {
        const result1 = await inbound.emails.send({
            from: 'ryan@mandarin3d.com',
            to: 'recipient@example.com',
            subject: 'Test email with default sender name',
            html: '<p>This email will use the user\'s name from their account</p>',
            text: 'This email will use the user\'s name from their account'
        })
        console.log('✅ Email sent with ID:', result1.id)
        console.log('   SES will receive: "Ryan Vogel" <ryan@mandarin3d.com>\n')
    } catch (error) {
        console.error('❌ Error:', error)
    }

    // Example 2: Using custom sender name
    console.log('2. Using custom sender name:')
    try {
        const result2 = await inbound.emails.send({
            from: 'support@mandarin3d.com',
            to: 'customer@example.com',
            subject: 'Support ticket response',
            html: '<p>This is from our support team</p>',
            text: 'This is from our support team',
            sender_name: 'Mandarin3D Support Team'
        })
        console.log('✅ Email sent with ID:', result2.id)
        console.log('   SES will receive: "Mandarin3D Support Team" <support@mandarin3d.com>\n')
    } catch (error) {
        console.error('❌ Error:', error)
    }

    // Example 3: Sender name with special characters (automatically quoted)
    console.log('3. Sender name with special characters:')
    try {
        const result3 = await inbound.emails.send({
            from: 'info@company.com',
            to: 'user@example.com',
            subject: 'Newsletter',
            html: '<p>Monthly newsletter</p>',
            text: 'Monthly newsletter',
            sender_name: 'Company, Inc. Newsletter'
        })
        console.log('✅ Email sent with ID:', result3.id)
        console.log('   SES will receive: "Company, Inc. Newsletter" <info@company.com>\n')
    } catch (error) {
        console.error('❌ Error:', error)
    }

    // Example 4: Reply with custom sender name
    console.log('4. Reply with custom sender name:')
    try {
        const result4 = await inbound.emails.reply('email-id-to-reply-to', {
            from: 'support@mandarin3d.com',
            html: '<p>Thanks for your inquiry!</p>',
            text: 'Thanks for your inquiry!',
            sender_name: 'Customer Success Team'
        })
        console.log('✅ Reply sent with ID:', result4.id)
        console.log('   SES will receive: "Customer Success Team" <support@mandarin3d.com>\n')
    } catch (error) {
        console.error('❌ Error:', error)
        console.log('   (This is expected if email-id-to-reply-to doesn\'t exist)\n')
    }
}

// Run examples
sendEmailExamples().catch(console.error) 
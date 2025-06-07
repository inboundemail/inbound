import { parseEmail } from './parse';

async function exampleUsage() {
  try {
    // Parse the email
    const emailData = await parseEmail();
    
    // Example: Extract specific information
    console.log('=== PROGRAMMATIC USAGE EXAMPLE ===\n');
    
    // Get sender information
    if (emailData.from) {
      console.log('Sender Details:');
      console.log(`  Name: ${emailData.from.addresses[0]?.name || 'Unknown'}`);
      console.log(`  Email: ${emailData.from.addresses[0]?.address}`);
    }
    
    // Get recipient information
    if (emailData.to) {
      console.log('\nRecipient Details:');
      emailData.to.addresses.forEach((addr: any, index: number) => {
        console.log(`  ${index + 1}. ${addr.name || 'Unknown'} <${addr.address}>`);
      });
    }
    
    // Get email content
    console.log('\nContent Summary:');
    console.log(`  Subject: ${emailData.subject}`);
    console.log(`  Date: ${emailData.date}`);
    console.log(`  Has Text Body: ${!!emailData.textBody}`);
    console.log(`  Has HTML Body: ${!!emailData.htmlBody}`);
    console.log(`  Attachments: ${emailData.attachments.length}`);
    
    // Extract plain text content (first 100 characters)
    if (emailData.textBody) {
      console.log('\nText Preview:');
      console.log(`  "${emailData.textBody.substring(0, 100)}..."`);
    }
    
    // Check for specific headers
    console.log('\nSecurity Headers:');
    console.log(`  SPF: ${emailData.headers['received-spf'] ? 'Present' : 'Not found'}`);
    console.log(`  DKIM: ${emailData.headers['dkim-signature'] ? 'Present' : 'Not found'}`);
    const authResults = emailData.headers['authentication-results'];
    const dmarcStatus = typeof authResults === 'string' && authResults.includes('dmarc=pass');
    console.log(`  DMARC: ${dmarcStatus ? 'Pass' : 'Not verified'}`);
    
    // Return structured data for further processing
    return {
      sender: emailData.from?.addresses[0],
      recipients: emailData.to?.addresses || [],
      subject: emailData.subject,
      date: emailData.date,
      textContent: emailData.textBody,
      htmlContent: emailData.htmlBody,
      attachmentCount: emailData.attachments.length,
      messageId: emailData.messageId,
      hasSecurityHeaders: {
        spf: !!emailData.headers['received-spf'],
        dkim: !!emailData.headers['dkim-signature'],
        dmarc: dmarcStatus
      }
    };
    
  } catch (error) {
    console.error('Failed to parse email:', error);
    throw error;
  }
}

// Run the example
if (require.main === module) {
  exampleUsage()
    .then((result) => {
      console.log('\n✅ Example completed successfully!');
      console.log('\nReturned data structure:', JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error('❌ Example failed:', error);
      process.exit(1);
    });
}

export { exampleUsage }; 
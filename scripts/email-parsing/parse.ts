import { simpleParser } from 'mailparser';

export async function parseEmail(emailContent: string) {
  try {
    // Read the email file
    
    // Parse the email
    const parsed = await simpleParser(emailContent);
    
    // Helper function to extract address info
    const extractAddressInfo = (addressObj: any) => {
      if (!addressObj) return null;
      
      if (Array.isArray(addressObj)) {
        return {
          text: addressObj.map(addr => addr.text || `${addr.name || ''} <${addr.address || ''}>`).join(', '),
          addresses: addressObj.map(addr => ({
            name: addr.name || null,
            address: addr.address || null
          }))
        };
      } else if (addressObj.value && Array.isArray(addressObj.value)) {
        // Handle AddressObject with value array
        return {
          text: addressObj.text,
          addresses: addressObj.value.map((addr: any) => ({
            name: addr.name || null,
            address: addr.address || null
          }))
        };
      } else if (addressObj.value) {
        // Handle AddressObject with single value
        return {
          text: addressObj.text,
          addresses: [{
            name: addressObj.value.name || null,
            address: addressObj.value.address || null
          }]
        };
      } else {
        // Handle direct address object
        return {
          text: addressObj.text || `${addressObj.name || ''} <${addressObj.address || ''}>`,
          addresses: [{
            name: addressObj.name || null,
            address: addressObj.address || null
          }]
        };
      }
    };
    
    // Extract key information
    const emailData = {
      messageId: parsed.messageId,
      date: parsed.date,
      subject: parsed.subject,
      from: extractAddressInfo(parsed.from),
      to: extractAddressInfo(parsed.to),
      cc: extractAddressInfo(parsed.cc),
      bcc: extractAddressInfo(parsed.bcc),
      replyTo: extractAddressInfo(parsed.replyTo),
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      textBody: parsed.text,
      htmlBody: parsed.html,
      attachments: parsed.attachments?.map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        contentId: att.contentId,
        contentDisposition: att.contentDisposition
      })) || [],
      headers: Object.fromEntries(parsed.headers),
      priority: parsed.priority
    };
    
    // Pretty print the parsed data
    console.log('=== PARSED EMAIL DATA ===\n');
    
    console.log('📧 Basic Info:');
    console.log(`  Message ID: ${emailData.messageId}`);
    console.log(`  Date: ${emailData.date}`);
    console.log(`  Subject: ${emailData.subject}`);
    console.log(`  Priority: ${emailData.priority || 'normal'}\n`);
    
    if (emailData.from) {
      console.log('👤 From:');
      console.log(`  Text: ${emailData.from.text}`);
      console.log(`  Address: ${emailData.from.addresses[0]?.address || 'N/A'}`);
      console.log(`  Name: ${emailData.from.addresses[0]?.name || 'N/A'}\n`);
    }
    
    if (emailData.to) {
      console.log('📬 To:');
      console.log(`  Text: ${emailData.to.text}`);
      console.log(`  Address: ${emailData.to.addresses[0]?.address || 'N/A'}`);
      console.log(`  Name: ${emailData.to.addresses[0]?.name || 'N/A'}\n`);
    }
    
    if (emailData.cc) {
      console.log('📋 CC:');
      console.log(`  Text: ${emailData.cc.text}`);
      console.log(`  Addresses: ${emailData.cc.addresses.map((addr: any) => addr.address).join(', ')}\n`);
    }
    
    if (emailData.replyTo) {
      console.log('↩️  Reply To:');
      console.log(`  Text: ${emailData.replyTo.text}`);
      console.log(`  Address: ${emailData.replyTo.addresses[0]?.address || 'N/A'}\n`);
    }
    
    console.log('📝 Text Body:');
    console.log(emailData.textBody ? emailData.textBody.substring(0, 200) + '...' : 'No text body');
    console.log();
    
    console.log('🌐 HTML Body:');
    console.log(emailData.htmlBody ? emailData.htmlBody.substring(0, 200) + '...' : 'No HTML body');
    console.log();
    
    if (emailData.attachments.length > 0) {
      console.log('📎 Attachments:');
      emailData.attachments.forEach((att, index) => {
        console.log(`  ${index + 1}. ${att.filename || 'unnamed'} (${att.contentType}, ${att.size} bytes)`);
      });
      console.log();
    }
    
    console.log('📋 Headers (sample):');
    const importantHeaders = ['return-path', 'received', 'authentication-results', 'dkim-signature', 'list-unsubscribe'];
    importantHeaders.forEach(header => {
      if (emailData.headers[header]) {
        const value = Array.isArray(emailData.headers[header]) 
          ? emailData.headers[header][0] 
          : emailData.headers[header];
        console.log(`  ${header}: ${typeof value === 'string' ? value.substring(0, 100) + '...' : value}`);
      }
    });
    
    // Return the full parsed data for programmatic use
    return emailData;
    
  } catch (error) {
    console.error('Error parsing email:', error);
    throw error;
  }
}

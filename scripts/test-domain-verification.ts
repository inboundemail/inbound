#!/usr/bin/env bun

import { config } from 'dotenv';
import { getDomainOwnerByDomain, markDomainAsVerified } from '@/lib/db/domains';
import { sendDomainVerificationNotification } from '@/lib/email-notifications';

// Load environment variables
config({ path: '.env' });

async function testDomainVerificationEmail(domain: string) {
  try {
    console.log(`🚀 Testing domain verification notification for: ${domain}`);
    console.log('');

    // Validate arguments
    if (!domain) {
      console.error('❌ Domain is required');
      console.error('Usage: bun run email-verified <domain>');
      process.exit(1);
    }

    // Validate environment variables
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY environment variable is required');
      process.exit(1);
    }

    // Step 1: Look up domain owner
    console.log(`🔍 Looking up domain owner for: ${domain}`);
    const domainOwner = await getDomainOwnerByDomain(domain);
    
    if (!domainOwner) {
      console.error(`❌ No owner found for domain: ${domain}`);
      console.error('Make sure the domain exists in your database and is owned by a user');
      process.exit(1);
    }

    console.log(`✅ Found domain owner:`);
    console.log(`   📧 Email: ${domainOwner.userEmail}`);
    console.log(`   👤 Name: ${domainOwner.userName || 'N/A'}`);
    console.log(`   🆔 User ID: ${domainOwner.userId}`);
    console.log('');

    // Step 2: Update domain status to verified (simulate AWS verification)
    console.log(`📝 Marking domain as verified: ${domain}`);
    const updatedDomain = await markDomainAsVerified(domain);
    
    if (!updatedDomain) {
      console.error(`❌ Failed to update domain status for: ${domain}`);
      process.exit(1);
    }

    console.log(`✅ Domain status updated to: ${updatedDomain.status}`);
    console.log('');

    // Step 3: Send verification notification email
    console.log(`📧 Sending domain verification notification...`);
    const emailResult = await sendDomainVerificationNotification({
      userEmail: domainOwner.userEmail,
      userName: domainOwner.userName,
      domain: domain,
      verifiedAt: new Date()
    });

    if (emailResult.success) {
      console.log(`✅ Domain verification notification sent successfully!`);
      console.log(`   📧 Recipient: ${domainOwner.userEmail}`);
      console.log(`   📧 Message ID: ${emailResult.messageId}`);
      console.log(`   🎉 Domain: ${domain}`);
      console.log('');
      console.log(`Check ${domainOwner.userEmail} for the verification email!`);
    } else {
      console.error(`❌ Failed to send notification email:`);
      console.error(`   Error: ${emailResult.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Usage: bun run email-verified <domain>');
  console.error('   Example: bun run email-verified example.com');
  process.exit(1);
}

const domain = args[0];

// Run the test
testDomainVerificationEmail(domain).catch(console.error); 
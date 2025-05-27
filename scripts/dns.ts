// pages/api/check-mx.js
import { checkDomainCanReceiveEmails } from '@/lib/dns';

// Test the domain to see if it can safely receive emails (no MX records)
async function testDomain() {
  const domain = "exon.dev";
  console.log(`🔍 Checking if ${domain} can safely receive emails...\n`);
  
  const result = await checkDomainCanReceiveEmails(domain);
  
  console.log('📊 DNS Check Results:');
  console.log(`Domain: ${result.domain}`);
  console.log(`Can Receive Emails: ${result.canReceiveEmails ? '✅ YES' : '❌ NO'}`);
  console.log(`Has MX Records: ${result.hasMxRecords ? '📮 YES' : '📭 NO'}`);
  
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }
  
  if (result.mxRecords && result.mxRecords.length > 0) {
    console.log('MX Records found:');
    result.mxRecords.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.exchange} (priority: ${record.priority})`);
    });
  }
  
  console.log(`Checked at: ${result.timestamp.toISOString()}`);
  
  return result;
}

testDomain().then(console.log).catch(console.error);
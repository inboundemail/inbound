import { 
  checkDomainCanReceiveEmails, 
  checkMultipleDomainsCanReceiveEmails,
  getDetailedMxInfo 
} from '@/lib/dns';

async function testDnsLibrary() {
  console.log('🔍 Testing DNS Library for Email Reception Safety\n');

  // Test single domain
  console.log('📧 Testing single domain: exon.dev');
  const result = await checkDomainCanReceiveEmails('exon.dev');
  console.log('Result:', {
    domain: result.domain,
    canReceiveEmails: result.canReceiveEmails,
    hasMxRecords: result.hasMxRecords,
    error: result.error,
    timestamp: result.timestamp.toISOString()
  });
  console.log('\n');

  // Test multiple domains
  console.log('📧 Testing multiple domains');
  const domains = ['exon.dev', 'nonexistent-domain-12345.com', 'google.com'];
  const results = await checkMultipleDomainsCanReceiveEmails(domains);
  
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.domain}:`);
    console.log(`   ✅ Can be setup for inbound emails: ${result.canReceiveEmails}`);
    console.log(`   📮 Has MX records: ${result.hasMxRecords}`);
    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`);
    }
    if (result.mxRecords && result.mxRecords.length > 0) {
      console.log(`   📬 MX Records:`, result.mxRecords);
    }
    console.log('');
  });

  // Test detailed MX info
  console.log('🔍 Getting detailed MX info for google.com');
  const detailedInfo = await getDetailedMxInfo('google.com');
  console.log('Detailed MX Info:', detailedInfo);
}

// Run the test
testDnsLibrary().catch(console.error); 
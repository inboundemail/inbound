import { checkDomainCanReceiveEmails } from '@/lib/domains-and-dns/dns'

// Array of domains to test
const testDomains = [
  'mandarin3d.com',
  'alora.tech', 
  'inbound.new',
  'example.com',
  'google.com',
  'gmail.com',
  'github.com',
  'vercel.app',
  'freshnewtestdomain.org',
  'stackoverflow.com',
  'openai.com',
  'stripe.com',
  'microsoft.com',
  'apple.com',
  'yahoo.com',
  'protonmail.com'
]

async function testDomainChecking() {
  console.log('🚀 Starting Domain Email Capability Testing')
  console.log('=' .repeat(80))
  console.log()

  const results = []

  for (const domain of testDomains) {
    console.log(`🔍 Checking: ${domain}`)
    
    try {
      const result = await checkDomainCanReceiveEmails(domain)
      results.push(result)
      
      // Pretty print individual result
      console.log(`   📊 Result: ${result.canReceiveEmails ? '✅ CAN receive emails' : '❌ CANNOT receive emails'}`)
      console.log(`   📧 Has MX Records: ${result.hasMxRecords ? '✅ Yes' : '❌ No'}`)
      
      if (result.provider) {
        console.log(`   🌐 Provider: ${result.provider.name} (${result.provider.confidence} confidence)`)
      }
      
      if (result.mxRecords && result.mxRecords.length > 0) {
        console.log(`   📮 MX Records Found (${result.mxRecords.length}):`)
        result.mxRecords.forEach(mx => {
          console.log(`      Priority ${mx.priority}: ${mx.exchange}`)
        })
      } else {
        console.log(`   📮 MX Records: None found`)
      }
      
      if (result.error) {
        console.log(`   ⚠️  Error: ${result.error}`)
      }
      
      // Add manual DNS check for debugging
      try {
        const { promises: dns } = await import('dns')
        console.log(`   🔧 Manual DNS Check:`)
        
        try {
          const manualMx = await dns.resolveMx(domain)
          console.log(`      Manual MX lookup: Found ${manualMx.length} records`)
          if (manualMx.length > 0) {
            manualMx.slice(0, 2).forEach(mx => console.log(`         ${mx.priority} ${mx.exchange}`))
            if (manualMx.length > 2) console.log(`         ... and ${manualMx.length - 2} more`)
          }
        } catch (mxError) {
          console.log(`      Manual MX lookup failed: ${mxError instanceof Error ? mxError.message : 'Unknown error'}`)
        }
        
      } catch (dnsError) {
        console.log(`   🔧 Manual DNS check failed: ${dnsError instanceof Error ? dnsError.message : 'Unknown error'}`)
      }
      
    } catch (error) {
      console.log(`   💥 Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      results.push({
        domain,
        canReceiveEmails: false,
        hasMxRecords: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      })
    }
    
    console.log()
  }

  // Summary section
  console.log('=' .repeat(80))
  console.log('📈 SUMMARY RESULTS')
  console.log('=' .repeat(80))
  
  const canReceive = results.filter(r => r.canReceiveEmails).length
  const hasEmail = results.filter(r => r.hasMxRecords).length
  const hasErrors = results.filter(r => r.error && !r.error.includes('safe for email receiving')).length
  
  console.log(`📊 Total Domains Tested: ${results.length}`)
  console.log(`✅ Can Receive Emails: ${canReceive}`)
  console.log(`📧 Already Have Email: ${hasEmail}`)
  console.log(`❌ Errors/Issues: ${hasErrors}`)
  console.log()

  // Detailed table
  console.log('📋 DETAILED RESULTS TABLE')
  console.log('-' .repeat(100))
  console.log('| Domain                    | Can Receive | Has MX | Provider          | Status')
  console.log('-' .repeat(100))
  
  results.forEach(result => {
    const domain = result.domain.padEnd(25)
    const canReceive = (result.canReceiveEmails ? '✅ Yes' : '❌ No').padEnd(11)
    const hasMx = (result.hasMxRecords ? '✅ Yes' : '❌ No').padEnd(6)
    const provider = (result.provider?.name || 'Unknown').padEnd(17)
    const status = result.error ? 
      (result.error.includes('safe') ? 'Safe' : 'Error') : 
      (result.canReceiveEmails ? 'Available' : 'In Use')
    
    console.log(`| ${domain} | ${canReceive} | ${hasMx} | ${provider} | ${status}`)
  })
  
  console.log('-' .repeat(100))
  console.log()
  
  // Provider breakdown
  console.log('🌐 PROVIDER BREAKDOWN')
  console.log('-' .repeat(40))
  const providers = results
    .filter(r => r.provider)
    .reduce((acc, r) => {
      const name = r.provider!.name
      acc[name] = (acc[name] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  
  Object.entries(providers).forEach(([provider, count]) => {
    console.log(`   ${provider}: ${count} domain(s)`)
  })
  
  console.log()
  console.log('🏁 Testing Complete!')
}

// Handle the async execution
if (require.main === module) {
  testDomainChecking().catch(console.error)
}

export { testDomainChecking } 
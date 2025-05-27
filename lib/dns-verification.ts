import { promises as dns } from 'dns'
import { Resolver } from 'dns'

export interface DnsRecordCheck {
  type: string
  name: string
  expectedValue: string
  actualValues: string[]
  isVerified: boolean
  error?: string
}

/**
 * Verify TXT record exists and matches expected value
 */
export async function verifyTxtRecord(name: string, expectedValue: string): Promise<DnsRecordCheck> {
  const result: DnsRecordCheck = {
    type: 'TXT',
    name,
    expectedValue,
    actualValues: [],
    isVerified: false,
  }

  try {
    const txtRecords = await dns.resolveTxt(name)
    result.actualValues = txtRecords.flat()
    result.isVerified = result.actualValues.some(value => value === expectedValue)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error'
    
    // Provide more user-friendly error messages
    if (errorMessage.includes('ENODATA') || errorMessage.includes('ENOTFOUND')) {
      result.error = `No TXT records found for ${name}. Please add the TXT record to your DNS.`
    } else {
      result.error = errorMessage
    }
    
    result.isVerified = false
  }

  return result
}

/**
 * Verify MX record exists and matches expected value
 */
export async function verifyMxRecord(name: string, expectedValue: string): Promise<DnsRecordCheck> {
  const result: DnsRecordCheck = {
    type: 'MX',
    name,
    expectedValue,
    actualValues: [],
    isVerified: false,
  }

  try {
    console.log(`🔍 MX Verification - Checking MX records for: ${name}`)
    console.log(`🎯 MX Verification - Expected value: ${expectedValue}`)
    
    const mxRecords = await dns.resolveMx(name)
    console.log(`📋 MX Verification - Found ${mxRecords.length} MX records:`, mxRecords)
    
    result.actualValues = mxRecords.map(record => `${record.priority} ${record.exchange}`)
    console.log(`📊 MX Verification - Formatted values:`, result.actualValues)
    
    result.isVerified = result.actualValues.some(value => value === expectedValue)
    console.log(`✅ MX Verification - Is verified: ${result.isVerified}`)
    
    if (!result.isVerified && result.actualValues.length > 0) {
      console.log(`❌ MX Verification - Expected "${expectedValue}" but found:`, result.actualValues)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error'
    console.log(`💥 MX Verification - DNS lookup failed for ${name}:`, errorMessage)
    
    // Provide more user-friendly error messages
    if (errorMessage.includes('ENODATA') || errorMessage.includes('ENOTFOUND')) {
      result.error = `No MX records found for ${name}. Please add the MX record to your DNS.`
    } else {
      result.error = errorMessage
    }
    
    result.isVerified = false
  }

  return result
}

/**
 * Try alternative DNS resolution using different resolvers
 */
async function tryAlternativeMxResolution(name: string): Promise<Array<{priority: number, exchange: string}>> {
  const resolvers = [
    ['8.8.8.8', '8.8.4.4'], // Google DNS
    ['1.1.1.1', '1.0.0.1'], // Cloudflare DNS
    ['208.67.222.222', '208.67.220.220'], // OpenDNS
  ]

  for (const resolverIPs of resolvers) {
    try {
      console.log(`🔄 MX Alternative - Trying resolver: ${resolverIPs.join(', ')}`)
      const resolver = new Resolver()
      resolver.setServers(resolverIPs)
      
      const mxRecords = await new Promise<Array<{priority: number, exchange: string}>>((resolve, reject) => {
        resolver.resolveMx(name, (err, records) => {
          if (err) reject(err)
          else resolve(records || [])
        })
      })
      
      if (mxRecords.length > 0) {
        console.log(`✅ MX Alternative - Found records with ${resolverIPs[0]}:`, mxRecords)
        return mxRecords
      }
    } catch (error) {
      console.log(`❌ MX Alternative - Failed with ${resolverIPs[0]}:`, error instanceof Error ? error.message : 'Unknown error')
      continue
    }
  }
  
  return []
}

/**
 * Enhanced MX record verification with fallback resolvers
 */
export async function verifyMxRecordWithFallback(name: string, expectedValue: string): Promise<DnsRecordCheck> {
  const result: DnsRecordCheck = {
    type: 'MX',
    name,
    expectedValue,
    actualValues: [],
    isVerified: false,
  }

  try {
    console.log(`🔍 MX Verification - Checking MX records for: ${name}`)
    console.log(`🎯 MX Verification - Expected value: ${expectedValue}`)
    
    // Try default DNS first
    let mxRecords: Array<{priority: number, exchange: string}> = []
    try {
      mxRecords = await dns.resolveMx(name)
      console.log(`📋 MX Verification - Default DNS found ${mxRecords.length} MX records:`, mxRecords)
    } catch (error) {
      console.log(`⚠️ MX Verification - Default DNS failed, trying alternative resolvers...`)
      mxRecords = await tryAlternativeMxResolution(name)
    }
    
    result.actualValues = mxRecords.map(record => `${record.priority} ${record.exchange}`)
    console.log(`📊 MX Verification - Formatted values:`, result.actualValues)
    
    result.isVerified = result.actualValues.some(value => value === expectedValue)
    console.log(`✅ MX Verification - Is verified: ${result.isVerified}`)
    
    if (!result.isVerified && result.actualValues.length > 0) {
      console.log(`❌ MX Verification - Expected "${expectedValue}" but found:`, result.actualValues)
    }
    
    if (result.actualValues.length === 0) {
      result.error = `No MX records found for ${name} using multiple DNS resolvers. Please add the MX record to your DNS.`
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error'
    console.log(`💥 MX Verification - All DNS lookups failed for ${name}:`, errorMessage)
    result.error = `DNS resolution failed: ${errorMessage}`
    result.isVerified = false
  }

  return result
}

/**
 * Verify multiple DNS records
 */
export async function verifyDnsRecords(records: Array<{
  type: string
  name: string
  value: string
}>): Promise<DnsRecordCheck[]> {
  const checks = records.map(async (record) => {
    switch (record.type.toUpperCase()) {
      case 'TXT':
        return verifyTxtRecord(record.name, record.value)
      case 'MX':
        return verifyMxRecordWithFallback(record.name, record.value)
      default:
        return {
          type: record.type,
          name: record.name,
          expectedValue: record.value,
          actualValues: [],
          isVerified: false,
          error: `Unsupported record type: ${record.type}`,
        }
    }
  })

  return Promise.all(checks)
} 
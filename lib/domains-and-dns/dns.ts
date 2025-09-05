/**
 * DNS Library - Consolidated DNS functionality
 * 
 * Provides comprehensive DNS functionality including:
 * - Domain availability checking (ensures no conflicting MX/CNAME records)
 * - DNS record verification (confirms required records exist and match expected values)  
 * - Domain provider detection with fallback resolvers
 * - Used throughout domain onboarding and verification workflows
 */

import { promises as dns } from 'dns';
import { Resolver } from 'dns'

/**
 * MX Record type definition
 */
export interface MxRecord {
  exchange: string;
  priority: number;
}

/**
 * DNS record verification result (from dns-verification.ts)
 */
export interface DnsRecordCheck {
  type: string
  name: string
  expectedValue: string
  actualValues: string[]
  isVerified: boolean
  error?: string
}

/**
 * Domain provider information
 */
export interface DomainProvider {
  name: string;
  icon: string; // Icon identifier for UI
  detected: boolean;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * DNS check result types
 */
export interface DnsCheckResult {
  domain: string;
  canReceiveEmails: boolean;
  hasMxRecords: boolean;
  mxRecords?: MxRecord[];
  provider?: DomainProvider;
  error?: string;
  timestamp: Date;
}

export interface DnsError {
  code: string;
  errno: number;
  message: string;
}

/**
 * Domain provider patterns based on nameservers
 */
const PROVIDER_PATTERNS = {
  cloudflare: {
    name: 'Cloudflare',
    icon: 'cloudflare',
    patterns: ['cloudflare.com', 'ns.cloudflare.com', 'cloudflare.net']
  },
  namecheap: {
    name: 'Namecheap',
    icon: 'namecheap', 
    patterns: ['registrar-servers.com', 'namecheap.com', 'namecheaphosting.com']
  },
  godaddy: {
    name: 'GoDaddy',
    icon: 'godaddy',
    patterns: ['domaincontrol.com', 'godaddy.com', 'secureserver.net']
  },
  route53: {
    name: 'AWS Route 53',
    icon: 'aws',
    patterns: ['awsdns', 'amazonaws.com', 'awsdns-']
  },
  google: {
    name: 'Google Domains',
    icon: 'google',
    patterns: ['googledomains.com', 'google.com', 'googlehosted.com']
  },
  vercel: {
    name: 'Vercel',
    icon: 'vercel',
    patterns: ['vercel-dns.com', 'vercel.app']
  },
  digitalocean: {
    name: 'DigitalOcean',
    icon: 'digitalocean',
    patterns: ['digitalocean.com', 'ns1.digitalocean.com', 'ns2.digitalocean.com', 'ns3.digitalocean.com']
  },
  netlify: {
    name: 'Netlify',
    icon: 'netlify',
    patterns: ['netlify.com', 'dns1.p01.nsone.net', 'dns2.p01.nsone.net']
  },
  dnsimple: {
    name: 'DNSimple',
    icon: 'dnsimple',
    patterns: ['dnsimple.com', 'ns1.dnsimple.com', 'ns2.dnsimple.com']
  },
  hover: {
    name: 'Hover',
    icon: 'hover',
    patterns: ['hover.com', 'ns1.hover.com', 'ns2.hover.com']
  },
  porkbun: {
    name: 'Porkbun',
    icon: 'porkbun',
    patterns: ['porkbun.com', 'curitiba.porkbun.com', 'fortaleza.porkbun.com']
  },
  squarespace: {
    name: 'Squarespace',
    icon: 'squarespace',
    patterns: ['squarespace.com', 'ext-dns.squarespace.com']
  }
};

/**
 * Get all parent domains for a given domain
 * @param domain - Domain to get parents for
 * @returns Array of parent domains from most specific to least specific
 */
function getParentDomains(domain: string): string[] {
  const parts = domain.split('.');
  const parents: string[] = [];
  
  // Start from the second level (skip the subdomain)
  for (let i = 1; i < parts.length; i++) {
    parents.push(parts.slice(i).join('.'));
  }
  
  return parents;
}

/**
 * Detect domain provider based on nameservers with fallback to parent domains
 * @param domain - Domain to check
 * @returns Promise<DomainProvider | null> - Detected provider or null
 */
export async function detectDomainProvider(domain: string): Promise<DomainProvider | null> {
  // Try the original domain first
  const result = await tryDetectProvider(domain);
  if (result && result.detected) {
    return result;
  }

  // If no provider found or low confidence, try parent domains
  const parentDomains = getParentDomains(domain);
  
  for (const parentDomain of parentDomains) {
    try {
      const parentResult = await tryDetectProvider(parentDomain);
      if (parentResult && parentResult.detected) {
        // Found a provider on parent domain, but mark confidence as medium
        return {
          ...parentResult,
          confidence: parentResult.confidence === 'high' ? 'medium' : 'low'
        };
      }
    } catch (error) {
      // Continue to next parent domain if this one fails
      continue;
    }
  }
  
  // If no provider detected on any level, return the original result or generic
  return result || {
    name: 'DNS Provider',
    icon: 'globe',
    detected: false,
    confidence: 'low'
  };
}

/**
 * Try to detect provider for a specific domain
 * @param domain - Domain to check
 * @returns Promise<DomainProvider | null> - Detected provider or null
 */
async function tryDetectProvider(domain: string): Promise<DomainProvider | null> {
  try {
    const nameservers = await dns.resolveNs(domain);
    
    for (const [key, provider] of Object.entries(PROVIDER_PATTERNS)) {
      for (const ns of nameservers) {
        for (const pattern of provider.patterns) {
          if (ns.toLowerCase().includes(pattern.toLowerCase())) {
            return {
              name: provider.name,
              icon: provider.icon,
              detected: true,
              confidence: 'high'
            };
          }
        }
      }
    }
    
    // If nameservers found but no specific provider detected
    if (nameservers.length > 0) {
      return {
        name: 'Custom DNS Provider',
        icon: 'globe',
        detected: false,
        confidence: 'medium'
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if a domain can safely receive emails by verifying it does NOT have MX records
 * @param domain - The domain to check
 * @returns Promise<DnsCheckResult> - Result indicating if domain can receive emails
 */
export async function checkDomainCanReceiveEmails(domain: string): Promise<DnsCheckResult> {
  const result: DnsCheckResult = {
    domain,
    canReceiveEmails: false,
    hasMxRecords: false,
    timestamp: new Date(),
  };

  // Validate domain format
  if (!isValidDomain(domain)) {
    result.error = 'Invalid domain format';
    return result;
  }

  // Detect domain provider
  try {
    const provider = await detectDomainProvider(domain);
    if (provider) {
      result.provider = provider;
    }
  } catch (error) {
    // Provider detection failure is not critical, continue
  }

  // Check MX records separately
  let mxRecords: MxRecord[] = [];
  let mxError: string | null = null;
  
  try {
    mxRecords = await dns.resolveMx(domain);
    console.log('🏁 CANDOMAINRECEIVE 🏁 \n MX Records:', mxRecords);
  } catch (error) {
    const dnsError = error as DnsError;
    if (dnsError.code !== 'ENOTFOUND' && dnsError.code !== 'ENODATA') {
      mxError = dnsError.message;
    }
    // ENOTFOUND/ENODATA for MX is expected for domains without email
  }

  // Check CNAME records separately
  let cnameRecords: string[] = [];
  let cnameError: string | null = null;
  
  try {
    cnameRecords = await dns.resolveCname(domain);
  } catch (error) {
    const dnsError = error as DnsError;
    if (dnsError.code !== 'ENOTFOUND' && dnsError.code !== 'ENODATA') {
      cnameError = dnsError.message;
    }
    // ENOTFOUND/ENODATA for CNAME is normal for most domains
  }

  // Determine if domain can receive emails
  const hasMxRecords = mxRecords.length > 0;
  const hasCnameRecords = cnameRecords.length > 0;

  if (hasMxRecords || hasCnameRecords) {
    // Domain HAS MX or CNAME records - cannot safely receive emails
    result.hasMxRecords = hasMxRecords;
    result.mxRecords = mxRecords;
    result.canReceiveEmails = false;
    
    if (hasMxRecords) {
      result.error = `Domain has ${mxRecords.length} MX record(s) - email already configured`;
    } else if (hasCnameRecords) {
      result.error = `Domain has CNAME record(s) - conflicts with MX records`;
    }
  } else {
    // Domain has no MX or CNAME records - can receive emails
    result.hasMxRecords = false;
    result.canReceiveEmails = true;
    
    if (mxError || cnameError) {
      const errors = [mxError, cnameError].filter(Boolean);
      result.error = `Domain check: ${errors.join(', ')} (safe for email receiving)`;
    }
  }

  return result;
}

/**
 * Batch check multiple domains
 * @param domains - Array of domains to check
 * @returns Promise<DnsCheckResult[]> - Array of results for each domain
 */
export async function checkMultipleDomainsCanReceiveEmails(
  domains: string[]
): Promise<DnsCheckResult[]> {
  const promises = domains.map(domain => checkDomainCanReceiveEmails(domain));
  return Promise.all(promises);
}

/**
 * Simple domain validation
 * @param domain - Domain to validate
 * @returns boolean - True if domain format is valid
 */
function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return domainRegex.test(domain) && domain.length <= 253;
}

/**
 * Get detailed provider information including nameservers
 * @param domain - Domain to check
 * @returns Promise with detailed provider information
 */
export async function getDetailedProviderInfo(domain: string): Promise<{
  domain: string;
  provider: DomainProvider | null;
  nameservers: string[];
  checkedDomains: string[];
  error?: string;
}> {
  const checkedDomains: string[] = [domain];
  
  try {
    // Try original domain first
    let nameservers: string[] = [];
    try {
      nameservers = await dns.resolveNs(domain);
    } catch (error) {
      // If original domain fails, try parent domains
      const parentDomains = getParentDomains(domain);
      checkedDomains.push(...parentDomains);
      
      for (const parentDomain of parentDomains) {
        try {
          nameservers = await dns.resolveNs(parentDomain);
          break; // Use first successful parent domain
        } catch (parentError) {
          continue;
        }
      }
    }
    
    const provider = await detectDomainProvider(domain);
    
    return {
      domain,
      provider,
      nameservers,
      checkedDomains,
    };
  } catch (error) {
    const dnsError = error as DnsError;
    return {
      domain,
      provider: null,
      nameservers: [],
      checkedDomains,
      error: dnsError.message,
    };
  }
}

/**
 * Get detailed MX record information for a domain (for debugging)
 * @param domain - Domain to check
 * @returns Promise with detailed MX information
 */
export async function getDetailedMxInfo(domain: string): Promise<{
  domain: string;
  mxRecords: MxRecord[];
  hasRecords: boolean;
  error?: string;
}> {
  try {
    const mxRecords = await dns.resolveMx(domain);
    return {
      domain,
      mxRecords,
      hasRecords: mxRecords.length > 0,
    };
  } catch (error) {
    const dnsError = error as DnsError;
    return {
      domain,
      mxRecords: [],
      hasRecords: false,
      error: dnsError.message,
    };
  }
}

/**
 * Verify TXT record exists and matches expected value (from dns-verification.ts)
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
    console.log(`🔍 TXT Verification - Checking TXT records for: ${name}`)
    console.log(`🎯 TXT Verification - Expected value: ${expectedValue}`)
    
    const txtRecords = await dns.resolveTxt(name)
    console.log(`📋 TXT Verification - Found ${txtRecords.length} TXT records:`, txtRecords)
    
    result.actualValues = txtRecords.flat()
    console.log(`📊 TXT Verification - Flattened values:`, result.actualValues)
    
    result.isVerified = result.actualValues.some(value => value === expectedValue)
    console.log(`✅ TXT Verification - Is verified: ${result.isVerified}`)
    
    if (!result.isVerified && result.actualValues.length > 0) {
      console.log(`❌ TXT Verification - Expected "${expectedValue}" but found:`, result.actualValues)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error'
    console.log(`💥 TXT Verification - DNS lookup failed for ${name}:`, errorMessage)
    
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
 * Verify MX record exists and matches expected value (from dns-verification.ts)
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
 * Try alternative DNS resolution for TXT records using different resolvers
 */
async function tryAlternativeTxtResolution(name: string): Promise<string[][]> {
  const resolvers = [
    ['8.8.8.8', '8.8.4.4'], // Google DNS
    ['1.1.1.1', '1.0.0.1'], // Cloudflare DNS
    ['208.67.222.222', '208.67.220.220'], // OpenDNS
  ]

  for (const resolverIPs of resolvers) {
    try {
      console.log(`🔄 TXT Alternative - Trying resolver: ${resolverIPs.join(', ')}`)
      const resolver = new Resolver()
      resolver.setServers(resolverIPs)
      
      const txtRecords = await new Promise<string[][]>((resolve, reject) => {
        resolver.resolveTxt(name, (err, records) => {
          if (err) reject(err)
          else resolve(records || [])
        })
      })
      
      if (txtRecords.length > 0) {
        console.log(`✅ TXT Alternative - Found records with ${resolverIPs[0]}:`, txtRecords)
        return txtRecords
      }
    } catch (error) {
      console.log(`❌ TXT Alternative - Failed with ${resolverIPs[0]}:`, error instanceof Error ? error.message : 'Unknown error')
      continue
    }
  }
  
  return []
}

/**
 * Try alternative DNS resolution using different resolvers (from dns-verification.ts)
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
 * Enhanced MX record verification with fallback resolvers (from dns-verification.ts)
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
 * Enhanced TXT record verification with fallback resolvers
 */
export async function verifyTxtRecordWithFallback(name: string, expectedValue: string): Promise<DnsRecordCheck> {
  const result: DnsRecordCheck = {
    type: 'TXT',
    name,
    expectedValue,
    actualValues: [],
    isVerified: false,
  }

  try {
    console.log(`🔍 TXT Verification - Checking TXT records for: ${name}`)
    console.log(`🎯 TXT Verification - Expected value: ${expectedValue}`)
    
    // Try default DNS first
    let txtRecords: string[][] = []
    try {
      txtRecords = await dns.resolveTxt(name)
      console.log(`📋 TXT Verification - Default DNS found ${txtRecords.length} TXT records:`, txtRecords)
    } catch (error) {
      console.log(`⚠️ TXT Verification - Default DNS failed, trying alternative resolvers...`)
      txtRecords = await tryAlternativeTxtResolution(name)
    }
    
    result.actualValues = txtRecords.flat()
    console.log(`📊 TXT Verification - Flattened values:`, result.actualValues)
    
    result.isVerified = result.actualValues.some(value => value === expectedValue)
    console.log(`✅ TXT Verification - Is verified: ${result.isVerified}`)
    
    if (!result.isVerified && result.actualValues.length > 0) {
      console.log(`❌ TXT Verification - Expected "${expectedValue}" but found:`, result.actualValues)
    }
    
    if (result.actualValues.length === 0) {
      result.error = `No TXT records found for ${name} using multiple DNS resolvers. Please add the TXT record to your DNS.`
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error'
    console.log(`💥 TXT Verification - All DNS lookups failed for ${name}:`, errorMessage)
    result.error = `DNS resolution failed: ${errorMessage}`
    result.isVerified = false
  }

  return result
}

/**
 * Verify CNAME record exists and matches expected value
 */
export async function verifyCnameRecord(name: string, expectedValue: string): Promise<DnsRecordCheck> {
  const result: DnsRecordCheck = {
    type: 'CNAME',
    name,
    expectedValue,
    actualValues: [],
    isVerified: false,
  }

  try {
    console.log(`🔍 CNAME Verification - Checking CNAME records for: ${name}`)
    console.log(`🎯 CNAME Verification - Expected value: ${expectedValue}`)
    
    const cnameRecords = await dns.resolveCname(name)
    console.log(`📋 CNAME Verification - Found ${cnameRecords.length} CNAME records:`, cnameRecords)
    
    result.actualValues = cnameRecords
    console.log(`📊 CNAME Verification - Values:`, result.actualValues)
    
    // CNAME matching should be case-insensitive and handle trailing dots
    const normalizeValue = (value: string) => value.toLowerCase().replace(/\.$/, '')
    const expectedNormalized = normalizeValue(expectedValue)
    
    result.isVerified = result.actualValues.some(value => 
      normalizeValue(value) === expectedNormalized
    )
    console.log(`✅ CNAME Verification - Is verified: ${result.isVerified}`)
    
    if (!result.isVerified && result.actualValues.length > 0) {
      console.log(`❌ CNAME Verification - Expected "${expectedValue}" but found:`, result.actualValues)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error'
    console.log(`💥 CNAME Verification - DNS lookup failed for ${name}:`, errorMessage)
    
    // Provide more user-friendly error messages
    if (errorMessage.includes('ENODATA') || errorMessage.includes('ENOTFOUND')) {
      result.error = `No CNAME records found for ${name}. Please add the CNAME record to your DNS.`
    } else {
      result.error = errorMessage
    }
    
    result.isVerified = false
  }

  return result
}

/**
 * Enhanced CNAME record verification with fallback resolvers
 */
export async function verifyCnameRecordWithFallback(name: string, expectedValue: string): Promise<DnsRecordCheck> {
  const result: DnsRecordCheck = {
    type: 'CNAME',
    name,
    expectedValue,
    actualValues: [],
    isVerified: false,
  }

  try {
    console.log(`🔍 CNAME Verification - Checking CNAME records for: ${name}`)
    console.log(`🎯 CNAME Verification - Expected value: ${expectedValue}`)
    
    // Try default DNS first
    let cnameRecords: string[] = []
    try {
      cnameRecords = await dns.resolveCname(name)
      console.log(`📋 CNAME Verification - Default DNS found ${cnameRecords.length} CNAME records:`, cnameRecords)
    } catch (error) {
      console.log(`⚠️ CNAME Verification - Default DNS failed, trying alternative resolvers...`)
      cnameRecords = await tryAlternativeCnameResolution(name)
    }
    
    result.actualValues = cnameRecords
    console.log(`📊 CNAME Verification - Values:`, result.actualValues)
    
    // CNAME matching should be case-insensitive and handle trailing dots
    const normalizeValue = (value: string) => value.toLowerCase().replace(/\.$/, '')
    const expectedNormalized = normalizeValue(expectedValue)
    
    result.isVerified = result.actualValues.some(value => 
      normalizeValue(value) === expectedNormalized
    )
    console.log(`✅ CNAME Verification - Is verified: ${result.isVerified}`)
    
    if (!result.isVerified && result.actualValues.length > 0) {
      console.log(`❌ CNAME Verification - Expected "${expectedValue}" but found:`, result.actualValues)
    }
    
    if (result.actualValues.length === 0) {
      result.error = `No CNAME records found for ${name} using multiple DNS resolvers. Please add the CNAME record to your DNS.`
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown DNS error'
    console.log(`💥 CNAME Verification - All DNS lookups failed for ${name}:`, errorMessage)
    result.error = `DNS resolution failed: ${errorMessage}`
    result.isVerified = false
  }

  return result
}

/**
 * Try alternative DNS resolution for CNAME records using different resolvers
 */
async function tryAlternativeCnameResolution(name: string): Promise<string[]> {
  const resolvers = [
    ['8.8.8.8', '8.8.4.4'], // Google DNS
    ['1.1.1.1', '1.0.0.1'], // Cloudflare DNS
    ['208.67.222.222', '208.67.220.220'], // OpenDNS
  ]

  for (const resolverIPs of resolvers) {
    try {
      console.log(`🔄 CNAME Alternative - Trying resolver: ${resolverIPs.join(', ')}`)
      const resolver = new Resolver()
      resolver.setServers(resolverIPs)
      
      const cnameRecords = await new Promise<string[]>((resolve, reject) => {
        resolver.resolveCname(name, (err, records) => {
          if (err) reject(err)
          else resolve(records || [])
        })
      })
      
      if (cnameRecords.length > 0) {
        console.log(`✅ CNAME Alternative - Found records with ${resolverIPs[0]}:`, cnameRecords)
        return cnameRecords
      }
    } catch (error) {
      console.log(`❌ CNAME Alternative - Failed with ${resolverIPs[0]}:`, error instanceof Error ? error.message : 'Unknown error')
      continue
    }
  }
  
  return []
}

/**
 * Verify multiple DNS records (from dns-verification.ts)
 */
export async function verifyDnsRecords(records: Array<{
  type: string
  name: string
  value: string
}>): Promise<DnsRecordCheck[]> {
  console.log(`📋 Starting verification of ${records.length} DNS records:`)
  records.forEach((record, index) => {
    console.log(`  ${index + 1}. ${record.type} record for ${record.name}`)
  })
  
  const checks = records.map(async (record) => {
    switch (record.type.toUpperCase()) {
      case 'TXT':
        return verifyTxtRecordWithFallback(record.name, record.value)
      case 'MX':
        return verifyMxRecordWithFallback(record.name, record.value)
      case 'CNAME':
        return verifyCnameRecordWithFallback(record.name, record.value)
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
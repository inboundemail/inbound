/**
 * Domain parsing and utility functions
 * Handles root domain extraction and subdomain detection
 */

import { parse } from 'tldts'

/**
 * Get the root domain from a domain string using the Public Suffix List
 * Correctly handles multi-level TLDs (e.g., example.co.uk)
 * 
 * @example
 * getRootDomain('mail.example.com') // 'example.com'
 * getRootDomain('docs.app.example.com') // 'example.com'
 * getRootDomain('app.example.com') // 'example.com'
 * getRootDomain('example.com') // 'example.com'
 * getRootDomain('mail.example.co.uk') // 'example.co.uk'
 */
export function getRootDomain(domain: string): string | null {
  try {
    const parsed = parse(domain)
    // Check if it's an IP address or domain is null/empty
    if (parsed.isIp || !parsed.domain) {
      return null
    }
    return parsed.domain
  } catch (error) {
    // If parse throws an error, return null
    return null
  }
}

/**
 * Check if a domain is a root domain (no subdomain prefix)
 * Correctly handles multi-level TLDs using the Public Suffix List
 * 
 * @example
 * isRootDomain('example.com') // true
 * isRootDomain('example.co.uk') // true
 * isRootDomain('mail.example.com') // false
 * isRootDomain('mail.example.co.uk') // false
 */
export function isRootDomain(domain: string): boolean {
  const rootDomain = getRootDomain(domain)
  return rootDomain === domain
}

/**
 * Check if a domain is a subdomain (has a prefix before the root domain)
 * Correctly handles multi-level TLDs using the Public Suffix List
 * 
 * @example
 * isSubdomain('mail.example.com') // true
 * isSubdomain('docs.app.example.com') // true
 * isSubdomain('mail.example.co.uk') // true
 * isSubdomain('example.com') // false
 * isSubdomain('example.co.uk') // false
 */
export function isSubdomain(domain: string): boolean {
  const rootDomain = getRootDomain(domain)
  if (!rootDomain) return false
  return domain !== rootDomain && domain.endsWith('.' + rootDomain)
}


export function getWildcardMxRecord(domain: string, awsRegion: string = process.env.AWS_REGION || 'us-east-2') {
  return {
    type: 'MX',
    name: `*.${domain}`,
    value: `10 inbound-smtp.${awsRegion}.amazonaws.com`,
    description: `Wildcard MX record that routes mail for every subdomain of ${domain} to Inbound. Subdomains that already have their own DNS records need their own MX record.`,
    isRequired: true,
  }
}

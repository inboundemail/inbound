import { promises as dns } from 'dns';

/**
 * MX Record type definition
 */
export interface MxRecord {
  exchange: string;
  priority: number;
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

  try {
    // Validate domain format
    if (!isValidDomain(domain)) {
      result.error = 'Invalid domain format';
      return result;
    }

    // Detect domain provider
    const provider = await detectDomainProvider(domain);
    if (provider) {
      result.provider = provider;
    }

    // Try to resolve MX records
    const mxRecords = await dns.resolveMx(domain);
    
    if (mxRecords && mxRecords.length > 0) {
      // Domain HAS MX records - cannot safely receive emails
      result.hasMxRecords = true;
      result.mxRecords = mxRecords;
      result.canReceiveEmails = false;
    } else {
      // Domain has no MX records - can receive emails
      result.hasMxRecords = false;
      result.canReceiveEmails = true;
    }
  } catch (error) {
    const dnsError = error as DnsError;
    
    // If domain not found or no MX records, it's safe to receive emails
    if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
      result.hasMxRecords = false;
      result.canReceiveEmails = true;
      result.error = `Domain check: ${dnsError.message} (safe for email receiving)`;
    } else {
      // Other DNS errors
      result.error = dnsError.message || 'Unknown DNS error';
      result.canReceiveEmails = false;
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
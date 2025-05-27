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
    patterns: ['cloudflare.com', 'ns.cloudflare.com']
  },
  namecheap: {
    name: 'Namecheap',
    icon: 'namecheap', 
    patterns: ['registrar-servers.com', 'namecheap.com']
  },
  godaddy: {
    name: 'GoDaddy',
    icon: 'godaddy',
    patterns: ['domaincontrol.com', 'godaddy.com']
  },
  route53: {
    name: 'AWS Route 53',
    icon: 'aws',
    patterns: ['awsdns', 'amazonaws.com']
  },
  google: {
    name: 'Google Domains',
    icon: 'google',
    patterns: ['googledomains.com', 'google.com']
  },
  vercel: {
    name: 'Vercel',
    icon: 'vercel',
    patterns: ['vercel-dns.com']
  }
};

/**
 * Detect domain provider based on nameservers
 * @param domain - Domain to check
 * @returns Promise<DomainProvider | null> - Detected provider or null
 */
export async function detectDomainProvider(domain: string): Promise<DomainProvider | null> {
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
    
    // If no specific provider detected, return generic
    return {
      name: 'DNS Provider',
      icon: 'globe',
      detected: false,
      confidence: 'low'
    };
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
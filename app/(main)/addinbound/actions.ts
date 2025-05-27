"use server"

import { checkDomainCanReceiveEmails, checkMultipleDomainsCanReceiveEmails, type DnsCheckResult } from "@/lib/dns"

export async function checkDomainAction(domain: string): Promise<DnsCheckResult> {
  try {
    const result = await checkDomainCanReceiveEmails(domain)
    return result
  } catch (error) {
    console.error("Error checking domain:", error)
    return {
      domain,
      canReceiveEmails: false,
      hasMxRecords: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      timestamp: new Date(),
    }
  }
}

export async function checkSubdomainsAction(domain: string, subdomains: string[]): Promise<DnsCheckResult[]> {
  try {
    const fullDomains = subdomains.map(sub => `${sub}.${domain}`)
    const results = await checkMultipleDomainsCanReceiveEmails(fullDomains)
    return results
  } catch (error) {
    console.error("Error checking subdomains:", error)
    return subdomains.map(sub => ({
      domain: `${sub}.${domain}`,
      canReceiveEmails: false,
      hasMxRecords: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      timestamp: new Date(),
    }))
  }
}

export async function checkCustomSubdomainAction(domain: string, subdomain: string): Promise<DnsCheckResult> {
  try {
    const fullDomain = `${subdomain}.${domain}`
    const result = await checkDomainCanReceiveEmails(fullDomain)
    return result
  } catch (error) {
    console.error("Error checking custom subdomain:", error)
    return {
      domain: `${subdomain}.${domain}`,
      canReceiveEmails: false,
      hasMxRecords: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      timestamp: new Date(),
    }
  }
}

// Simulate DNS configuration check (replace with real implementation later)
export async function checkDnsConfigurationAction(domain: string): Promise<{ configured: boolean; error?: string }> {
  try {
    // For now, simulate the check with a delay and random result
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // In a real implementation, you would check if the MX record points to your service
    // For now, simulate 70% success rate
    const configured = Math.random() > 0.3
    
    return { configured }
  } catch (error) {
    console.error("Error checking DNS configuration:", error)
    return {
      configured: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
} 
/**
 * Utility functions for parsing webhook URLs and extracting meaningful names
 */

/**
 * Extract a meaningful name from a webhook URL
 * @param url - The webhook URL to parse
 * @returns A user-friendly name for the webhook
 */
export function extractWebhookNameFromUrl(url: string): string {
  if (!url || !isValidUrl(url)) {
    return ''
  }

  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    const pathname = urlObj.pathname

    // Remove common webhook prefixes/suffixes from pathname
    const cleanPath = pathname
      .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
      .replace(/webhooks?\/*/gi, '') // Remove "webhook" or "webhooks"
      .replace(/api\/*/gi, '') // Remove "api"
      .replace(/inbound\/*/gi, '') // Remove "inbound"
      .replace(/callback\/*/gi, '') // Remove "callback"
      .replace(/notify\/*/gi, '') // Remove "notify"
      .replace(/hook\/*/gi, '') // Remove "hook"

    // Extract domain name (remove subdomains for common services)
    let domainName = hostname

    // Handle common webhook services
    if (hostname.includes('discord.com') || hostname.includes('discordapp.com')) {
      return 'Discord Webhook'
    }
    if (hostname.includes('slack.com') || hostname.includes('hooks.slack.com')) {
      return 'Slack Webhook'
    }
    if (hostname.includes('zapier.com')) {
      return 'Zapier Webhook'
    }
    if (hostname.includes('make.com') || hostname.includes('integromat.com')) {
      return 'Make (Integromat) Webhook'
    }
    if (hostname.includes('ifttt.com')) {
      return 'IFTTT Webhook'
    }
    if (hostname.includes('webhook.site')) {
      return 'Webhook.site Test'
    }
    if (hostname.includes('ngrok.io') || hostname.includes('ngrok.app')) {
      return 'Ngrok Tunnel'
    }
    if (hostname.includes('requestbin.com')) {
      return 'RequestBin Test'
    }
    if (hostname.includes('pipedream.com')) {
      return 'Pipedream Webhook'
    }

    // Handle localhost and IP addresses
    if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      const pathParts = cleanPath.split('/').filter(Boolean)
      if (pathParts.length > 0) {
        return `Local ${capitalize(pathParts[pathParts.length - 1])}`
      }
      return 'Local Development'
    }

    // Remove common subdomains
    domainName = domainName
      .replace(/^(www|api|webhook|hooks|app)\./, '')
      
    // Extract company/service name from domain
    const domainParts = domainName.split('.')
    if (domainParts.length >= 2) {
      const mainDomain = domainParts[0]
      
      // Use path if it provides more context
      const pathParts = cleanPath.split('/').filter(Boolean)
      if (pathParts.length > 0 && pathParts[pathParts.length - 1] !== 'webhook') {
        const lastPath = pathParts[pathParts.length - 1]
        return `${capitalize(mainDomain)} ${capitalize(lastPath)}`
      }
      
      return `${capitalize(mainDomain)} Webhook`
    }

    // Fallback to hostname
    return `${capitalize(domainName)} Webhook`
    
  } catch (error) {
    // If URL parsing fails, try to extract something useful from the string
    const parts = url.split(/[\/\.]/).filter(Boolean)
    if (parts.length > 1) {
      // Try to find a meaningful part
      const meaningfulPart = parts.find(part => 
        !['http', 'https', 'www', 'com', 'org', 'net', 'io'].includes(part.toLowerCase())
      )
      if (meaningfulPart) {
        return `${capitalize(meaningfulPart)} Webhook`
      }
    }
    
    return 'Custom Webhook'
  }
}

/**
 * Check if a string is a valid URL
 * @param urlString - The string to validate
 * @returns True if the string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Capitalize the first letter of a string
 * @param str - The string to capitalize
 * @returns The capitalized string
 */
function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

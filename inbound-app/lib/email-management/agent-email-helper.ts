/**
 * Helper functions for handling special agent@inbnd.dev email address
 * This email can be used by any user for sending emails through the v2 APIs
 */

/**
 * Check if an email address is the special agent@inbnd.dev address
 */
export function isAgentEmail(email: string): boolean {
  // Extract just the email address part, removing any name formatting
  const emailMatch = email.match(/<([^>]+)>/) || [null, email]
  const cleanEmail = emailMatch[1] || email
  
  return cleanEmail.toLowerCase() === 'agent@inbnd.dev'
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  // Extract just the email address part, removing any name formatting
  const emailMatch = email.match(/<([^>]+)>/) || [null, email]
  const cleanEmail = emailMatch[1] || email
  
  const parts = cleanEmail.split('@')
  return parts.length === 2 ? parts[1].toLowerCase() : ''
}

/**
 * Extract email address from formatted email (removes name part)
 */
export function extractEmailAddress(email: string): string {
  // Handle "Name <email@domain.com>" format
  const emailMatch = email.match(/<([^>]+)>/)
  if (emailMatch) {
    return emailMatch[1]
  }
  
  // Handle plain "email@domain.com" format
  return email
}

/**
 * Check if a user can send from a given email address
 * Returns true if:
 * 1. The email is agent@inbnd.dev (allowed for all users)
 * 2. The user owns the domain (checked separately in the API)
 */
export function canUserSendFromEmail(email: string): { isAgentEmail: boolean; domain: string } {
  const domain = extractDomain(email)
  const isAgent = isAgentEmail(email)
  
  return {
    isAgentEmail: isAgent,
    domain
  }
}

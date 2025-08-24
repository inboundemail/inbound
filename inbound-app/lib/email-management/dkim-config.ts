/**
 * DKIM Configuration for Server-Side Email Signing
 * 
 * This implements Resend-style DKIM signing where Inbound handles
 * DKIM signing server-side instead of requiring users to add DKIM records.
 */

// DKIM signing domain - this should be configured in AWS SES
export const INBOUND_DKIM_DOMAIN = process.env.INBOUND_DKIM_DOMAIN || 'mail.inbound.new'

// Fallback verified email address for SES (should be verified in AWS SES)
export const INBOUND_VERIFIED_EMAIL = process.env.INBOUND_VERIFIED_EMAIL || 'noreply@inbound.new'

// Whether to use server-side DKIM signing (like Resend)
export const USE_SERVER_SIDE_DKIM = process.env.USE_SERVER_SIDE_DKIM === 'true' || true

/**
 * Get the DKIM signing domain for emails
 * When using server-side DKIM, all emails are signed with Inbound's DKIM keys
 * regardless of the sender's domain.
 */
export function getDkimSigningDomain(): string {
  return INBOUND_DKIM_DOMAIN
}

/**
 * Check if server-side DKIM signing is enabled
 */
export function isServerSideDkimEnabled(): boolean {
  return USE_SERVER_SIDE_DKIM
}

/**
 * Get the appropriate Source email address for SES based on DKIM configuration
 * 
 * @param senderEmail - The original sender email
 * @param customMailFromDomain - Custom MAIL FROM domain if configured
 * @returns The email address to use as SES Source
 */
export function getSesSourceEmail(senderEmail: string, customMailFromDomain?: string): string {
  if (customMailFromDomain) {
    // Use custom MAIL FROM domain with noreply@ prefix
    return `noreply@${customMailFromDomain}`
  }
  
  if (isServerSideDkimEnabled()) {
    // Use verified Inbound email for server-side signing
    // This ensures we have a verified email address in SES
    return INBOUND_VERIFIED_EMAIL
  }
  
  // Fallback to sender email
  return senderEmail
}

/**
 * Setup instructions for configuring DKIM in AWS SES
 * This needs to be done once for the Inbound DKIM domain
 */
export const DKIM_SETUP_INSTRUCTIONS = `
To enable server-side DKIM signing:

1. In AWS SES Console, verify the domain: ${INBOUND_DKIM_DOMAIN}
2. Enable DKIM for ${INBOUND_DKIM_DOMAIN}
3. Add the 3 DKIM CNAME records to ${INBOUND_DKIM_DOMAIN}'s DNS
4. Configure SPF record for ${INBOUND_DKIM_DOMAIN}: v=spf1 include:amazonses.com ~all
5. Set up MAIL FROM domain if needed

Once configured, all user emails will be DKIM signed with ${INBOUND_DKIM_DOMAIN}'s keys.
`

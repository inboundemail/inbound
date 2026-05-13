/**
 * Webhook Verification Utilities
 * Generates and manages verification tokens for webhook endpoints to allow recipients to verify request legitimacy
 * 
 * Tokens are stored in the endpoint config so end users can access them via the API.
 */

import { createHmac, randomBytes } from 'crypto'

/**
 * Generate a new random verification token
 * This is a cryptographically secure random token that will be stored in the endpoint config
 * 
 * @returns A random verification token (32 bytes, hex encoded = 64 characters)
 */
export function generateNewWebhookVerificationToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Create an HMAC signature for a webhook payload.
 *
 * @param payload - The exact JSON payload string sent in the request body
 * @param secret - The webhook verification secret/token
 * @returns Signature header value in the form sha256=<hex digest>
 */
export function createWebhookSignature(payload: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

/**
 * Get or create a verification token for an endpoint
 * If the token doesn't exist in the config, generate a new one and return it
 * (Caller should save it back to the endpoint config)
 * 
 * @param config - The endpoint config object (will be mutated if token doesn't exist)
 * @returns The verification token from config, or a new one if it didn't exist
 */
export function getOrCreateVerificationToken(config: any): string {
  // Check if verification token already exists in config
  if (config.verificationToken && typeof config.verificationToken === 'string') {
    return config.verificationToken
  }
  
  // Generate new token
  const newToken = generateNewWebhookVerificationToken()
  config.verificationToken = newToken
  return newToken
}

/**
 * Verify a webhook verification token against the stored token
 * 
 * @param config - The endpoint config containing the verification token
 * @param token - The token from the webhook request header to verify
 * @returns True if the token matches the stored token
 */
export function verifyWebhookToken(config: any, token: string): boolean {
  if (!config.verificationToken || typeof config.verificationToken !== 'string') {
    return false // No token configured, cannot verifyg
  }
  
  return config.verificationToken === token
}

/**
 * Webhook Verification Utilities
 * Generates and manages verification tokens for webhook endpoints to allow recipients to verify request legitimacy
 * 
 * Tokens are stored in the endpoint config so end users can access them via the API.
 */

import { randomBytes } from 'crypto'
import { secretsEqual } from '@/lib/security/secret-compare'

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

  if (typeof token !== 'string' || token.length === 0) {
    return false
  }

  return secretsEqual(config.verificationToken, token)
}


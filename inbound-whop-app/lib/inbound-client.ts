import { InboundEmailClient } from '@inboundemail/sdk'

// Get API key from environment variables
// In production, use server-side env var. In development, allow client-side for testing
const getApiKey = () => {
  // Server-side environment variable (preferred)
  if (process.env.INBOUND_API_KEY) {
    return process.env.INBOUND_API_KEY
  }
  
  // Client-side environment variable (for development/testing only)
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_INBOUND_API_KEY) {
    return process.env.NEXT_PUBLIC_INBOUND_API_KEY
  }
  
  // Fallback to empty string (will cause initialization warning)
  return ''
}

// Initialize the Inbound Email client
export const inboundClient = new InboundEmailClient({
  apiKey: getApiKey(),
  baseUrl: process.env.INBOUND_BASE_URL || 'https://inbound.new/api/v2',
  defaultReplyFrom: process.env.INBOUND_DEFAULT_REPLY_FROM
})

// Validate configuration
const apiKey = getApiKey()
if (!apiKey) {
  console.warn('INBOUND_API_KEY environment variable is not set. Email functionality will not work.')
} else if (apiKey.startsWith('ib_')) {
  console.log('✅ Inbound Email client configured successfully')
} else {
  console.warn('⚠️ INBOUND_API_KEY may be invalid. Expected format: ib_...')
} 
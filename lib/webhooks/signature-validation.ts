import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Webhook signature validation utilities
 * Implements HMAC-SHA256 signature validation for webhook security
 */

export interface WebhookSignatureConfig {
  secret: string
  signatureHeader?: string
  signaturePrefix?: string
  timestampTolerance?: number // seconds
}

/**
 * Generate webhook signature
 */
export function generateWebhookSignature(
  payload: string | Buffer,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp || Math.floor(Date.now() / 1000)
  const signedPayload = `${ts}.${payload}`
  
  const hmac = createHmac('sha256', secret)
  hmac.update(signedPayload)
  const signature = hmac.digest('hex')
  
  return `t=${ts},v1=${signature}`
}

/**
 * Validate webhook signature
 */
export function validateWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  options?: {
    timestampTolerance?: number // seconds, default 300 (5 minutes)
  }
): { valid: boolean; error?: string } {
  try {
    const timestampTolerance = options?.timestampTolerance || 300
    
    // Parse the signature header
    const elements = signature.split(',')
    let timestamp: number | null = null
    let signatures: string[] = []
    
    for (const element of elements) {
      const [key, value] = element.split('=')
      if (key === 't') {
        timestamp = parseInt(value, 10)
      } else if (key === 'v1') {
        signatures.push(value)
      }
    }
    
    if (!timestamp) {
      return { valid: false, error: 'No timestamp found in signature' }
    }
    
    if (signatures.length === 0) {
      return { valid: false, error: 'No signature found' }
    }
    
    // Check timestamp tolerance
    const currentTime = Math.floor(Date.now() / 1000)
    if (currentTime - timestamp > timestampTolerance) {
      return { valid: false, error: 'Timestamp too old' }
    }
    
    if (timestamp > currentTime + 60) {
      return { valid: false, error: 'Timestamp too far in the future' }
    }
    
    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`
    const hmac = createHmac('sha256', secret)
    hmac.update(signedPayload)
    const expectedSignature = hmac.digest()
    
    // Check if any of the signatures match
    for (const sig of signatures) {
      const sigBuffer = Buffer.from(sig, 'hex')
      if (sigBuffer.length === expectedSignature.length && 
          timingSafeEqual(sigBuffer, expectedSignature)) {
        return { valid: true }
      }
    }
    
    return { valid: false, error: 'No matching signature found' }
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Invalid signature format' 
    }
  }
}

/**
 * Express/Next.js middleware for webhook signature validation
 */
export function createWebhookSignatureMiddleware(config: WebhookSignatureConfig) {
  return async (req: Request): Promise<Response | null> => {
    const signatureHeader = config.signatureHeader || 'x-webhook-signature'
    const signature = req.headers.get(signatureHeader)
    
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing webhook signature' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Get raw body
    const body = await req.text()
    
    const result = validateWebhookSignature(body, signature, config.secret, {
      timestampTolerance: config.timestampTolerance
    })
    
    if (!result.valid) {
      return new Response(
        JSON.stringify({ error: result.error || 'Invalid webhook signature' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Signature is valid, continue processing
    return null
  }
}

/**
 * Simplified signature validation for basic HMAC (without timestamp)
 */
export function validateSimpleWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
  try {
    const hmac = createHmac(algorithm, secret)
    hmac.update(payload)
    const expectedSignature = hmac.digest('hex')
    
    // Remove any prefix (e.g., "sha256=")
    const cleanSignature = signature.includes('=') 
      ? signature.split('=')[1] 
      : signature
    
    const sigBuffer = Buffer.from(cleanSignature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    
    return sigBuffer.length === expectedBuffer.length && 
           timingSafeEqual(sigBuffer, expectedBuffer)
  } catch {
    return false
  }
}
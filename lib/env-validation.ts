import { z } from 'zod'

/**
 * Environment variable validation schema
 * Ensures all required environment variables are present and valid
 */

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Authentication & URLs
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
  
  // Database
  DATABASE_URL: z.string().min(1),
  
  // AWS Configuration
  AWS_REGION: z.string().default('us-east-2'),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_ACCOUNT_ID: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  LAMBDA_FUNCTION_NAME: z.string().default('email-processor'),
  
  // OAuth Providers
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  
  // Resend
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  
  // Sentry
  SENTRY_AUTH_TOKEN: z.string().optional(),
  
  // Vercel (automatically set)
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  
  // Inbound API Key (for testing)
  INBOUND_API_KEY: z.string().optional(),
})

type EnvVars = z.infer<typeof envSchema>

/**
 * Validates and returns typed environment variables
 * Throws an error if required variables are missing or invalid
 */
export function validateEnv(): EnvVars {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors
        .filter(err => err.message === 'Required')
        .map(err => err.path.join('.'))
      
      const invalid = error.errors
        .filter(err => err.message !== 'Required')
        .map(err => `${err.path.join('.')}: ${err.message}`)
      
      console.error('❌ Environment validation failed:')
      if (missing.length > 0) {
        console.error('Missing required variables:', missing.join(', '))
      }
      if (invalid.length > 0) {
        console.error('Invalid variables:', invalid.join(', '))
      }
      
      throw new Error(`Environment validation failed. Check the logs above.`)
    }
    throw error
  }
}

/**
 * Get validated environment variables
 * Cached after first call for performance
 */
let cachedEnv: EnvVars | undefined

export function getEnv(): EnvVars {
  if (!cachedEnv) {
    cachedEnv = validateEnv()
  }
  return cachedEnv
}

/**
 * Type-safe environment variable access
 */
export const env = new Proxy({} as EnvVars, {
  get(target, prop: keyof EnvVars) {
    const envVars = getEnv()
    return envVars[prop]
  }
})
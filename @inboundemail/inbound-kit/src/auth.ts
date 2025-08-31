/**
 * Authentication handling for Inbound Kit
 * Loads API key from .env file or environment variables
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import chalk from 'chalk'

export interface AuthConfig {
  apiKey: string
  baseUrl?: string
}

/**
 * Load authentication configuration
 * Priority: CLI option > .env file > environment variable
 */
export function loadAuth(options: { apiKey?: string; baseUrl?: string } = {}): AuthConfig {
  // Try to load .env file if it exists
  const envPath = resolve(process.cwd(), '.env')
  if (existsSync(envPath)) {
    config({ path: envPath })
  }

  // Get API key from various sources
  const apiKey = options.apiKey || 
                 process.env.INBOUND_API_KEY || 
                 process.env.INBOUND_EMAIL_API_KEY

  if (!apiKey) {
    console.error(chalk.red('❌ Error: INBOUND_API_KEY not found'))
    console.error(chalk.yellow('💡 Please ensure you have one of the following:'))
    console.error(chalk.yellow('   • INBOUND_API_KEY in your .env file'))
    console.error(chalk.yellow('   • INBOUND_API_KEY environment variable'))
    console.error(chalk.yellow('   • --api-key CLI option'))
    console.error('')
    console.error(chalk.gray('Example .env file:'))
    console.error(chalk.gray('INBOUND_API_KEY=your-api-key-here'))
    process.exit(1)
  }

  // Validate API key format (basic check)
  if (!apiKey.match(/^[a-zA-Z0-9_-]{20,}$/)) {
    console.error(chalk.red('❌ Error: Invalid API key format'))
    console.error(chalk.yellow('💡 API key should be at least 20 characters and contain only letters, numbers, underscores, and hyphens'))
    process.exit(1)
  }

  const baseUrl = options.baseUrl || 
                  process.env.INBOUND_BASE_URL || 
                  'https://inbound.new/api/v2'

  return {
    apiKey,
    baseUrl
  }
}

/**
 * Validate that we can authenticate with the API
 */
export async function validateAuth(auth: AuthConfig): Promise<boolean> {
  try {
    const { Inbound } = await import('@inboundemail/sdk')
    const client = new Inbound(auth.apiKey, auth.baseUrl)
    
    // Try to list domains as a simple auth check
    const result = await client.domains.list({ limit: 1 })
    
    if (result.error) {
      console.error(chalk.red('❌ Authentication failed:'), result.error)
      return false
    }
    
    return true
  } catch (error) {
    console.error(chalk.red('❌ Failed to validate authentication:'), error instanceof Error ? error.message : 'Unknown error')
    return false
  }
}

/**
 * Create authenticated Inbound SDK client
 */
export async function createClient(auth: AuthConfig) {
  const { Inbound } = await import('@inboundemail/sdk')
  return new Inbound(auth.apiKey, auth.baseUrl)
}

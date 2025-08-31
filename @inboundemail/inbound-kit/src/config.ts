/**
 * Configuration file loading and parsing
 * Supports inbound.config.ts, inbound.config.js, and inbound.config.json
 */

import { existsSync, readFileSync } from 'fs'
import { resolve, extname } from 'path'
import { pathToFileURL } from 'url'
import chalk from 'chalk'
import type { InboundConfig, ConfigLoadResult, EndpointConfig, EndpointShorthand } from './types.js'

const CONFIG_FILES = [
  'inbound.config.ts',
  'inbound.config.js', 
  'inbound.config.mjs',
  'inbound.config.json'
]

/**
 * Find the configuration file in the current directory
 */
function findConfigFile(configPath?: string): string | null {
  if (configPath) {
    const fullPath = resolve(process.cwd(), configPath)
    if (existsSync(fullPath)) {
      return fullPath
    }
    console.error(chalk.red(`❌ Config file not found: ${configPath}`))
    return null
  }

  // Look for default config files
  for (const file of CONFIG_FILES) {
    const fullPath = resolve(process.cwd(), file)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }

  return null
}

/**
 * Load and parse configuration file
 */
export async function loadConfig(configPath?: string): Promise<ConfigLoadResult> {
  const foundPath = findConfigFile(configPath)
  
  if (!foundPath) {
    console.error(chalk.red('❌ No configuration file found'))
    console.error(chalk.yellow('💡 Please create one of the following files:'))
    CONFIG_FILES.forEach(file => {
      console.error(chalk.yellow(`   • ${file}`))
    })
    console.error('')
    console.error(chalk.gray('Example inbound.config.ts:'))
    console.error(chalk.gray(`export default {
  emailAddresses: {
    "hello@example.com": "https://example.com/webhook",
    "support@example.com": ["admin@company.com", "dev@company.com"]
  }
}`))
    process.exit(1)
  }

  const ext = extname(foundPath)
  let config: InboundConfig
  let format: 'typescript' | 'javascript' | 'json'

  try {
    if (ext === '.json') {
      // Load JSON config
      const content = readFileSync(foundPath, 'utf-8')
      config = JSON.parse(content)
      format = 'json'
    } else {
      // Load TypeScript/JavaScript config
      const fileUrl = pathToFileURL(foundPath).href
      const module = await import(fileUrl)
      config = module.default || module
      format = ext === '.ts' ? 'typescript' : 'javascript'
    }

    // Validate and normalize config
    config = await validateAndNormalizeConfig(config)

    return {
      config,
      configPath: foundPath,
      format
    }
  } catch (error) {
    console.error(chalk.red(`❌ Failed to load config file: ${foundPath}`))
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
    process.exit(1)
  }
}

/**
 * Validate and normalize configuration
 */
async function validateAndNormalizeConfig(config: any): Promise<InboundConfig> {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be an object')
  }

  if (!config.emailAddresses || typeof config.emailAddresses !== 'object') {
    throw new Error('Configuration must include emailAddresses object')
  }

  // Validate email addresses
  for (const [email, endpoint] of Object.entries(config.emailAddresses)) {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid email address: ${email}`)
    }
    
    if (!endpoint) {
      throw new Error(`Email address ${email} must have an endpoint configuration`)
    }
  }

  // Validate domains if present
  if (config.domains) {
    if (typeof config.domains !== 'object') {
      throw new Error('domains must be an object')
    }
    
    for (const [domain, domainConfig] of Object.entries(config.domains)) {
      if (!isValidDomain(domain)) {
        throw new Error(`Invalid domain: ${domain}`)
      }
    }
  }

  // Validate endpoints if present
  if (config.endpoints) {
    if (typeof config.endpoints !== 'object') {
      throw new Error('endpoints must be an object')
    }
    
    for (const [name, endpointConfig] of Object.entries(config.endpoints)) {
      validateEndpointConfig(name, endpointConfig as EndpointConfig)
    }
  }

  return config as InboundConfig
}

/**
 * Validate email address format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return domainRegex.test(domain)
}

/**
 * Validate endpoint configuration
 */
function validateEndpointConfig(name: string, config: EndpointConfig): void {
  if (!config.type) {
    throw new Error(`Endpoint ${name} must have a type`)
  }

  switch (config.type) {
    case 'webhook':
      if (!config.url || !isValidUrl(config.url)) {
        throw new Error(`Webhook endpoint ${name} must have a valid URL`)
      }
      break
    
    case 'slack':
      if (!config.webhookUrl || !isValidUrl(config.webhookUrl)) {
        throw new Error(`Slack endpoint ${name} must have a valid webhook URL`)
      }
      break
    
    case 'discord':
      if (!config.webhookUrl || !isValidUrl(config.webhookUrl)) {
        throw new Error(`Discord endpoint ${name} must have a valid webhook URL`)
      }
      break
    
    case 'email':
      if (!config.email || !isValidEmail(config.email)) {
        throw new Error(`Email endpoint ${name} must have a valid email address`)
      }
      break
    
    case 'email_group':
      if (!config.emails || !Array.isArray(config.emails) || config.emails.length === 0) {
        throw new Error(`Email group endpoint ${name} must have an array of email addresses`)
      }
      for (const email of config.emails) {
        if (!isValidEmail(email)) {
          throw new Error(`Email group endpoint ${name} contains invalid email: ${email}`)
        }
      }
      break
    
    default:
      throw new Error(`Endpoint ${name} has unsupported type: ${(config as any).type}`)
  }
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Normalize endpoint shorthand to full configuration
 */
export function normalizeEndpoint(shorthand: EndpointShorthand, name: string): EndpointConfig {
  if (typeof shorthand === 'string') {
    // Simple URL webhook
    if (isValidUrl(shorthand)) {
      return {
        type: 'webhook',
        url: shorthand
      }
    }
    throw new Error(`Invalid endpoint configuration for ${name}: ${shorthand}`)
  }
  
  if (Array.isArray(shorthand)) {
    // Email group
    return {
      type: 'email_group',
      emails: shorthand
    }
  }
  
  if (typeof shorthand === 'object' && shorthand !== null) {
    if ('forward' in shorthand) {
      // Email forwarding
      return {
        type: 'email',
        email: shorthand.forward
      }
    }
    
    if ('slack' in shorthand) {
      // Slack webhook
      if (typeof shorthand.slack === 'string') {
        return {
          type: 'slack',
          webhookUrl: shorthand.slack
        }
      } else {
        return {
          type: 'slack',
          webhookUrl: shorthand.slack.url,
          channel: shorthand.slack.channel,
          username: shorthand.slack.username
        }
      }
    }
    
    if ('discord' in shorthand) {
      // Discord webhook
      if (typeof shorthand.discord === 'string') {
        return {
          type: 'discord',
          webhookUrl: shorthand.discord
        }
      } else {
        return {
          type: 'discord',
          webhookUrl: shorthand.discord.url,
          username: shorthand.discord.username,
          avatarUrl: shorthand.discord.avatarUrl
        }
      }
    }
  }
  
  throw new Error(`Invalid endpoint configuration for ${name}: ${JSON.stringify(shorthand)}`)
}

/**
 * Generate example configuration file content
 */
export function generateExampleConfig(format: 'typescript' | 'javascript' | 'json'): string {
  const config = {
    emailAddresses: {
      "hello@example.com": "https://example.com/api/webhook",
      "support@example.com": ["admin@company.com", "dev@company.com"],
      "sales@example.com": { forward: "crm@company.com" },
      "alerts@example.com": { 
        slack: {
          url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
          channel: "#alerts",
          username: "Inbound Bot"
        }
      }
    },
    domains: {
      "example.com": {
        catchAll: false
      }
    },
    endpoints: {
      "primary-webhook": {
        type: "webhook",
        url: "https://api.example.com/inbound",
        timeout: 30,
        retryAttempts: 3,
        headers: {
          "X-API-Key": "your-api-key"
        }
      }
    }
  }

  switch (format) {
    case 'typescript':
      return `import type { InboundConfig } from '@inboundemail/inbound-kit'

const config: InboundConfig = ${JSON.stringify(config, null, 2)}

export default config`
    
    case 'javascript':
      return `/** @type {import('@inboundemail/inbound-kit').InboundConfig} */
const config = ${JSON.stringify(config, null, 2)}

module.exports = config`
    
    case 'json':
      return JSON.stringify(config, null, 2)
  }
}

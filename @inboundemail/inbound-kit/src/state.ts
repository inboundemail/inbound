/**
 * State management - synchronization between config and Inbound API
 */

import type { Inbound } from '@inboundemail/sdk'
import chalk from 'chalk'
import type { 
  InboundConfig, 
  InboundState, 
  EmailAddressState, 
  EndpointState, 
  DomainState,
  Change,
  DiffResult,
  EndpointConfig
} from './types.js'
import { normalizeEndpoint } from './config.js'

/**
 * Fetch current state from Inbound API
 */
export async function fetchCurrentState(client: Inbound): Promise<InboundState> {
  console.log(chalk.blue('📡 Fetching current state from Inbound API...'))

  try {
    // Fetch all resources in parallel
    const [domainsResult, emailAddressesResult, endpointsResult] = await Promise.all([
      client.domain.list({ limit: 100 }),
      client.email.address.list({ limit: 100 }),
      client.endpoint.list({ limit: 100 })
    ])

    // Handle API errors
    if (domainsResult.error) {
      throw new Error(`Failed to fetch domains: ${domainsResult.error}`)
    }
    if (emailAddressesResult.error) {
      throw new Error(`Failed to fetch email addresses: ${emailAddressesResult.error}`)
    }
    if (endpointsResult.error) {
      throw new Error(`Failed to fetch endpoints: ${endpointsResult.error}`)
    }

    // Transform API responses to state format
    const domains: Record<string, DomainState> = {}
    if (domainsResult.data?.data) {
      for (const domain of domainsResult.data.data) {
        domains[domain.domain] = {
          id: domain.id,
          domain: domain.domain,
          status: domain.status,
          canReceiveEmails: domain.canReceiveEmails,
          isCatchAllEnabled: domain.isCatchAllEnabled,
          catchAllEndpointId: domain.catchAllEndpointId
        }
      }
    }

    const emailAddresses: Record<string, EmailAddressState> = {}
    if (emailAddressesResult.data?.data) {
      for (const emailAddr of emailAddressesResult.data.data) {
        emailAddresses[emailAddr.address] = {
          id: emailAddr.id,
          address: emailAddr.address,
          domainId: emailAddr.domainId,
          endpointId: emailAddr.endpointId,
          isActive: emailAddr.isActive,
          routing: emailAddr.routing
        }
      }
    }

    const endpoints: Record<string, EndpointState> = {}
    if (endpointsResult.data?.data) {
      for (const endpoint of endpointsResult.data.data) {
        endpoints[endpoint.id] = {
          id: endpoint.id,
          name: endpoint.name,
          type: endpoint.type as any,
          config: endpoint.config,
          isActive: endpoint.isActive
        }
      }
    }

    console.log(chalk.green(`✅ Fetched state: ${Object.keys(domains).length} domains, ${Object.keys(emailAddresses).length} email addresses, ${Object.keys(endpoints).length} endpoints`))

    return {
      domains,
      emailAddresses,
      endpoints
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to fetch current state:'), error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

/**
 * Calculate differences between desired config and current state
 */
export function calculateDiff(config: InboundConfig, currentState: InboundState): DiffResult {
  const changes: Change[] = []

  // Check email addresses
  for (const [emailAddress, endpointConfig] of Object.entries(config.emailAddresses)) {
    const currentEmailAddr = currentState.emailAddresses[emailAddress]
    const normalizedEndpoint = normalizeEndpoint(endpointConfig, emailAddress)
    
    if (!currentEmailAddr) {
      // Email address needs to be created
      changes.push({
        type: 'create',
        resource: 'emailAddress',
        key: emailAddress,
        desired: {
          address: emailAddress,
          endpoint: normalizedEndpoint
        },
        reason: 'Email address does not exist'
      })
    } else {
      // Check if endpoint configuration has changed
      const currentEndpoint = findEndpointForEmailAddress(currentEmailAddr, currentState.endpoints)
      const endpointChanged = !isEndpointConfigEqual(normalizedEndpoint, currentEndpoint)
      
      if (endpointChanged || !currentEmailAddr.isActive) {
        changes.push({
          type: 'update',
          resource: 'emailAddress',
          key: emailAddress,
          current: {
            ...currentEmailAddr,
            endpoint: currentEndpoint
          },
          desired: {
            address: emailAddress,
            endpoint: normalizedEndpoint,
            isActive: true
          },
          reason: endpointChanged ? 'Endpoint configuration changed' : 'Email address is inactive'
        })
      }
    }
  }

  // Check for email addresses that should be deleted (exist in state but not in config)
  for (const [emailAddress, currentEmailAddr] of Object.entries(currentState.emailAddresses)) {
    if (!config.emailAddresses[emailAddress]) {
      changes.push({
        type: 'delete',
        resource: 'emailAddress',
        key: emailAddress,
        current: currentEmailAddr,
        reason: 'Email address no longer in configuration'
      })
    }
  }

  // Check domains (catch-all configuration)
  if (config.domains) {
    for (const [domainName, domainConfig] of Object.entries(config.domains)) {
      const currentDomain = currentState.domains[domainName]
      
      if (!currentDomain) {
        changes.push({
          type: 'create',
          resource: 'domain',
          key: domainName,
          desired: domainConfig,
          reason: 'Domain configuration specified but domain does not exist'
        })
      } else {
        // Check catch-all configuration
        const catchAllChanged = domainConfig.catchAll !== undefined && 
          ((domainConfig.catchAll === false && currentDomain.isCatchAllEnabled) ||
           (domainConfig.catchAll !== false && !currentDomain.isCatchAllEnabled))
        
        if (catchAllChanged) {
          changes.push({
            type: 'update',
            resource: 'domain',
            key: domainName,
            current: currentDomain,
            desired: domainConfig,
            reason: 'Catch-all configuration changed'
          })
        }
      }
    }
  }

  return {
    changes,
    hasChanges: changes.length > 0
  }
}

/**
 * Apply changes to bring current state in sync with desired config
 */
export async function applyChanges(client: Inbound, changes: Change[], currentState: InboundState): Promise<void> {
  console.log(chalk.blue(`🔄 Applying ${changes.length} changes...`))

  for (const change of changes) {
    try {
      await applyChange(client, change, currentState)
    } catch (error) {
      console.error(chalk.red(`❌ Failed to apply change for ${change.key}:`), error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  console.log(chalk.green('✅ All changes applied successfully'))
}

/**
 * Apply a single change
 */
async function applyChange(client: Inbound, change: Change, currentState: InboundState): Promise<void> {
  switch (change.resource) {
    case 'emailAddress':
      await applyEmailAddressChange(client, change, currentState)
      break
    case 'endpoint':
      await applyEndpointChange(client, change, currentState)
      break
    case 'domain':
      await applyDomainChange(client, change, currentState)
      break
  }
}

/**
 * Extract domain from email address
 */
function extractDomainFromEmail(email: string): string {
  return email.split('@')[1]
}

/**
 * Apply email address change
 */
async function applyEmailAddressChange(client: Inbound, change: Change, currentState: InboundState): Promise<void> {
  const emailAddress = change.key

  if (change.type === 'create') {
    console.log(chalk.yellow(`📧 Creating email address: ${emailAddress}`))
    
    // First, find or create the endpoint
    const endpointId = await findOrCreateEndpoint(client, change.desired.endpoint, currentState)
    
    // Find domain ID
    const domain = extractDomainFromEmail(emailAddress)
    const domainState = currentState.domains[domain]
    
    if (!domainState) {
      throw new Error(`Domain ${domain} not found. Please add the domain to your Inbound account first.`)
    }

    // Create email address
    const result = await client.email.address.create({
      address: emailAddress,
      domainId: domainState.id,
      endpointId: endpointId,
      isActive: true
    })

    if (result.error) {
      throw new Error(`Failed to create email address: ${result.error}`)
    }

    console.log(chalk.green(`✅ Created email address: ${emailAddress}`))
  } else if (change.type === 'update') {
    console.log(chalk.yellow(`📧 Updating email address: ${emailAddress}`))
    
    const endpointId = await findOrCreateEndpoint(client, change.desired.endpoint, currentState)
    
    const result = await client.email.address.update(change.current.id, {
      endpointId: endpointId,
      isActive: true
    })

    if (result.error) {
      throw new Error(`Failed to update email address: ${result.error}`)
    }

    console.log(chalk.green(`✅ Updated email address: ${emailAddress}`))
  } else if (change.type === 'delete') {
    console.log(chalk.yellow(`📧 Deleting email address: ${emailAddress}`))
    
    const result = await client.email.address.delete(change.current.id)

    if (result.error) {
      throw new Error(`Failed to delete email address: ${result.error}`)
    }

    console.log(chalk.green(`✅ Deleted email address: ${emailAddress}`))
  }
}

/**
 * Apply endpoint change
 */
async function applyEndpointChange(client: Inbound, change: Change, currentState: InboundState): Promise<void> {
  // Endpoint changes are handled implicitly through email address changes
  // This function is a placeholder for future endpoint-specific operations
}

/**
 * Apply domain change
 */
async function applyDomainChange(client: Inbound, change: Change, currentState: InboundState): Promise<void> {
  const domainName = change.key

  if (change.type === 'update') {
    console.log(chalk.yellow(`🌐 Updating domain: ${domainName}`))
    
    const domainState = currentState.domains[domainName]
    const catchAllEnabled = change.desired.catchAll !== false
    let catchAllEndpointId: string | null = null

    if (catchAllEnabled && change.desired.catchAll) {
      catchAllEndpointId = await findOrCreateEndpoint(client, change.desired.catchAll, currentState)
    }

    const result = await client.domain.update(domainState.id, {
      isCatchAllEnabled: catchAllEnabled,
      catchAllEndpointId: catchAllEndpointId
    })

    if (result.error) {
      throw new Error(`Failed to update domain: ${result.error}`)
    }

    console.log(chalk.green(`✅ Updated domain: ${domainName}`))
  }
}

/**
 * Find or create an endpoint based on configuration
 */
async function findOrCreateEndpoint(client: Inbound, endpointConfig: EndpointConfig, currentState: InboundState): Promise<string> {
  // First, try to find an existing endpoint with matching configuration
  for (const [endpointId, existingEndpoint] of Object.entries(currentState.endpoints)) {
    if (isEndpointConfigEqual(endpointConfig, existingEndpoint)) {
      return endpointId
    }
  }

  // Create new endpoint
  console.log(chalk.blue(`🔗 Creating new endpoint: ${endpointConfig.type}`))
  
  const endpointName = generateEndpointName(endpointConfig)
  const apiConfig = convertToApiEndpointConfig(endpointConfig)

  const result = await client.endpoint.create({
    name: endpointName,
    type: apiConfig.type as any,
    config: apiConfig.config
  })

  if (result.error) {
    throw new Error(`Failed to create endpoint: ${result.error}`)
  }

  console.log(chalk.green(`✅ Created endpoint: ${endpointName}`))
  
  // Add to current state to avoid recreating
  currentState.endpoints[result.data!.id] = {
    id: result.data!.id,
    name: endpointName,
    type: endpointConfig.type as any,
    config: apiConfig.config,
    isActive: true
  }

  return result.data!.id
}

/**
 * Helper functions
 */

function findEndpointForEmailAddress(emailAddr: EmailAddressState, endpoints: Record<string, EndpointState>): EndpointState | null {
  if (!emailAddr.endpointId) return null
  return endpoints[emailAddr.endpointId] || null
}

function isEndpointConfigEqual(config1: EndpointConfig, endpoint: EndpointState | null): boolean {
  if (!endpoint) return false
  
  if (config1.type !== endpoint.type) return false

  switch (config1.type) {
    case 'webhook':
      return config1.url === endpoint.config.url
    case 'slack':
      return config1.webhookUrl === endpoint.config.webhookUrl
    case 'discord':
      return config1.webhookUrl === endpoint.config.webhookUrl
    case 'email':
      return config1.email === endpoint.config.email
    case 'email_group':
      return JSON.stringify(config1.emails.sort()) === JSON.stringify(endpoint.config.emails?.sort() || [])
    default:
      return false
  }
}

function generateEndpointName(config: EndpointConfig): string {
  switch (config.type) {
    case 'webhook':
      return `Webhook: ${new URL(config.url).hostname}`
    case 'slack':
      return `Slack: ${config.channel || 'webhook'}`
    case 'discord':
      return `Discord: ${config.username || 'webhook'}`
    case 'email':
      return `Forward: ${config.email}`
    case 'email_group':
      return `Group: ${config.emails.length} addresses`
    default:
      return 'Unknown Endpoint'
  }
}

function convertToApiEndpointConfig(config: EndpointConfig): { type: string; config: any } {
  switch (config.type) {
    case 'webhook':
      return {
        type: 'webhook',
        config: {
          url: config.url,
          timeout: config.timeout || 30,
          retryAttempts: config.retryAttempts || 3,
          headers: config.headers || {}
        }
      }
    case 'slack':
      return {
        type: 'webhook', // Slack webhooks are handled as regular webhooks
        config: {
          url: config.webhookUrl,
          timeout: 30,
          retryAttempts: 3
        }
      }
    case 'discord':
      return {
        type: 'webhook', // Discord webhooks are handled as regular webhooks
        config: {
          url: config.webhookUrl,
          timeout: 30,
          retryAttempts: 3
        }
      }
    case 'email':
      return {
        type: 'email',
        config: {
          email: config.email
        }
      }
    case 'email_group':
      return {
        type: 'email_group',
        config: {
          emails: config.emails
        }
      }
    default:
      throw new Error(`Unsupported endpoint type: ${(config as any).type}`)
  }
}

/**
 * Type definitions for Inbound Kit configuration
 */

// Endpoint configuration types
export interface WebhookEndpointConfig {
  type: 'webhook'
  url: string
  timeout?: number
  retryAttempts?: number
  headers?: Record<string, string>
}

export interface SlackEndpointConfig {
  type: 'slack'
  webhookUrl: string
  channel?: string
  username?: string
}

export interface DiscordEndpointConfig {
  type: 'discord'
  webhookUrl: string
  username?: string
  avatarUrl?: string
}

export interface EmailEndpointConfig {
  type: 'email'
  email: string
}

export interface EmailGroupEndpointConfig {
  type: 'email_group'
  emails: string[]
}

export type EndpointConfig = 
  | WebhookEndpointConfig
  | SlackEndpointConfig
  | DiscordEndpointConfig
  | EmailEndpointConfig
  | EmailGroupEndpointConfig

// Shorthand endpoint definitions
export type EndpointShorthand = 
  | string  // URL for webhook
  | string[] // Array of emails for email group
  | { forward: string } // Email forwarding
  | { slack: string | { url: string; channel?: string; username?: string } } // Slack webhook
  | { discord: string | { url: string; username?: string; avatarUrl?: string } } // Discord webhook

// Domain configuration
export interface DomainConfig {
  catchAll?: EndpointShorthand | false
}

// Main configuration interface
export interface InboundConfig {
  domains?: Record<string, DomainConfig>
  emailAddresses: Record<string, EndpointShorthand>
  endpoints?: Record<string, EndpointConfig>
}

// Runtime state types
export interface EmailAddressState {
  id: string
  address: string
  domainId: string
  endpointId: string | null
  isActive: boolean
  routing: {
    type: 'webhook' | 'endpoint' | 'none'
    id: string | null
    name: string | null
  }
}

export interface EndpointState {
  id: string
  name: string
  type: 'webhook' | 'email' | 'email_group' | 'slack' | 'discord'
  config: any
  isActive: boolean
}

export interface DomainState {
  id: string
  domain: string
  status: string
  canReceiveEmails: boolean
  isCatchAllEnabled: boolean
  catchAllEndpointId: string | null
}

export interface InboundState {
  domains: Record<string, DomainState>
  emailAddresses: Record<string, EmailAddressState>
  endpoints: Record<string, EndpointState>
}

// Diff types
export type ChangeType = 'create' | 'update' | 'delete' | 'none'

export interface Change {
  type: ChangeType
  resource: 'emailAddress' | 'endpoint' | 'domain'
  key: string
  current?: any
  desired?: any
  reason?: string
}

export interface DiffResult {
  changes: Change[]
  hasChanges: boolean
}

// CLI options
export interface CLIOptions {
  config?: string
  apiKey?: string
  baseUrl?: string
  verbose?: boolean
  dryRun?: boolean
  force?: boolean
}

// Config loading result
export interface ConfigLoadResult {
  config: InboundConfig
  configPath: string
  format: 'typescript' | 'javascript' | 'json'
}

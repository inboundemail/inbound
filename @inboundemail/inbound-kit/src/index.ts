/**
 * @inboundemail/inbound-kit
 * Infrastructure as Code CLI for Inbound Email
 */

// Export types for TypeScript users
export type {
  InboundConfig,
  DomainConfig,
  EndpointConfig,
  EndpointShorthand,
  WebhookEndpointConfig,
  SlackEndpointConfig,
  DiscordEndpointConfig,
  EmailEndpointConfig,
  EmailGroupEndpointConfig,
  CLIOptions,
  ConfigLoadResult
} from './types.js'

// Export utilities for programmatic usage
export { loadConfig, normalizeEndpoint, generateExampleConfig } from './config.js'
export { loadAuth, validateAuth, createClient } from './auth.js'
export { fetchCurrentState, calculateDiff, applyChanges } from './state.js'

// CLI commands (for programmatic usage)
export { pushCommand } from './commands/push.js'
export { pullCommand } from './commands/pull.js'
export { diffCommand } from './commands/diff.js'
export { statusCommand } from './commands/status.js'
export { initCommand } from './commands/init.js'

// Version
export const VERSION = '1.0.0'

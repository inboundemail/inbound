import { InboundClient } from './client'
import { InboundConfig } from './types'

/**
 * Create a new Inbound API client
 */
export function createInboundClient(config: InboundConfig): InboundClient {
  return new InboundClient(config)
}

// Export the client class and types
export { InboundClient } from './client'
export * from './types'

// Default export for convenience
export default createInboundClient 
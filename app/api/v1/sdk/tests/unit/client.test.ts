import { InboundClient } from '../../src/client'
import { InboundError } from '../../src/types'

// Simple test runner for SDK
export async function runSDKTests() {
  console.log('🧪 Running SDK Tests...')
  
  const mockApiKey = 'test-api-key'
  const mockBaseUrl = 'https://api.test.com/api/v1'
  
  // Test 1: Client creation
  try {
    const client = new InboundClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl
    })
    console.log('✅ Client creation test passed')
  } catch (error) {
    console.error('❌ Client creation test failed:', error)
  }
  
  // Test 2: Default baseUrl
  try {
    const defaultClient = new InboundClient({ apiKey: mockApiKey })
    console.log('✅ Default baseUrl test passed')
  } catch (error) {
    console.error('❌ Default baseUrl test failed:', error)
  }
  
  console.log('🧪 SDK Tests completed')
}

// Export for use in integration tests
export { InboundClient, InboundError } 
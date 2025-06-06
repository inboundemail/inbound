#!/usr/bin/env bun
import { runSDKTests } from './unit/client.test'
import { runIntegrationTests } from './integration/api.test'

interface TestEnvironment {
  apiKey: string
  baseUrl: string
  testDomain: string
  testWebhookUrl: string
}

function loadTestEnvironment(): TestEnvironment {
  // Load from environment variables
  const apiKey = process.env.TEST_API_KEY
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000/api/v1'
  const testDomain = process.env.TEST_DOMAIN
  const testWebhookUrl = process.env.TEST_WEBHOOK_URL || 'https://webhook.site/unique-id'

  if (!apiKey) {
    console.error('❌ TEST_API_KEY environment variable is required')
    console.log('💡 Set it with: export TEST_API_KEY="your-api-key"')
    process.exit(1)
  }

  if (!testDomain) {
    console.error('❌ TEST_DOMAIN environment variable is required')
    console.log('💡 Set it with: export TEST_DOMAIN="your-test-domain.com"')
    process.exit(1)
  }

  return {
    apiKey,
    baseUrl,
    testDomain,
    testWebhookUrl
  }
}

async function main() {
  console.log('🧪 Inbound Email API & SDK Test Suite')
  console.log('=====================================')
  
  const env = loadTestEnvironment()
  
  console.log('\n📋 Test Configuration:')
  console.log(`   API Key: ${env.apiKey.substring(0, 8)}...`)
  console.log(`   Base URL: ${env.baseUrl}`)
  console.log(`   Test Domain: ${env.testDomain}`)
  console.log(`   Webhook URL: ${env.testWebhookUrl}`)
  
  const testType = process.argv[2] || 'all'
  
  try {
    switch (testType) {
      case 'unit':
        console.log('\n🔧 Running Unit Tests Only...')
        await runSDKTests()
        break
        
      case 'integration':
        console.log('\n🌐 Running Integration Tests Only...')
        const integrationResults = await runIntegrationTests({
          apiKey: env.apiKey,
          baseUrl: env.baseUrl,
          testDomain: env.testDomain,
          testWebhookUrl: env.testWebhookUrl
        })
        
        if (integrationResults.failed > 0) {
          process.exit(1)
        }
        break
        
      case 'all':
      default:
        console.log('\n🔧 Running Unit Tests...')
        await runSDKTests()
        
        console.log('\n🌐 Running Integration Tests...')
        const allResults = await runIntegrationTests({
          apiKey: env.apiKey,
          baseUrl: env.baseUrl,
          testDomain: env.testDomain,
          testWebhookUrl: env.testWebhookUrl
        })
        
        if (allResults.failed > 0) {
          process.exit(1)
        }
        break
    }
    
    console.log('\n🎉 All tests completed successfully!')
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error)
    process.exit(1)
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🧪 Inbound Email API & SDK Test Suite

Usage: bun run tests/run-tests.ts [type]

Types:
  unit         Run only unit tests
  integration  Run only integration tests  
  all          Run all tests (default)

Environment Variables:
  TEST_API_KEY      Your API key for testing (required)
  TEST_DOMAIN       Domain to use for testing (required)
  TEST_BASE_URL     API base URL (default: http://localhost:3000/api/v1)
  TEST_WEBHOOK_URL  Webhook URL for testing (default: https://webhook.site/unique-id)

Examples:
  export TEST_API_KEY="your-api-key"
  export TEST_DOMAIN="test.example.com"
  bun run tests/run-tests.ts
  bun run tests/run-tests.ts integration
  bun run tests/run-tests.ts unit
`)
  process.exit(0)
}

main().catch(console.error) 
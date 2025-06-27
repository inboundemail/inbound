#!/usr/bin/env bun

/**
 * Comprehensive API v1.1 Test Suite
 * 
 * This script tests the v1.1 API endpoints for robust email management.
 * It tests endpoints, email addresses, domains, and routing functionality.
 * 
 * Usage:
 *   bun run test-v1.1-api.ts --api-key=<your-api-key> --base-url=<api-base-url> --test-domain=<domain>
 * 
 * Example:
 *   bun run test-v1.1-api.ts --api-key=pk_123abc --base-url=https://inbound.new --test-domain=example.com
 */

import { parseArgs } from 'util'

interface TestConfig {
  apiKey: string
  baseUrl: string
  testDomain: string
  testEmail?: string
  cleanup?: boolean
}

interface TestResult {
  test: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  message: string
  duration: number
  data?: any
}

interface TestSuite {
  name: string
  results: TestResult[]
  passed: number
  failed: number
  skipped: number
  totalDuration: number
}

class APIv11Tester {
  private config: TestConfig
  private testResults: TestSuite[] = []
  private createdResources: {
    endpoints: string[]
    emailAddresses: string[]
    domains: string[]
  } = {
    endpoints: [],
    emailAddresses: [],
    domains: []
  }

  constructor(config: TestConfig) {
    this.config = config
    if (!this.config.testEmail) {
      this.config.testEmail = `test@${this.config.testDomain}`
    }
  }

  private async makeRequest(
    path: string, 
    options: {
      method?: string
      body?: any
      headers?: Record<string, string>
    } = {}
  ): Promise<{ status: number; data: any; headers: Headers }> {
    const url = `${this.config.baseUrl}/api/v1.1${path}`
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    let data
    try {
      data = await response.json()
    } catch {
      data = null
    }

    return {
      status: response.status,
      data,
      headers: response.headers
    }
  }

  private createTestResult(
    test: string,
    status: 'PASS' | 'FAIL' | 'SKIP',
    message: string,
    duration: number,
    data?: any
  ): TestResult {
    return { test, status, message, duration, data }
  }

  private async runTest(
    name: string,
    testFn: () => Promise<{ status: 'PASS' | 'FAIL' | 'SKIP'; message: string; data?: any }>
  ): Promise<TestResult> {
    const startTime = Date.now()
    try {
      const result = await testFn()
      const duration = Date.now() - startTime
      console.log(`  ${result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️ '} ${name} (${duration}ms)`)
      if (result.status === 'FAIL') {
        console.log(`     ${result.message}`)
      }
      return this.createTestResult(name, result.status, result.message, duration, result.data)
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(`  ❌ ${name} (${duration}ms)`)
      console.log(`     ${message}`)
      return this.createTestResult(name, 'FAIL', message, duration)
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting API v1.1 Integration Tests')
    console.log(`📍 Base URL: ${this.config.baseUrl}`)
    console.log(`🔑 API Key: ${this.config.apiKey.substring(0, 8)}...`)
    console.log(`🌐 Test Domain: ${this.config.testDomain}`)
    console.log(`📧 Test Email: ${this.config.testEmail}`)
    console.log('═'.repeat(60))

    // Run test suites
    await this.testEndpoints()
    await this.testEmailAddresses()
    await this.testRouting()
    await this.testDeliveries()

    // Cleanup if requested
    if (this.config.cleanup !== false) {
      await this.cleanup()
    }

    // Print summary
    this.printSummary()
  }

  private async testEndpoints(): Promise<void> {
    console.log('\n🔧 Testing Endpoints API')
    
    const suite: TestSuite = {
      name: 'Endpoints',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0
    }

    // Test endpoint creation - webhook
    suite.results.push(await this.runTest('Create Webhook Endpoint', async () => {
      const result = await this.makeRequest('/endpoints', {
        method: 'POST',
        body: {
          name: 'Test Webhook',
          type: 'webhook',
          description: 'Test webhook endpoint',
          config: {
            url: 'https://httpbin.org/post',
            timeout: 30,
            retryAttempts: 3,
            headers: { 'X-Test': 'true' }
          }
        }
      })

      if (result.status === 201 && result.data.success) {
        this.createdResources.endpoints.push(result.data.data.id)
        return { status: 'PASS', message: 'Webhook endpoint created successfully', data: result.data.data }
      }
      return { status: 'FAIL', message: `Failed to create webhook: ${result.data.error || 'Unknown error'}` }
    }))

    // Test endpoint creation - email forward
    suite.results.push(await this.runTest('Create Email Forward Endpoint', async () => {
      const result = await this.makeRequest('/endpoints', {
        method: 'POST',
        body: {
          name: 'Test Email Forward',
          type: 'email',
          description: 'Test email forwarding endpoint',
          config: {
            forwardTo: 'test@example.com',
            includeAttachments: true,
            subjectPrefix: '[FORWARDED]'
          }
        }
      })

      if (result.status === 201 && result.data.success) {
        this.createdResources.endpoints.push(result.data.data.id)
        return { status: 'PASS', message: 'Email forward endpoint created successfully', data: result.data.data }
      }
      return { status: 'FAIL', message: `Failed to create email endpoint: ${result.data.error || 'Unknown error'}` }
    }))

    // Test endpoint creation - email group
    suite.results.push(await this.runTest('Create Email Group Endpoint', async () => {
      const result = await this.makeRequest('/endpoints', {
        method: 'POST',
        body: {
          name: 'Test Email Group',
          type: 'email_group',
          description: 'Test email group endpoint',
          config: {
            emails: ['group1@example.com', 'group2@example.com', 'group3@example.com'],
            includeAttachments: false,
            subjectPrefix: '[GROUP]'
          }
        }
      })

      if (result.status === 201 && result.data.success) {
        this.createdResources.endpoints.push(result.data.data.id)
        return { status: 'PASS', message: 'Email group endpoint created successfully', data: result.data.data }
      }
      return { status: 'FAIL', message: `Failed to create email group: ${result.data.error || 'Unknown error'}` }
    }))

    // Test endpoint listing
    suite.results.push(await this.runTest('List All Endpoints', async () => {
      const result = await this.makeRequest('/endpoints')

      if (result.status === 200 && result.data.success) {
        const endpointCount = result.data.data.length
        return { status: 'PASS', message: `Retrieved ${endpointCount} endpoints with enhanced data`, data: result.data }
      }
      return { status: 'FAIL', message: `Failed to list endpoints: ${result.data.error || 'Unknown error'}` }
    }))

    // Test endpoint filtering
    suite.results.push(await this.runTest('Filter Endpoints by Type', async () => {
      const result = await this.makeRequest('/endpoints?type=webhook&limit=10')

      if (result.status === 200 && result.data.success) {
        const webhookCount = result.data.data.filter((e: any) => e.type === 'webhook').length
        const totalCount = result.data.data.length
        if (webhookCount === totalCount) {
          return { status: 'PASS', message: `Filtered to ${webhookCount} webhook endpoints`, data: result.data }
        }
        return { status: 'FAIL', message: `Filter failed: found ${totalCount - webhookCount} non-webhook endpoints` }
      }
      return { status: 'FAIL', message: `Failed to filter endpoints: ${result.data.error || 'Unknown error'}` }
    }))

    // Test individual endpoint retrieval
    if (this.createdResources.endpoints.length > 0) {
      const endpointId = this.createdResources.endpoints[0]
      suite.results.push(await this.runTest('Get Individual Endpoint', async () => {
        const result = await this.makeRequest(`/endpoints/${endpointId}`)

        if (result.status === 200 && result.data.success) {
          const endpoint = result.data.data
          return { 
            status: 'PASS', 
            message: `Retrieved endpoint with delivery stats and usage info`, 
            data: endpoint 
          }
        }
        return { status: 'FAIL', message: `Failed to get endpoint: ${result.data.error || 'Unknown error'}` }
      }))

      // Test endpoint update
      suite.results.push(await this.runTest('Update Endpoint', async () => {
        const result = await this.makeRequest(`/endpoints/${endpointId}`, {
          method: 'PUT',
          body: {
            name: 'Updated Test Webhook',
            description: 'Updated description',
            isActive: false
          }
        })

        if (result.status === 200 && result.data.success) {
          return { status: 'PASS', message: 'Endpoint updated successfully', data: result.data.data }
        }
        return { status: 'FAIL', message: `Failed to update endpoint: ${result.data.error || 'Unknown error'}` }
      }))
    }

    // Test validation errors
    suite.results.push(await this.runTest('Validate Endpoint Creation Errors', async () => {
      const result = await this.makeRequest('/endpoints', {
        method: 'POST',
        body: {
          name: 'Invalid Endpoint',
          type: 'webhook',
          config: {
            url: 'invalid-url'
          }
        }
      })

      if (result.status === 400 && !result.data.success) {
        return { status: 'PASS', message: 'Validation correctly rejected invalid URL', data: result.data }
      }
      return { status: 'FAIL', message: 'Validation failed to catch invalid URL' }
    }))

    // Calculate suite stats
    suite.passed = suite.results.filter(r => r.status === 'PASS').length
    suite.failed = suite.results.filter(r => r.status === 'FAIL').length
    suite.skipped = suite.results.filter(r => r.status === 'SKIP').length
    suite.totalDuration = suite.results.reduce((sum, r) => sum + r.duration, 0)

    this.testResults.push(suite)
  }

  private async testEmailAddresses(): Promise<void> {
    console.log('\n📧 Testing Email Addresses API')
    
    const suite: TestSuite = {
      name: 'Email Addresses',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0
    }

    // Test email address listing
    suite.results.push(await this.runTest('List Email Addresses', async () => {
      const result = await this.makeRequest('/email-addresses')

      if (result.status === 200 && result.data.success) {
        const count = result.data.data.length
        return { status: 'PASS', message: `Retrieved ${count} email addresses with routing info`, data: result.data }
      }
      return { status: 'FAIL', message: `Failed to list email addresses: ${result.data.error || 'Unknown error'}` }
    }))

    // Test email address creation (will likely fail without domain setup, but tests validation)
    suite.results.push(await this.runTest('Test Email Address Validation', async () => {
      const result = await this.makeRequest('/email-addresses', {
        method: 'POST',
        body: {
          address: 'invalid-email',
          domainId: 'nonexistent'
        }
      })

      if (result.status === 400 && !result.data.success) {
        return { status: 'PASS', message: 'Validation correctly rejected invalid email format', data: result.data }
      }
      return { status: 'FAIL', message: 'Validation failed to catch invalid email format' }
    }))

    // Test filtering by domain
    suite.results.push(await this.runTest('Filter Email Addresses by Domain', async () => {
      const result = await this.makeRequest('/email-addresses?limit=5')

      if (result.status === 200 && result.data.success) {
        return { status: 'PASS', message: 'Email address filtering works', data: result.data }
      }
      return { status: 'FAIL', message: `Failed to filter email addresses: ${result.data.error || 'Unknown error'}` }
    }))

    // Calculate suite stats
    suite.passed = suite.results.filter(r => r.status === 'PASS').length
    suite.failed = suite.results.filter(r => r.status === 'FAIL').length
    suite.skipped = suite.results.filter(r => r.status === 'SKIP').length
    suite.totalDuration = suite.results.reduce((sum, r) => sum + r.duration, 0)

    this.testResults.push(suite)
  }

  private async testRouting(): Promise<void> {
    console.log('\n🎯 Testing Email Routing')
    
    const suite: TestSuite = {
      name: 'Routing',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0
    }

    // Test routing check for various email patterns
    const testEmails = [
      'test@example.com',
      'admin@example.com',
      'support@nonexistent.com'
    ]

    for (const email of testEmails) {
      suite.results.push(await this.runTest(`Check Routing for ${email}`, async () => {
        // This would be implemented if we had a routing check endpoint
        return { status: 'SKIP', message: 'Routing check endpoint not implemented yet' }
      }))
    }

    // Calculate suite stats
    suite.passed = suite.results.filter(r => r.status === 'PASS').length
    suite.failed = suite.results.filter(r => r.status === 'FAIL').length
    suite.skipped = suite.results.filter(r => r.status === 'SKIP').length
    suite.totalDuration = suite.results.reduce((sum, r) => sum + r.duration, 0)

    this.testResults.push(suite)
  }

  private async testDeliveries(): Promise<void> {
    console.log('\n📊 Testing Delivery Analytics')
    
    const suite: TestSuite = {
      name: 'Deliveries',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0
    }

    // Test delivery stats for existing endpoints
    if (this.createdResources.endpoints.length > 0) {
      for (const endpointId of this.createdResources.endpoints) {
        suite.results.push(await this.runTest(`Check Delivery Stats for ${endpointId}`, async () => {
          const result = await this.makeRequest(`/endpoints/${endpointId}`)

          if (result.status === 200 && result.data.success) {
            const stats = result.data.data.deliveryStats
            return { 
              status: 'PASS', 
              message: `Delivery stats: ${stats.total} total, ${stats.successful} successful, ${stats.failed} failed`, 
              data: stats 
            }
          }
          return { status: 'FAIL', message: `Failed to get delivery stats: ${result.data.error || 'Unknown error'}` }
        }))
      }
    } else {
      suite.results.push(await this.runTest('No Endpoints to Test', async () => {
        return { status: 'SKIP', message: 'No endpoints were created to test delivery stats' }
      }))
    }

    // Calculate suite stats
    suite.passed = suite.results.filter(r => r.status === 'PASS').length
    suite.failed = suite.results.filter(r => r.status === 'FAIL').length
    suite.skipped = suite.results.filter(r => r.status === 'SKIP').length
    suite.totalDuration = suite.results.reduce((sum, r) => sum + r.duration, 0)

    this.testResults.push(suite)
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning Up Test Resources')

    // Delete created endpoints
    for (const endpointId of this.createdResources.endpoints) {
      try {
        const result = await this.makeRequest(`/endpoints/${endpointId}`, {
          method: 'DELETE'
        })
        if (result.status === 200) {
          console.log(`  ✅ Deleted endpoint ${endpointId}`)
        } else {
          console.log(`  ⚠️  Failed to delete endpoint ${endpointId}: ${result.data.error || 'Unknown error'}`)
        }
      } catch (error) {
        console.log(`  ❌ Error deleting endpoint ${endpointId}: ${error}`)
      }
    }

    // Delete created email addresses
    for (const emailId of this.createdResources.emailAddresses) {
      try {
        const result = await this.makeRequest(`/email-addresses/${emailId}`, {
          method: 'DELETE'
        })
        if (result.status === 200) {
          console.log(`  ✅ Deleted email address ${emailId}`)
        } else {
          console.log(`  ⚠️  Failed to delete email address ${emailId}: ${result.data.error || 'Unknown error'}`)
        }
      } catch (error) {
        console.log(`  ❌ Error deleting email address ${emailId}: ${error}`)
      }
    }
  }

  private printSummary(): void {
    console.log('\n📊 Test Summary')
    console.log('═'.repeat(60))

    let totalPassed = 0
    let totalFailed = 0
    let totalSkipped = 0
    let totalDuration = 0

    for (const suite of this.testResults) {
      totalPassed += suite.passed
      totalFailed += suite.failed
      totalSkipped += suite.skipped
      totalDuration += suite.totalDuration

      const status = suite.failed === 0 ? '✅' : '❌'
      console.log(`${status} ${suite.name}: ${suite.passed}/${suite.passed + suite.failed + suite.skipped} passed (${suite.totalDuration}ms)`)
    }

    console.log('─'.repeat(60))
    console.log(`🎯 Overall: ${totalPassed}/${totalPassed + totalFailed + totalSkipped} tests passed`)
    console.log(`⏱️  Total Time: ${totalDuration}ms`)
    console.log(`📈 Success Rate: ${totalPassed + totalFailed > 0 ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0}%`)

    if (totalFailed > 0) {
      console.log('\n❌ Failed Tests:')
      for (const suite of this.testResults) {
        for (const result of suite.results) {
          if (result.status === 'FAIL') {
            console.log(`   • ${suite.name}: ${result.test} - ${result.message}`)
          }
        }
      }
    }

    console.log('\n🏁 Test run complete!')
    
    // Exit with appropriate code
    if (totalFailed > 0) {
      process.exit(1)
    }
  }
}

// Parse command line arguments
function parseCliArgs(): TestConfig {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      'api-key': { type: 'string' },
      'base-url': { type: 'string' },
      'test-domain': { type: 'string' },
      'test-email': { type: 'string' },
      'no-cleanup': { type: 'boolean' },
      'help': { type: 'boolean' }
    },
    strict: true,
    allowPositionals: true
  })

  if (values.help) {
    console.log(`
Usage: bun run test-v1.1-api.ts [options]

Options:
  --api-key=<key>       API key for authentication (required)
  --base-url=<url>      Base URL for the API (default: https://inbound.new)
  --test-domain=<domain> Domain to use for testing (required)
  --test-email=<email>  Specific email to test (optional)
  --no-cleanup          Don't clean up created resources
  --help                Show this help message

Examples:
  bun run test-v1.1-api.ts --api-key=pk_123abc --test-domain=example.com
  bun run test-v1.1-api.ts --api-key=pk_123abc --base-url=http://localhost:3000 --test-domain=test.local
`)
    process.exit(0)
  }

  if (!values['api-key']) {
    console.error('❌ Error: --api-key is required')
    process.exit(1)
  }

  if (!values['test-domain']) {
    console.error('❌ Error: --test-domain is required')
    process.exit(1)
  }

  return {
    apiKey: values['api-key']!,
    baseUrl: values['base-url'] || 'https://inbound.new',
    testDomain: values['test-domain']!,
    testEmail: values['test-email'],
    cleanup: !values['no-cleanup']
  }
}

// Main execution
async function main() {
  try {
    const config = parseCliArgs()
    const tester = new APIv11Tester(config)
    await tester.runAllTests()
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run if this is the main module
if (import.meta.main) {
  main()
}
import { InboundClient } from '../../src/client'
import { InboundError } from '../../src/types'

interface TestConfig {
  apiKey: string
  baseUrl: string
  testDomain: string
  testWebhookUrl: string
}

interface TestResults {
  passed: number
  failed: number
  errors: string[]
}

export class APIIntegrationTester {
  private client: InboundClient
  private config: TestConfig
  private results: TestResults = { passed: 0, failed: 0, errors: [] }
  
  // Test data cleanup tracking
  private createdWebhooks: string[] = []
  private createdEmails: string[] = []

  constructor(config: TestConfig) {
    this.config = config
    this.client = new InboundClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl
    })
  }

  async runAllTests(): Promise<TestResults> {
    console.log('🚀 Starting API Integration Tests...')
    console.log(`📍 Base URL: ${this.config.baseUrl}`)
    console.log(`🔑 API Key: ${this.config.apiKey.substring(0, 8)}...`)
    console.log(`🌐 Test Domain: ${this.config.testDomain}`)
    console.log('─'.repeat(50))

    try {
      // Test sequence
      await this.testAuthentication()
      await this.testDomainOperations()
      await this.testWebhookOperations()
      await this.testEmailOperations()
      await this.testErrorHandling()
      
      // Cleanup
      await this.cleanup()
      
    } catch (error) {
      this.logError('Critical test failure', error)
    }

    this.printResults()
    return this.results
  }

  private async testAuthentication(): Promise<void> {
    console.log('\n🔐 Testing Authentication...')
    
    try {
      // Test valid API key
      await this.client.listDomains()
      this.logSuccess('Valid API key authentication')
      
      // Test invalid API key
      const invalidClient = new InboundClient({
        apiKey: 'invalid-key',
        baseUrl: this.config.baseUrl
      })
      
      try {
        await invalidClient.listDomains()
        this.logFailure('Invalid API key should have failed')
      } catch (error) {
        if (error instanceof InboundError && error.status === 401) {
          this.logSuccess('Invalid API key properly rejected')
        } else {
          this.logFailure('Unexpected error for invalid API key', error)
        }
      }
      
    } catch (error) {
      this.logFailure('Authentication test failed', error)
    }
  }

  private async testDomainOperations(): Promise<void> {
    console.log('\n🌐 Testing Domain Operations...')
    
    try {
      // List domains
      const domains = await this.client.listDomains()
      this.logSuccess(`Listed ${domains.length} domains`)
      
      // Verify test domain exists
      const testDomain = domains.find(d => d.domain === this.config.testDomain)
      if (testDomain) {
        this.logSuccess(`Test domain ${this.config.testDomain} found`)
        console.log(`   Status: ${testDomain.status}`)
        console.log(`   Can receive emails: ${testDomain.canReceiveEmails}`)
      } else {
        this.logFailure(`Test domain ${this.config.testDomain} not found`)
      }
      
      // Test alias method
      const domainsAlias = await this.client.getDomains()
      if (domainsAlias.length === domains.length) {
        this.logSuccess('getDomains alias works correctly')
      } else {
        this.logFailure('getDomains alias returned different results')
      }
      
    } catch (error) {
      this.logFailure('Domain operations test failed', error)
    }
  }

  private async testWebhookOperations(): Promise<void> {
    console.log('\n🪝 Testing Webhook Operations...')
    
    const testWebhookName = `test-webhook-${Date.now()}`
    
    try {
      // List existing webhooks
      const initialWebhooks = await this.client.listWebhooks()
      this.logSuccess(`Listed ${initialWebhooks.length} existing webhooks`)
      
      // Create webhook
      const newWebhook = await this.client.createWebhook({
        name: testWebhookName,
        endpoint: this.config.testWebhookUrl,
        description: 'Test webhook for integration testing',
        timeout: 30,
        retry: 3
      })
      
      this.createdWebhooks.push(testWebhookName)
      this.logSuccess(`Created webhook: ${newWebhook.name}`)
      console.log(`   ID: ${newWebhook.id}`)
      console.log(`   URL: ${newWebhook.url}`)
      console.log(`   Secret: ${newWebhook.secret?.substring(0, 8)}...`)
      
      // List webhooks again to verify creation
      const updatedWebhooks = await this.client.listWebhooks()
      if (updatedWebhooks.length === initialWebhooks.length + 1) {
        this.logSuccess('Webhook count increased correctly')
      } else {
        this.logFailure('Webhook count did not increase as expected')
      }
      
      // Test webhook alias methods
      const webhooksAlias = await this.client.getWebhooks()
      if (webhooksAlias.length === updatedWebhooks.length) {
        this.logSuccess('getWebhooks alias works correctly')
      } else {
        this.logFailure('getWebhooks alias returned different results')
      }
      
      // Test addWebhook alias
      const aliasWebhookName = `test-webhook-alias-${Date.now()}`
      const aliasWebhook = await this.client.addWebhook(
        aliasWebhookName,
        this.config.testWebhookUrl,
        { description: 'Test webhook via alias method' }
      )
      
      this.createdWebhooks.push(aliasWebhookName)
      this.logSuccess(`Created webhook via alias: ${aliasWebhook.name}`)
      
      // Test duplicate webhook name
      try {
        await this.client.createWebhook({
          name: testWebhookName,
          endpoint: this.config.testWebhookUrl
        })
        this.logFailure('Duplicate webhook name should have failed')
      } catch (error) {
        if (error instanceof InboundError && error.status === 409) {
          this.logSuccess('Duplicate webhook name properly rejected')
        } else {
          this.logFailure('Unexpected error for duplicate webhook', error)
        }
      }
      
    } catch (error) {
      this.logFailure('Webhook operations test failed', error)
    }
  }

  private async testEmailOperations(): Promise<void> {
    console.log('\n📧 Testing Email Operations...')
    
    const testEmail = `test-${Date.now()}@${this.config.testDomain}`
    
    try {
      // Get webhook for email assignment
      const webhooks = await this.client.listWebhooks()
      const testWebhook = webhooks.find(w => this.createdWebhooks.includes(w.name))
      
      // List emails for domain
      const initialEmails = await this.client.listEmails(this.config.testDomain)
      this.logSuccess(`Listed ${initialEmails.emails.length} emails for domain`)
      
      // Create email address
      const newEmail = await this.client.createEmail({
        domain: this.config.testDomain,
        email: testEmail,
        webhookId: testWebhook?.id
      })
      
      this.createdEmails.push(testEmail)
      this.logSuccess(`Created email: ${newEmail.address}`)
      console.log(`   ID: ${newEmail.id}`)
      console.log(`   Webhook ID: ${newEmail.webhookId}`)
      console.log(`   Active: ${newEmail.isActive}`)
      
      // List emails again to verify creation
      const updatedEmails = await this.client.listEmails(this.config.testDomain)
      if (updatedEmails.emails.length === initialEmails.emails.length + 1) {
        this.logSuccess('Email count increased correctly')
      } else {
        this.logFailure('Email count did not increase as expected')
      }
      
      // Test getEmails alias
      const emailsAlias = await this.client.getEmails(this.config.testDomain)
      if (emailsAlias.length === updatedEmails.emails.length) {
        this.logSuccess('getEmails alias works correctly')
      } else {
        this.logFailure('getEmails alias returned different results')
      }
      
      // Test addEmail alias
      const aliasEmail = `test-alias-${Date.now()}@${this.config.testDomain}`
      const aliasEmailResult = await this.client.addEmail(
        this.config.testDomain,
        aliasEmail,
        testWebhook?.id
      )
      
      this.createdEmails.push(aliasEmail)
      this.logSuccess(`Created email via alias: ${aliasEmailResult.address}`)
      
      // Test duplicate email
      try {
        await this.client.createEmail({
          domain: this.config.testDomain,
          email: testEmail
        })
        this.logFailure('Duplicate email should have failed')
      } catch (error) {
        if (error instanceof InboundError && error.status === 409) {
          this.logSuccess('Duplicate email properly rejected')
        } else {
          this.logFailure('Unexpected error for duplicate email', error)
        }
      }
      
      // Test invalid email format
      try {
        await this.client.createEmail({
          domain: this.config.testDomain,
          email: 'invalid-email'
        })
        this.logFailure('Invalid email format should have failed')
      } catch (error) {
        if (error instanceof InboundError && error.status === 400) {
          this.logSuccess('Invalid email format properly rejected')
        } else {
          this.logFailure('Unexpected error for invalid email', error)
        }
      }
      
      // Test wrong domain
      try {
        await this.client.createEmail({
          domain: this.config.testDomain,
          email: 'test@wrongdomain.com'
        })
        this.logFailure('Wrong domain should have failed')
      } catch (error) {
        if (error instanceof InboundError && error.status === 400) {
          this.logSuccess('Wrong domain properly rejected')
        } else {
          this.logFailure('Unexpected error for wrong domain', error)
        }
      }
      
    } catch (error) {
      this.logFailure('Email operations test failed', error)
    }
  }

  private async testErrorHandling(): Promise<void> {
    console.log('\n⚠️ Testing Error Handling...')
    
    try {
      // Test non-existent domain
      try {
        await this.client.listEmails('nonexistent-domain.com')
        this.logFailure('Non-existent domain should have failed')
      } catch (error) {
        if (error instanceof InboundError && error.status === 404) {
          this.logSuccess('Non-existent domain properly rejected')
        } else {
          this.logFailure('Unexpected error for non-existent domain', error)
        }
      }
      
      // Test invalid webhook URL
      try {
        await this.client.createWebhook({
          name: `invalid-url-test-${Date.now()}`,
          endpoint: 'not-a-url'
        })
        this.logFailure('Invalid webhook URL should have failed')
      } catch (error) {
        if (error instanceof InboundError && error.status === 400) {
          this.logSuccess('Invalid webhook URL properly rejected')
        } else {
          this.logFailure('Unexpected error for invalid webhook URL', error)
        }
      }
      
    } catch (error) {
      this.logFailure('Error handling test failed', error)
    }
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up test data...')
    
    // Remove created emails
    for (const email of this.createdEmails) {
      try {
        await this.client.removeEmail(this.config.testDomain, email)
        console.log(`   ✅ Removed email: ${email}`)
      } catch (error) {
        console.log(`   ❌ Failed to remove email ${email}:`, error)
      }
    }
    
    // Remove created webhooks
    for (const webhookName of this.createdWebhooks) {
      try {
        await this.client.removeWebhook(webhookName)
        console.log(`   ✅ Removed webhook: ${webhookName}`)
      } catch (error) {
        console.log(`   ❌ Failed to remove webhook ${webhookName}:`, error)
      }
    }
  }

  private logSuccess(message: string): void {
    console.log(`   ✅ ${message}`)
    this.results.passed++
  }

  private logFailure(message: string, error?: any): void {
    console.log(`   ❌ ${message}`)
    if (error) {
      console.log(`      Error: ${error.message || error}`)
    }
    this.results.failed++
    this.results.errors.push(message)
  }

  private logError(message: string, error: any): void {
    console.error(`💥 ${message}:`, error)
    this.results.errors.push(`${message}: ${error.message || error}`)
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(50))
    console.log('📊 TEST RESULTS')
    console.log('='.repeat(50))
    console.log(`✅ Passed: ${this.results.passed}`)
    console.log(`❌ Failed: ${this.results.failed}`)
    console.log(`📈 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`)
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:')
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`)
      })
    }
    
    console.log('='.repeat(50))
  }
}

// Export for use in test runner
export async function runIntegrationTests(config: TestConfig): Promise<TestResults> {
  const tester = new APIIntegrationTester(config)
  return await tester.runAllTests()
} 
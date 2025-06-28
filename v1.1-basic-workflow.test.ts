import { describe, it, expect, beforeAll } from 'bun:test'
import { config } from 'dotenv'

// Load environment variables
config()

// Test configuration
const BASE_URL = 'http://localhost:3000'
const API_KEY = process.env.INBOUND_API_KEY
console.log("API KEY" + API_KEY)
const TARGET_DOMAIN = 'inbound.run'

// Store test data that will be used across tests
let testContext = {
  domainId: '',
  endpointId: '',
  emailAddressId: '',
  emailAddress: '',
  emailGroupEndpointId: '',
  emailGroupAddressId: '',
  emailGroupAddress: ''
}

// Helper function to make authenticated API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    ...options.headers
  }

  const response = await fetch(url, {
    ...options,
    headers
  })

  const data = await response.json()
  return { response, data }
}

describe('API v1.1 Basic Workflow Test', () => {
  
  beforeAll(() => {
    console.log('🚀 Starting API v1.1 Basic Workflow Test')
    console.log(`📡 Base URL: ${BASE_URL}`)
    console.log(`🔑 API Key: ${API_KEY ? 'Loaded' : 'Missing'}`)
    console.log(`🌐 Target Domain: ${TARGET_DOMAIN}`)
    
    if (!API_KEY) {
      throw new Error('INBOUND_API_KEY environment variable is required')
    }
  })

  it('Step 1: Should list domains and find the target domain', async () => {
    console.log('📋 Step 1: Listing domains...')
    
    const { response, data } = await apiRequest('/api/v1.1/domains')
    
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toBeInstanceOf(Array)
    
    // Find the target domain (inbound.run)
    const targetDomain = data.data.find((domain: any) => domain.domain === TARGET_DOMAIN)
    
    if (!targetDomain) {
      throw new Error(`Target domain '${TARGET_DOMAIN}' not found in user's domains`)
    }
    
    // Store domain ID for next tests
    testContext.domainId = targetDomain.id
    
    console.log(`✅ Step 1: Found target domain - ID: ${testContext.domainId}, Status: ${targetDomain.status}`)
    
    expect(targetDomain.id).toBeDefined()
    expect(targetDomain.domain).toBe(TARGET_DOMAIN)
  })

  it('Step 2: Should create a new webhook endpoint', async () => {
    console.log('🔗 Step 2: Creating webhook endpoint...')
    
    // Ensure we have a domain ID from previous test
    expect(testContext.domainId).toBeTruthy()
    
    const webhookData = {
      name: 'Basic Workflow Test Webhook',
      type: 'webhook',
      description: 'Test webhook created during basic workflow test',
      config: {
        url: 'https://webhook.site/unique-basic-test-webhook',
        timeout: 30,
        retryAttempts: 3,
        headers: {
          'X-Test-Source': 'basic-workflow-test'
        }
      }
    }
    
    const { response, data } = await apiRequest('/api/v1.1/endpoints', {
      method: 'POST',
      body: JSON.stringify(webhookData)
    })
    
    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.id).toBeDefined()
    expect(data.data.name).toBe(webhookData.name)
    expect(data.data.type).toBe('webhook')
    expect(data.data.isActive).toBe(true)
    
    // Store endpoint ID for next tests
    testContext.endpointId = data.data.id
    
    console.log(`✅ Step 2: Created webhook endpoint - ID: ${testContext.endpointId}`)
  })

  it('Step 3: Should create a new email address linked to the endpoint', async () => {
    console.log('📧 Step 3: Creating email address linked to endpoint...')
    
    // Ensure we have domain ID and endpoint ID from previous tests
    expect(testContext.domainId).toBeTruthy()
    expect(testContext.endpointId).toBeTruthy()
    
    // Generate a unique email address for this test
    const timestamp = Date.now()
    const emailAddress = `basic-test-${timestamp}@${TARGET_DOMAIN}`
    testContext.emailAddress = emailAddress
    
    const emailData = {
      address: emailAddress,
      domainId: testContext.domainId,
      endpointId: testContext.endpointId,
      isActive: true
    }
    
    const { response, data } = await apiRequest('/api/v1.1/email-addresses', {
      method: 'POST',
      body: JSON.stringify(emailData)
    })
    
    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.id).toBeDefined()
    expect(data.data.address).toBe(emailAddress)
    expect(data.data.isActive).toBe(true)
    expect(data.data.domain.id).toBe(testContext.domainId)
    expect(data.data.routing.type).toBe('endpoint')
    expect(data.data.routing.id).toBe(testContext.endpointId)
    
    // Store email address ID for verification
    testContext.emailAddressId = data.data.id
    
    console.log(`✅ Step 3: Created email address - ID: ${testContext.emailAddressId}, Address: ${emailAddress}`)
  })

  it('Step 4: Should verify the email address appears in the list with correct routing', async () => {
    console.log('🔍 Step 4: Verifying email address in list...')
    
    // Ensure we have the email address ID from previous test
    expect(testContext.emailAddressId).toBeTruthy()
    
    const { response, data } = await apiRequest(`/api/v1.1/email-addresses?domainId=${testContext.domainId}`)
    
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toBeInstanceOf(Array)
    
    // Find our created email address
    const createdEmail = data.data.find((email: any) => email.id === testContext.emailAddressId)
    
    expect(createdEmail).toBeDefined()
    expect(createdEmail.address).toBe(testContext.emailAddress)
    expect(createdEmail.isActive).toBe(true)
    expect(createdEmail.domain.id).toBe(testContext.domainId)
    expect(createdEmail.routing.type).toBe('endpoint')
    expect(createdEmail.routing.id).toBe(testContext.endpointId)
    
    console.log(`✅ Step 4: Verified email address in list with correct routing`)
  })

  it('Step 5: Should verify the endpoint shows up in endpoints list with correct data', async () => {
    console.log('🔍 Step 5: Verifying endpoint in list...')
    
    // Ensure we have the endpoint ID from previous test
    expect(testContext.endpointId).toBeTruthy()
    
    const { response, data } = await apiRequest('/api/v1.1/endpoints')
    
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toBeInstanceOf(Array)
    
    // Find our created endpoint
    const createdEndpoint = data.data.find((endpoint: any) => endpoint.id === testContext.endpointId)
    
    expect(createdEndpoint).toBeDefined()
    expect(createdEndpoint.name).toBe('Basic Workflow Test Webhook')
    expect(createdEndpoint.type).toBe('webhook')
    expect(createdEndpoint.isActive).toBe(true)
    expect(createdEndpoint.config.url).toBe('https://webhook.site/unique-basic-test-webhook')
    expect(createdEndpoint.deliveryStats).toBeDefined()
    expect(createdEndpoint.deliveryStats.total).toBe(0) // New endpoint should have no deliveries
    
    console.log(`✅ Step 5: Verified endpoint in list with correct configuration`)
  })

  it('Step 6: Should create an email group endpoint and link another email to it', async () => {
    console.log('📮 Step 6: Creating email group endpoint...')
    
    // Ensure we have a domain ID
    expect(testContext.domainId).toBeTruthy()
    
    const emailGroupData = {
      name: 'Basic Workflow Test Email Group',
      type: 'email_group',
      description: 'Test email group created during basic workflow test',
      config: {
        emails: [
          'test1@example.com',
          'test2@example.com',
          'test3@example.com'
        ],
        includeAttachments: true
      }
    }
    
    const { response, data } = await apiRequest('/api/v1.1/endpoints', {
      method: 'POST',
      body: JSON.stringify(emailGroupData)
    })
    
    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.type).toBe('email_group')
    expect(data.data.groupEmails).toEqual(emailGroupData.config.emails)
    
    // Store email group endpoint ID for cleanup
    testContext.emailGroupEndpointId = data.data.id
    
    // Create another email address linked to this email group endpoint
    const timestamp = Date.now()
    const groupEmailAddress = `group-test-${timestamp}@${TARGET_DOMAIN}`
    testContext.emailGroupAddress = groupEmailAddress
    
    const groupEmailData = {
      address: groupEmailAddress,
      domainId: testContext.domainId,
      endpointId: data.data.id,
      isActive: true
    }
    
    const { response: emailResponse, data: emailData } = await apiRequest('/api/v1.1/email-addresses', {
      method: 'POST',
      body: JSON.stringify(groupEmailData)
    })
    
    expect(emailResponse.status).toBe(201)
    expect(emailData.success).toBe(true)
    expect(emailData.data.routing.type).toBe('endpoint')
    expect(emailData.data.routing.id).toBe(data.data.id)
    
    // Store email group address ID for cleanup
    testContext.emailGroupAddressId = emailData.data.id
    
    console.log(`✅ Step 6: Created email group endpoint and linked email address: ${groupEmailAddress}`)
  })

  it('Step 7: Should verify all created resources exist and are properly linked', async () => {
    console.log('🔍 Step 7: Final verification of all resources...')
    
    // Verify domain exists
    const { response: domainsResponse, data: domainsData } = await apiRequest('/api/v1.1/domains')
    expect(domainsResponse.status).toBe(200)
    const domain = domainsData.data.find((d: any) => d.id === testContext.domainId)
    expect(domain).toBeDefined()
    
    // Verify endpoints exist
    const { response: endpointsResponse, data: endpointsData } = await apiRequest('/api/v1.1/endpoints')
    expect(endpointsResponse.status).toBe(200)
    const webhook = endpointsData.data.find((e: any) => e.id === testContext.endpointId)
    expect(webhook).toBeDefined()
    expect(webhook.type).toBe('webhook')
    
    // Verify email addresses exist with correct routing
    const { response: emailsResponse, data: emailsData } = await apiRequest('/api/v1.1/email-addresses')
    expect(emailsResponse.status).toBe(200)
    const email = emailsData.data.find((e: any) => e.id === testContext.emailAddressId)
    expect(email).toBeDefined()
    expect(email.routing.id).toBe(testContext.endpointId)
    
    console.log(`✅ Step 7: All resources verified and properly linked`)
  })

  it('Step 8: Should clean up all created test resources', async () => {
    console.log('🧹 Step 8: Cleaning up test resources...')
    
    // Delete email addresses first (they depend on endpoints)
    if (testContext.emailAddressId) {
      console.log(`🗑️ Deleting email address: ${testContext.emailAddress}`)
      const { response: deleteEmailResponse } = await apiRequest(`/api/v1.1/email-addresses/${testContext.emailAddressId}`, {
        method: 'DELETE'
      })
      
      if (deleteEmailResponse.status === 200) {
        console.log(`✅ Successfully deleted email address: ${testContext.emailAddress}`)
      } else {
        console.warn(`⚠️ Failed to delete email address: ${testContext.emailAddress} (status: ${deleteEmailResponse.status})`)
      }
    }
    
    if (testContext.emailGroupAddressId) {
      console.log(`🗑️ Deleting email group address: ${testContext.emailGroupAddress}`)
      const { response: deleteGroupEmailResponse } = await apiRequest(`/api/v1.1/email-addresses/${testContext.emailGroupAddressId}`, {
        method: 'DELETE'
      })
      
      if (deleteGroupEmailResponse.status === 200) {
        console.log(`✅ Successfully deleted email group address: ${testContext.emailGroupAddress}`)
      } else {
        console.warn(`⚠️ Failed to delete email group address: ${testContext.emailGroupAddress} (status: ${deleteGroupEmailResponse.status})`)
      }
    }
    
    // Delete endpoints after email addresses
    if (testContext.endpointId) {
      console.log(`🗑️ Deleting webhook endpoint: ${testContext.endpointId}`)
      const { response: deleteEndpointResponse } = await apiRequest(`/api/v1.1/endpoints/${testContext.endpointId}`, {
        method: 'DELETE'
      })
      
      if (deleteEndpointResponse.status === 200) {
        console.log(`✅ Successfully deleted webhook endpoint: ${testContext.endpointId}`)
      } else {
        console.warn(`⚠️ Failed to delete webhook endpoint: ${testContext.endpointId} (status: ${deleteEndpointResponse.status})`)
      }
    }
    
    if (testContext.emailGroupEndpointId) {
      console.log(`🗑️ Deleting email group endpoint: ${testContext.emailGroupEndpointId}`)
      const { response: deleteGroupEndpointResponse } = await apiRequest(`/api/v1.1/endpoints/${testContext.emailGroupEndpointId}`, {
        method: 'DELETE'
      })
      
      if (deleteGroupEndpointResponse.status === 200) {
        console.log(`✅ Successfully deleted email group endpoint: ${testContext.emailGroupEndpointId}`)
      } else {
        console.warn(`⚠️ Failed to delete email group endpoint: ${testContext.emailGroupEndpointId} (status: ${deleteGroupEndpointResponse.status})`)
      }
    }
    
    console.log(`🧹 Step 8: Cleanup completed`)
    console.log(`🎉 Basic workflow test completed successfully!`)
    console.log(`📋 Summary:`)
    console.log(`   - Domain ID: ${testContext.domainId}`)
    console.log(`   - Endpoint ID: ${testContext.endpointId}`)
    console.log(`   - Email Address: ${testContext.emailAddress}`)
    console.log(`   - Email Address ID: ${testContext.emailAddressId}`)
    console.log(`   - All test resources have been cleaned up`)
  })

}) 
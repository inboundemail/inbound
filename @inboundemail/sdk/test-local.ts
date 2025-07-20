#!/usr/bin/env bun

// Local testing script for the SDK
import { Inbound } from './src/index'

async function testSDK() {
  console.log('🚀 Testing Inbound SDK locally...')
  
  // Initialize with a test API key
  const inbound = new Inbound({
    apiKey: 'macbook-testingVaWvxQLddFWZQSuqHLZxKVMCBrBbsGRoUOYmRtUCaOYltLpeQALEfcMTbhhDBmiU',
    // You can point to your local development server
    baseUrl: 'http://localhost:3000/api/v2'
  })
  
  try {
    // Test basic initialization
    console.log('✅ SDK initialized successfully')
    
    // You can test methods here (they'll hit your local API)
    // const domains = await inbound.domains.list()
    // console.log('Domains:', domains)
    
  } catch (error) {
    console.error('❌ Error testing SDK:', error)
  }
}

// Run the test
testSDK() 
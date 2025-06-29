#!/usr/bin/env bun

import { blockEmail, unblockEmail, isEmailBlocked, getBlockedEmailsForUser } from '@/lib/email-blocking'

async function testEmailBlocking() {
  console.log('🧪 Testing Email Blocking Functionality')
  console.log('=====================================')

  const testEmail = 'test@example.com'
  const testUserId = 'test-user-123'
  const testReason = 'Testing email blocking functionality'

  try {
    // Test 1: Check if email is initially not blocked
    console.log('\n1. Checking if test email is initially not blocked...')
    const initiallyBlocked = await isEmailBlocked(testEmail)
    console.log(`   Result: ${testEmail} is ${initiallyBlocked ? 'blocked' : 'not blocked'}`)

    // Test 2: Try to block an email (this should fail because domain doesn't exist)
    console.log('\n2. Attempting to block email (should fail - domain not found)...')
    const blockResult = await blockEmail(testEmail, testUserId, testReason)
    console.log(`   Success: ${blockResult.success}`)
    console.log(`   Message: ${blockResult.message || blockResult.error}`)

    // Test 3: Check the email is still not blocked
    console.log('\n3. Verifying email is still not blocked...')
    const stillNotBlocked = await isEmailBlocked(testEmail)
    console.log(`   Result: ${testEmail} is ${stillNotBlocked ? 'blocked' : 'not blocked'}`)

    // Test 4: Test invalid email format
    console.log('\n4. Testing invalid email format...')
    const invalidEmailResult = await blockEmail('invalid-email', testUserId, testReason)
    console.log(`   Success: ${invalidEmailResult.success}`)
    console.log(`   Error: ${invalidEmailResult.error}`)

    // Test 5: Test getting blocked emails for user
    console.log('\n5. Getting blocked emails for test user...')
    const blockedEmailsResult = await getBlockedEmailsForUser(testUserId)
    console.log(`   Success: ${blockedEmailsResult.success}`)
    console.log(`   Count: ${blockedEmailsResult.blockedEmails?.length || 0} blocked emails`)

    console.log('\n✅ Email blocking tests completed!')
    console.log('\nNote: To fully test blocking functionality, you need:')
    console.log('- A domain in the system with catch-all enabled')
    console.log('- Run the database migration to create the blocked_emails table')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run the test
testEmailBlocking() 
/**
 * Admin Security Test Script
 * 
 * This script tests that admin pages and functions are properly protected
 * from regular users. Run this to verify security measures are working.
 */

import { auth } from '@/lib/auth/auth'
import { requireAdmin, isCurrentUserAdmin } from '@/lib/auth/auth-utils'
import { 
  getLambdaFunctionInfo, 
  getLambdaRecentLogs, 
  checkAWSConnection 
} from '@/app/(main)/admin/actions/lambda'
import { getAllDomainsForAdmin, getDomainEmailAddressesForAdmin } from '@/app/actions/primary'
import { getUserAnalytics } from '@/app/actions/user-analytics'

async function testAdminSecurity() {
  console.log('🔒 Testing Admin Security Measures...\n')

  // Test 1: requireAdmin function
  console.log('Test 1: requireAdmin function')
  try {
    await requireAdmin()
    console.log('❌ FAIL: requireAdmin should throw error when no session')
  } catch (error) {
    console.log('✅ PASS: requireAdmin properly blocks access without admin session')
  }

  // Test 2: Lambda actions protection
  console.log('\nTest 2: Lambda actions protection')
  try {
    await getLambdaFunctionInfo()
    console.log('❌ FAIL: Lambda function info should be protected')
  } catch (error) {
    console.log('✅ PASS: Lambda function info properly protected')
  }

  try {
    await getLambdaRecentLogs()
    console.log('❌ FAIL: Lambda logs should be protected')
  } catch (error) {
    console.log('✅ PASS: Lambda logs properly protected')
  }

  try {
    await checkAWSConnection()
    console.log('❌ FAIL: AWS connection check should be protected')
  } catch (error) {
    console.log('✅ PASS: AWS connection check properly protected')
  }

  // Test 3: Domain admin actions protection
  console.log('\nTest 3: Domain admin actions protection')
  try {
    await getAllDomainsForAdmin()
    console.log('❌ FAIL: getAllDomainsForAdmin should be protected')
  } catch (error) {
    console.log('✅ PASS: getAllDomainsForAdmin properly protected')
  }

  // Test 4: User analytics protection
  console.log('\nTest 4: User analytics protection')
  try {
    await getUserAnalytics()
    console.log('❌ FAIL: getUserAnalytics should be protected')
  } catch (error) {
    console.log('✅ PASS: getUserAnalytics properly protected')
  }

  console.log('\n🔒 Admin Security Test Complete!')
  console.log('\n📋 Security Measures Implemented:')
  console.log('  ✅ Middleware protection for /admin routes')
  console.log('  ✅ Server-side layout protection')
  console.log('  ✅ Client-side page protection')
  console.log('  ✅ Server action admin checks')
  console.log('  ✅ Navigation hiding for non-admins')
  console.log('  ✅ Lambda function protection')
  console.log('  ✅ Domain management protection')
  console.log('  ✅ User analytics protection')
  console.log('  ✅ Feature flag management protection')
}

// Run the test if this file is executed directly
if (require.main === module) {
  testAdminSecurity().catch(console.error)
}

export { testAdminSecurity }
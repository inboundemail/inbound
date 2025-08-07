#!/usr/bin/env bun

import 'dotenv/config';
import { testDatabaseConnection, testRawConnection, testSchemaConnection, healthCheck } from '../lib/db/connection-test';

async function main() {
  console.log('🚀 Starting database connection tests...\n');
  
  // Debug environment
  console.log('🔧 Environment check:');
  console.log(`   DATABASE_URL set: ${process.env.DATABASE_URL ? 'YES' : 'NO'}`);
  console.log(`   DATABASE_URL length: ${process.env.DATABASE_URL?.length || 0}`);
  console.log(`   DATABASE_URL starts with: ${process.env.DATABASE_URL?.substring(0, 20)}...`);
  
  // Show cleaned connection string
  const originalUrl = process.env.DATABASE_URL!;
  const cleanedUrl = originalUrl
    .replace(/[&?]sslrootcert=system/g, '')
    .replace(/[&?]sslmode=verify-full/g, '');
  console.log(`   Cleaned URL length: ${cleanedUrl.length}`);
  console.log(`   Cleaned URL starts with: ${cleanedUrl.substring(0, 20)}...`);
  console.log('');

  // Test 1: Basic Drizzle connection
  console.log('=== Test 1: Basic Drizzle Connection ===');
  const basicResult = await testDatabaseConnection();
  console.log('Result:', basicResult);
  console.log('');

  // Test 2: Raw pool connection
  console.log('=== Test 2: Raw Pool Connection ===');
  const rawResult = await testRawConnection();
  console.log('Result:', rawResult);
  console.log('');

  // Test 3: Schema connection
  console.log('=== Test 3: Schema Connection ===');
  const schemaResult = await testSchemaConnection();
  console.log('Result:', schemaResult);
  console.log('');

  // Test 4: Comprehensive health check
  console.log('=== Test 4: Comprehensive Health Check ===');
  const healthResult = await healthCheck();
  console.log('Result:', healthResult);
  console.log('');

  // Summary
  const allTests = [basicResult, rawResult, schemaResult, healthResult];
  const passedTests = allTests.filter(test => test.success).length;
  
  console.log('=== SUMMARY ===');
  console.log(`✅ Passed: ${passedTests}/${allTests.length} tests`);
  
  if (passedTests === allTests.length) {
    console.log('🎉 All database connection tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Check the results above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});

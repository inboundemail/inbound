#!/usr/bin/env bun

import { execSync } from 'child_process'
import { config } from 'dotenv'

// Load environment variables
config()

console.log('🚀 Starting database preparation for production...')

// Check if PROD_DATABASE_URL is set
if (!process.env.PROD_DATABASE_URL) {
  console.error('❌ PROD_DATABASE_URL environment variable is not set')
  console.error('   Please set PROD_DATABASE_URL before running this script')
  process.exit(1)
}

console.log('✅ PROD_DATABASE_URL found')

try {
  // Set DATABASE_URL to PROD_DATABASE_URL for drizzle-kit
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL
  
  console.log('\n📋 Step 1: Generating migration files...')
  execSync('bunx drizzle-kit generate', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.PROD_DATABASE_URL
    }
  })
  console.log('✅ Migration files generated successfully')

  console.log('\n🚀 Step 2: Pushing changes to production database...')
  execSync('bunx drizzle-kit push', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.PROD_DATABASE_URL
    }
  })
  console.log('✅ Database changes pushed to production successfully')

  console.log('\n🎉 Database preparation completed successfully!')
  console.log('   - Migration files generated')
  console.log('   - Schema pushed to production database')

} catch (error) {
  console.error('\n❌ Database preparation failed:')
  console.error(error)
  process.exit(1)
} 
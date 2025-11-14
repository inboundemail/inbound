/**
 * v3 API Setup Verification Script
 * 
 * Run this to verify your v3 API infrastructure is properly set up
 * 
 * Usage: bun run scripts/verify-v3-setup.ts
 */

console.log('🔍 Verifying v3 API Setup...\n')

// Check environment variables
console.log('📋 Environment Variables:')
const requiredEnvVars = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
]

const optionalEnvVars = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SENTRY_DSN',
  'NEXT_PUBLIC_API_URL'
]

let missingRequired = false
requiredEnvVars.forEach(key => {
  if (process.env[key]) {
    console.log(`  ✅ ${key}`)
  } else {
    console.log(`  ❌ ${key} - REQUIRED`)
    missingRequired = true
  }
})

optionalEnvVars.forEach(key => {
  if (process.env[key]) {
    console.log(`  ✅ ${key}`)
  } else {
    console.log(`  ⚠️  ${key} - optional (feature disabled)`)
  }
})

console.log()

// Check dependencies
console.log('📦 Dependencies:')
const requiredDeps = [
  '@orpc/server',
  '@orpc/client', 
  '@orpc/openapi',
  '@upstash/redis',
  '@upstash/ratelimit',
  'zod'
]

let missingDeps = false
try {
  for (const dep of requiredDeps) {
    try {
      await import(dep)
      console.log(`  ✅ ${dep}`)
    } catch {
      console.log(`  ❌ ${dep} - run: bun add ${dep}`)
      missingDeps = true
    }
  }
} catch (error) {
  console.log('  ❌ Error checking dependencies')
  missingDeps = true
}

console.log()

// Check file structure
console.log('📁 File Structure:')
const fs = await import('fs')
const path = await import('path')

const requiredFiles = [
  'app/api/v3/_lib/context.ts',
  'app/api/v3/_lib/rate-limiter.ts',
  'app/api/v3/_lib/error-handler.ts',
  'app/api/v3/_lib/procedures.ts',
  'app/api/v3/types/common.ts',
  'app/api/v3/types/errors.ts',
  'app/api/v3/types/domain.ts',
  'app/api/v3/types/email.ts',
  'app/api/v3/types/endpoint.ts',
  'app/api/v3/types/email-address.ts',
  'lib/api/v3-client.ts'
]

let missingFiles = false
for (const file of requiredFiles) {
  const filePath = path.join(process.cwd(), file)
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`)
  } else {
    console.log(`  ❌ ${file}`)
    missingFiles = true
  }
}

console.log()

// Test imports
console.log('🧪 Testing Imports:')
try {
  const { createContext, createAuthenticatedContext } = await import('../app/api/v3/_lib/context')
  console.log('  ✅ Context module loads correctly')
} catch (error) {
  console.log('  ❌ Context module failed:', (error as Error).message)
}

try {
  const { checkRateLimit } = await import('../app/api/v3/_lib/rate-limiter')
  console.log('  ✅ Rate limiter module loads correctly')
} catch (error) {
  console.log('  ❌ Rate limiter module failed:', (error as Error).message)
}

try {
  const { APIError, ErrorCodes } = await import('../app/api/v3/_lib/error-handler')
  console.log('  ✅ Error handler module loads correctly')
} catch (error) {
  console.log('  ❌ Error handler module failed:', (error as Error).message)
}

try {
  const { baseProcedure, authenticatedProcedure } = await import('../app/api/v3/_lib/procedures')
  console.log('  ✅ Procedures module loads correctly')
} catch (error) {
  console.log('  ❌ Procedures module failed:', (error as Error).message)
}

console.log()

// Summary
console.log('📊 Summary:')
if (missingRequired) {
  console.log('  ❌ Missing required environment variables')
  console.log('     Add them to your .env file')
}
if (missingDeps) {
  console.log('  ❌ Missing required dependencies')
  console.log('     Run: bun add @orpc/server @orpc/client @orpc/openapi @upstash/redis @upstash/ratelimit zod')
}
if (missingFiles) {
  console.log('  ❌ Missing required files')
  console.log('     Check the setup guide: app/api/v3/SETUP.md')
}

if (!missingRequired && !missingDeps && !missingFiles) {
  console.log('  ✅ All checks passed!')
  console.log()
  console.log('🚀 You\'re ready to build v3 API routes!')
  console.log()
  console.log('Next steps:')
  console.log('  1. Review: docs/v3-implementation-checklist.md')
  console.log('  2. Start with Phase 2: Implement domains resource')
  console.log('  3. Reference: .cursor/rules/oRPC-Handling.mdc')
  process.exit(0)
} else {
  console.log()
  console.log('⚠️  Setup incomplete. Fix the issues above and run again.')
  process.exit(1)
}



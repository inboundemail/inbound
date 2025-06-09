#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// CLI styling utilities
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
}

const symbols = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
  search: '🔍',
  file: '📄',
  folder: '📁',
  api: '🚀',
  unused: '🗑️',
  used: '✨'
}

// Utility functions for CLI output
const log = {
  title: (text: string) => console.log(`\n${colors.bright}${colors.cyan}${text}${colors.reset}\n`),
  success: (text: string) => console.log(`${colors.green}${symbols.success} ${text}${colors.reset}`),
  warning: (text: string) => console.log(`${colors.yellow}${symbols.warning} ${text}${colors.reset}`),
  error: (text: string) => console.log(`${colors.red}${symbols.error} ${text}${colors.reset}`),
  info: (text: string) => console.log(`${colors.blue}${symbols.info} ${text}${colors.reset}`),
  dim: (text: string) => console.log(`${colors.dim}${text}${colors.reset}`),
  highlight: (text: string) => console.log(`${colors.bright}${colors.white}${text}${colors.reset}`),
  section: (title: string) => {
    console.log(`\n${colors.bright}${colors.magenta}━━━ ${title} ━━━${colors.reset}`)
  }
}

const apiRoutes = [
  '/api/analytics',
  '/api/auth/[...all]',
  '/api/autumn/[...all]',
  '/api/domain/verifications',
  '/api/domains',
  '/api/domains/[id]',
  '/api/domains/[id]/email-addresses',
  '/api/domains/[id]/email-addresses/[emailId]/webhook',
  '/api/domains/stats',
  '/api/emails/[id]',
  '/api/emails/[id]/read',
  '/api/emails/send',
  '/api/inbound/check-dns',
  '/api/inbound/check-dns-records',
  '/api/inbound/check-recipient',
  '/api/inbound/configure-email',
  '/api/inbound/get-email-addresses',
  '/api/inbound/test-email',
  '/api/inbound/verify-domain',
  '/api/inbound/webhook',
  '/api/inbound/webhook/sns',
  '/api/resend/domains',
  '/api/test',
  '/api/v1',
  '/api/v1/domains',
  '/api/v1/domains/[domain]/emails',
  '/api/v1/lib',
  '/api/v1/sdk/src',
  '/api/v1/sdk/tests/integration',
  '/api/v1/sdk/tests/unit',
  '/api/v1/webhooks',
  '/api/webhooks',
  '/api/webhooks/[id]',
  '/api/webhooks/[id]/test'
]

// Directories to exclude from scanning
const excludedDirs = [
  'node_modules',
  '.next',
  '.git',
  '.vercel',
  'dist',
  'build',
  'coverage',
  '.nyc_output',
  'drizzle'
]

// Function to check if a directory should be excluded
function shouldExcludeDir(dirName: string): boolean {
  return excludedDirs.includes(dirName) || dirName.startsWith('.')
}

// Function to create regex patterns for API routes
function createRoutePattern(route: string): RegExp {
  // Escape special regex characters first
  let pattern = route
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape all special regex chars
    .replace(/\\\[\\\.\\\.\\\..*?\\\]/g, '[^"\'`\\s]*') // Catch-all routes like [...all]
    .replace(/\\\[.*?\\\]/g, '[^/]+') // Dynamic segments like [id]
  
  // Look for the route in various contexts - more specific patterns
  const patterns = [
    `["'\`]${pattern}["'\`]`, // Direct string usage
    `fetch\\s*\\(\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // fetch calls
    `router\\.push\\s*\\(\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // router.push
    `href\\s*=\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // href attributes
    `action\\s*=\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // form actions
    `url:\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // url properties
    `endpoint:\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // endpoint properties
    `\\$\\{[^}]*${pattern}[^}]*\\}`, // Template literals
    `\\+\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // String concatenation
    `baseURL\\s*\\+\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // Base URL concatenation
    `pathname:\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]`, // pathname properties
    `redirect\\s*\\(\\s*["'\`][^"'\`]*${pattern}[^"'\`]*["'\`]` // redirect calls
  ]
  
  return new RegExp(patterns.join('|'), 'g')
}

// Function to recursively scan directory for file usage
function scanDirectory(dir: string, route: string, routePattern: RegExp, currentScriptPath: string): string[] {
  const foundFiles: string[] = []
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        if (!shouldExcludeDir(entry.name)) {
          foundFiles.push(...scanDirectory(fullPath, route, routePattern, currentScriptPath))
        }
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx|md|mdx)$/.test(entry.name)) {
        // Skip the current script file to avoid false positives
        if (fullPath === currentScriptPath) {
          continue
        }
        
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          if (routePattern.test(content)) {
            foundFiles.push(fullPath)
          }
        } catch (error) {
          // Skip files that can't be read
          continue
        }
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
  
  return foundFiles
}

// Main script execution
async function main() {
  log.title('🔍 API Route Scanner')
  log.info('Scanning project for API route usage...')
  
  const currentDir = process.cwd()
  const currentScriptPath = path.resolve(process.argv[1])
  log.dim(`Working directory: ${currentDir}`)
  
  log.section('Scan Results')
  log.info(`Found ${apiRoutes.length} API routes to check`)
  
  const results: { route: string; used: boolean; files: string[] }[] = []
  
  for (const route of apiRoutes) {
    const routePattern = createRoutePattern(route)
    const files = scanDirectory(currentDir, route, routePattern, currentScriptPath)
    results.push({ route, used: files.length > 0, files })
  }
  
  // Display the results
  const usedRoutes = results.filter(r => r.used)
  const unusedRoutes = results.filter(r => !r.used)
  
  if (usedRoutes.length > 0) {
    log.section('Used Routes')
    for (const result of usedRoutes) {
      log.success(`${symbols.used} ${result.route} (${result.files.length} file${result.files.length === 1 ? '' : 's'})`)
      result.files.forEach(file => {
        const relativePath = path.relative(currentDir, file)
        log.dim(`  ${symbols.file} ${relativePath}`)
      })
    }
  }
  
  if (unusedRoutes.length > 0) {
    log.section('Unused Routes')
    for (const result of unusedRoutes) {
      log.warning(`${symbols.unused} ${result.route}`)
    }
  }
  
  log.section('Summary')
  log.info(`Total API routes: ${apiRoutes.length}`)
  log.success(`Used routes: ${usedRoutes.length}`)
  log.warning(`Unused routes: ${unusedRoutes.length}`)
  
  if (unusedRoutes.length > 0) {
    log.dim('\nNote: Some routes might be used dynamically or in ways not detected by this scanner.')
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

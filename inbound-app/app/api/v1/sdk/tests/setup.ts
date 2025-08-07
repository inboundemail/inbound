import dotenv from 'dotenv'

// Load environment variables from .env.test file
dotenv.config({ path: '.env.test' })

// Global test configuration
global.console = {
  ...console,
  // Suppress console.log during tests unless explicitly needed
  log: process.env.TEST_VERBOSE === 'true' ? console.log : (() => {}),
  debug: process.env.TEST_VERBOSE === 'true' ? console.debug : (() => {}),
  info: process.env.TEST_VERBOSE === 'true' ? console.info : (() => {}),
  warn: console.warn,
  error: console.error,
}

// Mock fetch globally for unit tests
global.fetch = (() => {}) as any 
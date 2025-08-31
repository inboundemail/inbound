#!/usr/bin/env node

/**
 * Inbound Kit CLI - Infrastructure as Code for Inbound Email
 */

import { program } from 'commander'
import chalk from 'chalk'
import { pushCommand } from './commands/push.js'
import { pullCommand } from './commands/pull.js'
import { diffCommand } from './commands/diff.js'
import { statusCommand } from './commands/status.js'
import { initCommand } from './commands/init.js'

// Package version
const VERSION = '1.0.0'

// Configure CLI program
program
  .name('inbound-kit')
  .description('Infrastructure as Code CLI for Inbound Email')
  .version(VERSION)

// Global options
program
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-k, --api-key <key>', 'Inbound API key (overrides .env)')
  .option('-u, --base-url <url>', 'API base URL (default: https://inbound.new/api/v2)')
  .option('-v, --verbose', 'Enable verbose output')

// Init command
program
  .command('init')
  .description('Initialize a new Inbound Kit configuration file')
  .option('-f, --force', 'Overwrite existing configuration file')
  .action(async (cmdOptions) => {
    const options = {
      ...program.opts(),
      ...cmdOptions
    }
    await initCommand(options)
  })

// Push command
program
  .command('push')
  .description('Apply configuration to Inbound (create/update/delete resources)')
  .option('-f, --force', 'Apply changes without confirmation')
  .option('-d, --dry-run', 'Show what would be changed without applying')
  .action(async (cmdOptions) => {
    const options = {
      ...program.opts(),
      ...cmdOptions
    }
    await pushCommand(options)
  })

// Pull command  
program
  .command('pull')
  .description('Generate configuration from current Inbound state')
  .option('-f, --force', 'Overwrite existing configuration file without confirmation')
  .option('-d, --dry-run', 'Show what configuration would be generated without writing')
  .action(async (cmdOptions) => {
    const options = {
      ...program.opts(),
      ...cmdOptions
    }
    await pullCommand(options)
  })

// Diff command
program
  .command('diff')
  .description('Show differences between configuration and current state')
  .action(async (cmdOptions) => {
    const options = {
      ...program.opts(),
      ...cmdOptions
    }
    await diffCommand(options)
  })

// Status command
program
  .command('status')
  .description('Show current state of Inbound resources')
  .action(async (cmdOptions) => {
    const options = {
      ...program.opts(),
      ...cmdOptions
    }
    await statusCommand(options)
  })

// Help examples
program.on('--help', () => {
  console.log('')
  console.log(chalk.bold('Examples:'))
  console.log('  $ inbound-kit init                    # Initialize new configuration')
  console.log('  $ inbound-kit status                  # Show current state')
  console.log('  $ inbound-kit diff                    # Show pending changes')
  console.log('  $ inbound-kit push                    # Apply configuration')
  console.log('  $ inbound-kit pull                    # Generate config from current state')
  console.log('')
  console.log(chalk.bold('Configuration:'))
  console.log('  Create inbound.config.ts with your email addresses and endpoints:')
  console.log('')
  console.log(chalk.gray('  export default {'))
  console.log(chalk.gray('    emailAddresses: {'))
  console.log(chalk.gray('      "hello@example.com": "https://api.example.com/webhook",'))
  console.log(chalk.gray('      "support@example.com": ["admin@company.com", "dev@company.com"]'))
  console.log(chalk.gray('    }'))
  console.log(chalk.gray('  }'))
  console.log('')
  console.log(chalk.bold('Authentication:'))
  console.log('  Set INBOUND_API_KEY in your .env file or environment variables')
  console.log('')
})

// Error handling
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n❌ Uncaught exception:'), error.message)
  if (program.opts().verbose) {
    console.error(error.stack)
  }
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('\n❌ Unhandled rejection:'), reason)
  process.exit(1)
})

// Parse command line arguments
program.parse()

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
